import hashlib
import hmac
import os
import re


_bank_hash_secret_str = os.getenv("BANK_HASH_SECRET")
if not _bank_hash_secret_str:
    raise RuntimeError("BANK_HASH_SECRET environment variable is required")
BANK_HASH_SECRET = _bank_hash_secret_str.encode("utf-8")
_IBAN_RE = re.compile(r"^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$")


def _clean_account_text(account: str | None) -> str | None:
    if not isinstance(account, str):
        return None

    cleaned = account.strip().upper()
    return cleaned or None


def _compact_account(account: str | None) -> str | None:
    cleaned = _clean_account_text(account)
    if not cleaned:
        return None

    compact = re.sub(r"[^A-Z0-9]", "", cleaned)
    return compact or None


def _split_account_tokens(account: str | None) -> list[str]:
    cleaned = _clean_account_text(account)
    if not cleaned:
        return []

    return [token for token in re.split(r"[^A-Z0-9]+", cleaned) if token]


def _normalize_country(country: str | None) -> str | None:
    if not isinstance(country, str):
        return None

    cleaned = country.strip().upper()
    return cleaned or None


def _validate_us_routing_checksum(routing: str) -> bool:
    if not routing or len(routing) != 9 or not routing.isdigit():
        return False

    digits = [int(ch) for ch in routing]
    checksum = (
        3 * (digits[0] + digits[3] + digits[6]) +
        7 * (digits[1] + digits[4] + digits[7]) +
        1 * (digits[2] + digits[5] + digits[8])
    )
    return checksum % 10 == 0


def _normalize_ca_account(account: str | None) -> str | None:
    parts = _split_account_tokens(account)
    compact = _compact_account(account)

    if len(parts) == 3 and all(part.isdigit() for part in parts):
        institution, transit, account_number = parts
    elif compact and compact.isdigit() and len(compact) > 8:
        institution = compact[:3]
        transit = compact[3:8]
        account_number = compact[8:]
    else:
        return None

    if len(institution) != 3 or len(transit) != 5:
        return None
    if not account_number or not account_number.isdigit():
        return None

    return f"{institution}-{transit}-{account_number}"


def _normalize_us_account(account: str | None) -> str | None:
    parts = _split_account_tokens(account)
    compact = _compact_account(account)

    if len(parts) == 2 and all(part.isdigit() for part in parts):
        routing, account_number = parts
    elif compact and compact.isdigit() and len(compact) > 9:
        routing = compact[:9]
        account_number = compact[9:]
    else:
        return None

    if len(routing) != 9 or not routing.isdigit():
        return None
    if not account_number or not account_number.isdigit():
        return None

    return f"{routing}-{account_number}"


def detect_account_type(account: str | None) -> tuple[str | None, str | None]:
    compact = _compact_account(account)
    if not compact:
        return None, None

    if _IBAN_RE.fullmatch(compact):
        return "iban", "OTHER"

    ca_normalized = _normalize_ca_account(account)
    if ca_normalized and len(_split_account_tokens(account)) == 3:
        return "local", "CA"

    us_normalized = _normalize_us_account(account)
    if us_normalized and len(_split_account_tokens(account)) == 2:
        return "local", "US"

    if us_normalized:
        routing = us_normalized.split("-", 1)[0]
        if _validate_us_routing_checksum(routing):
            return "local", "US"

    if ca_normalized:
        return "local", "CA"

    return None, None


def normalize_account_by_country(
    country: str | None,
    account: str | None,
) -> str | None:
    normalized_country = _normalize_country(country)

    if normalized_country == "CA":
        return _normalize_ca_account(account)

    if normalized_country == "US":
        return _normalize_us_account(account)

    if normalized_country == "OTHER":
        compact = _compact_account(account)
        if compact and _IBAN_RE.fullmatch(compact):
            return compact
        return None

    detected_account_type, detected_country = detect_account_type(account)
    if detected_country:
        return normalize_account_by_country(detected_country, account)

    compact = _compact_account(account)
    if detected_account_type == "iban":
        return compact

    return compact or None


def hash_account(value: str | None) -> str | None:
    if not value:
        return None

    return hmac.new(
        BANK_HASH_SECRET,
        value.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def mask_account(value: str | None) -> str | None:
    if not value:
        return None

    if len(value) <= 8:
        return "*" * len(value)

    return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"


def get_test_invoice_from_binding(binding) -> dict[str, str | None]:
    normalized = getattr(binding, "account_normalized", None)
    if not isinstance(normalized, str) or not normalized:
        return {
            "routing_number": None,
            "account_number": None,
        }

    parts = normalized.split("-")
    if len(parts) < 2:
        return {
            "routing_number": None,
            "account_number": normalized,
        }

    return {
        "routing_number": parts[0],
        "account_number": "-".join(parts[1:]),
    }
