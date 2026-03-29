from services.bank_utils import detect_account_type, hash_account, mask_account, normalize_account_by_country


def prepare_account_for_storage(
    raw_identifier: str,
    country: str | None = None,
):
    _, detected_country = detect_account_type(raw_identifier)
    resolved_country = country or detected_country
    normalized = normalize_account_by_country(resolved_country, raw_identifier)

    if not normalized:
        return {"normalized": None, "masked": None, "hash": None}

    return {
        "normalized": normalized,
        "masked": mask_account(normalized),
        "hash": hash_account(normalized),
    }
