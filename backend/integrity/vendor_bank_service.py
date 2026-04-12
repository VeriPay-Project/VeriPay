import logging
import re

from sqlalchemy.orm import Session

from models.vendor import Vendor
from models.vendor_bank_binding import VendorBankBinding
from services.bank_utils import (
    detect_account_type,
    hash_account,
    mask_account,
    normalize_account_by_country,
)

logger = logging.getLogger(__name__)


def extract_bank_identifier(text: str) -> str | None:
    if not text:
        return None

    iban_match = re.search(r"[A-Z]{2}[0-9A-Z]{13,32}", text.upper())
    if iban_match:
        return iban_match.group(0)

    account_match = re.search(
        r"account\s*[:-]?\s*([0-9- ]{6,20})",
        text,
        flags=re.IGNORECASE
    )
    if account_match:
        return account_match.group(1).strip()

    return None


def verify_vendor_bank_account(
    db: Session,
    vendor_name: str | None,
    bank_account: str | None,
    country: str | None,
    account_type: str | None,
) -> dict:
    vendor_identity_status = "vendor_unknown"
    bank_account_detected = False
    verification_status = "not_applicable"
    masked_account = None
    bank_name = None

    vendor_name_clean = vendor_name if isinstance(vendor_name, str) else None
    vendor_name_clean = vendor_name_clean.strip() if vendor_name_clean else None

    detected_account_type, detected_country = detect_account_type(bank_account)
    resolved_country = country or detected_country
    resolved_account_type = account_type or detected_account_type

    account_norm = normalize_account_by_country(resolved_country, bank_account)
    account_hash_value = hash_account(account_norm) if account_norm else None
    if account_norm:
        bank_account_detected = True
        masked_account = mask_account(account_norm)

    if not vendor_name_clean:
        return {
            "vendor_identity_status": vendor_identity_status,
            "bank_account_detected": bank_account_detected,
            "verification_status": verification_status,
            "status": verification_status,
            "masked_account": masked_account,
            "bank_name": bank_name,
            "country": resolved_country,
            "account_type": resolved_account_type,
        }

    vendor = db.query(Vendor).filter(
        Vendor.vendor_name == vendor_name_clean
    ).first()

    if not vendor:
        return {
            "vendor_identity_status": "vendor_unknown",
            "bank_account_detected": bank_account_detected,
            "verification_status": "not_applicable",
            "status": "not_applicable",
            "masked_account": masked_account,
            "bank_name": bank_name,
            "country": resolved_country,
            "account_type": resolved_account_type,
        }

    vendor_identity_status = "vendor_verified"

    bindings = db.query(VendorBankBinding).filter(
        VendorBankBinding.vendor_id == vendor.vendor_id,
        VendorBankBinding.is_active == True,
    ).all()

    if not account_norm or not resolved_country:
        if not bindings:
            verification_status = "no_bank_registered"
        return {
            "vendor_identity_status": vendor_identity_status,
            "bank_account_detected": bank_account_detected,
            "verification_status": verification_status,
            "status": verification_status,
            "masked_account": masked_account,
            "bank_name": bank_name,
            "country": resolved_country,
            "account_type": resolved_account_type,
        }

    match = None
    logger.debug("Bank verification — invoice account: %s", account_norm)
    for binding in bindings:
        logger.debug("  stored: %s (hash: %s)", binding.account_normalized, binding.account_hash)
        if (
            binding.account_hash == account_hash_value
            and binding.country == resolved_country
        ):
            match = binding
            break
    logger.debug("  invoice hash: %s", account_hash_value)

    if match:
        if match.verification_reference == "plaid":
            verification_status = "verified_high_trust"
        else:
            verification_status = "verified"
        bank_name = match.bank_name
        if match.account_masked:
            masked_account = match.account_masked
    elif bindings:
        logger.warning(
            "Bank mismatch — invoice: %s, expected: %s",
            account_norm,
            [b.account_normalized for b in bindings],
        )
        verification_status = "bank_mismatch"
    else:
        verification_status = "no_bank_registered"

    return {
        "vendor_identity_status": vendor_identity_status,
        "bank_account_detected": bank_account_detected,
        "verification_status": verification_status,
        "status": verification_status,
        "masked_account": masked_account,
        "bank_name": bank_name,
        "country": resolved_country,
        "account_type": resolved_account_type,
    }
