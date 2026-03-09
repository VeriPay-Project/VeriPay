import hashlib
import hmac
import os
import re


BANK_HASH_SECRET = os.getenv("BANK_HASH_SECRET", "dev-bank-secret").encode("utf-8")


def normalize_iban(value: str) -> str:
    if not value:
        return None

    normalized = value.strip().replace(" ", "").replace("-", "").upper()
    return normalized or None


def normalize_account_number(value: str) -> str:
    if not value:
        return None

    cleaned = value.strip().replace(" ", "").replace("-", "")
    normalized = "".join(ch for ch in cleaned if ch.isalnum())
    return normalized or None


def mask_account(value: str) -> str:
    if not value or len(value) <= 8:
        return "***"

    return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"


def _looks_like_iban(value: str) -> bool:
    return bool(re.fullmatch(r"[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}", value))


def _normalize_identifier(value: str) -> str:
    if not value or not value.strip():
        return None

    iban_candidate = normalize_iban(value)
    if iban_candidate and _looks_like_iban(iban_candidate):
        return iban_candidate

    return normalize_account_number(value)


def hash_account_identifier(identifier: str) -> str:
    normalized = _normalize_identifier(identifier)
    if not normalized:
        return None

    return hmac.new(
        BANK_HASH_SECRET,
        normalized.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def prepare_account_for_storage(raw_identifier: str):
    normalized = _normalize_identifier(raw_identifier)
    if not normalized:
        return {"normalized": None, "masked": None, "hash": None}

    return {
        "normalized": normalized,
        "masked": mask_account(normalized),
        "hash": hash_account_identifier(normalized),
    }
