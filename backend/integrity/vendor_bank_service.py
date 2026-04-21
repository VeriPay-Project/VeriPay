import logging
import re
from difflib import SequenceMatcher

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

_LEGAL_SUFFIXES = {
    "co",
    "company",
    "corp",
    "corporation",
    "inc",
    "incorporated",
    "llc",
    "ltd",
    "limited",
}


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


def _vendor_name_tokens(value: str | None) -> list[str]:
    if not isinstance(value, str):
        return []

    cleaned = re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()
    if not cleaned:
        return []

    tokens = [token for token in cleaned.split() if token not in _LEGAL_SUFFIXES]
    return tokens or cleaned.split()


def _compact_vendor_name(value: str | None) -> str | None:
    tokens = _vendor_name_tokens(value)
    compact = "".join(tokens)
    return compact or None


def _compact_masked_account(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None

    compact = re.sub(r"[^A-Z0-9*]+", "", value.strip().upper())
    return compact or None


def _vendor_match_score(search_value: str | None, candidate_value: str | None) -> int:
    search_compact = _compact_vendor_name(search_value)
    candidate_compact = _compact_vendor_name(candidate_value)
    if not search_compact or not candidate_compact:
        return 0

    if search_compact == candidate_compact:
        return 100
    if search_compact in candidate_compact or candidate_compact in search_compact:
        return 90

    search_tokens = set(_vendor_name_tokens(search_value))
    candidate_tokens = set(_vendor_name_tokens(candidate_value))
    if search_tokens and candidate_tokens:
        shared_tokens = search_tokens & candidate_tokens
        token_coverage = len(shared_tokens) / max(len(search_tokens), len(candidate_tokens))
        if token_coverage >= 0.75:
            return 85
        if token_coverage >= 0.5 and len(shared_tokens) >= 2:
            return 75

    ratio = SequenceMatcher(None, search_compact, candidate_compact).ratio()
    return int(ratio * 100)


def _find_vendor_by_name(db: Session, vendor_name: str | None) -> Vendor | None:
    if not isinstance(vendor_name, str) or not vendor_name.strip():
        return None

    vendor_name_clean = vendor_name.strip()
    exact_vendor = db.query(Vendor).filter(
        Vendor.vendor_name == vendor_name_clean
    ).first()
    if exact_vendor:
        return exact_vendor

    vendors = db.query(Vendor).filter(Vendor.status == "active").all()
    best_vendor = None
    best_score = 0
    for vendor in vendors:
        score = _vendor_match_score(vendor_name_clean, vendor.vendor_name)
        if score > best_score:
            best_vendor = vendor
            best_score = score

    if best_vendor and best_score >= 75:
        logger.info(
            "Vendor fuzzy match: extracted=%r matched=%r score=%s",
            vendor_name_clean,
            best_vendor.vendor_name,
            best_score,
        )
        return best_vendor

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
    resolved_country = resolved_country.upper() if isinstance(resolved_country, str) else None
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

    vendor = _find_vendor_by_name(db, vendor_name_clean)

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
    masked_normalized_account = mask_account(account_norm) if account_norm else None
    normalized_masked_account = _compact_masked_account(masked_normalized_account)
    logger.debug("Bank verification — invoice account: %s", account_norm)
    for binding in bindings:
        logger.debug("  stored: %s (hash: %s)", binding.account_normalized, binding.account_hash)
        binding_country = binding.country.upper() if isinstance(binding.country, str) else None
        country_matches = binding_country == resolved_country
        account_matches = any(
            (
                account_hash_value and binding.account_hash == account_hash_value,
                account_norm and binding.account_normalized == account_norm,
                normalized_masked_account
                and _compact_masked_account(binding.account_masked) == normalized_masked_account,
            )
        )
        if country_matches and account_matches:
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
