from sqlalchemy.orm import Session
import re

from models.vendor import Vendor
from models.vendor_bank_binding import VendorBankBinding


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


def _normalize_account(account: str | None) -> str | None:
    if not account:
        return None
    normalized = str(account).replace(" ", "").replace("-", "")
    return normalized or None


def _mask_account(account: str | None) -> str | None:
    if not account:
        return None
    if len(account) <= 8:
        return account
    return f"{account[:4]}{'*' * (len(account) - 8)}{account[-4:]}"


def verify_vendor_bank_account(
    db: Session,
    vendor_name: str | None,
    bank_account: str | None
) -> dict:
    vendor_identity_status = "vendor_not_detected"
    bank_account_detected = False
    verification_status = "not_applicable"
    masked_account = None
    bank_name = None

    vendor_name_clean = vendor_name if isinstance(vendor_name, str) else None
    vendor_name_clean = vendor_name_clean.strip() if vendor_name_clean else None

    vendor = None
    if vendor_name_clean:
        vendor = db.query(Vendor).filter(
            Vendor.vendor_name == vendor_name_clean
        ).first()

        if vendor:
            vendor_identity_status = "vendor_verified"
        else:
            vendor_identity_status = "vendor_unknown"

    account_norm = _normalize_account(bank_account)
    if account_norm:
        bank_account_detected = True
        masked_account = _mask_account(account_norm)

    if vendor and account_norm:
        binding = db.query(VendorBankBinding).filter(
            VendorBankBinding.vendor_id == vendor.vendor_id,
            VendorBankBinding.account_hash == account_norm,
            VendorBankBinding.is_active == True
        ).first()

        if binding:
            verification_status = "verified"
            bank_name = binding.bank_name
            if binding.account_masked:
                masked_account = binding.account_masked
        else:
            verification_status = "bank_mismatch"

    return {
        "vendor_identity_status": vendor_identity_status,
        "bank_account_detected": bank_account_detected,
        "verification_status": verification_status,
        "status": verification_status,
        "masked_account": masked_account,
        "bank_name": bank_name
    }
