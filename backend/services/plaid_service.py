import os
import uuid


class PlaidServiceError(Exception):
    pass


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    return value.strip().lower() in {"1", "true", "yes", "on"}


def _plaid_enabled() -> bool:
    return os.getenv("OPEN_BANKING_PROVIDER", "").strip().lower() == "plaid"


def _mock_enabled() -> bool:
    return _env_bool("OPEN_BANKING_FALLBACK_TO_MOCK", False)


def _get_base_url() -> str:
    base_url = os.getenv("PLAID_BASE_URL")
    if base_url:
        return base_url.rstrip("/")

    plaid_env = os.getenv("PLAID_ENV", "").strip().lower()
    if plaid_env == "sandbox":
        return "https://sandbox.plaid.com"
    if plaid_env == "development":
        return "https://development.plaid.com"
    if plaid_env == "production":
        return "https://production.plaid.com"

    raise PlaidServiceError("PLAID_BASE_URL is not configured")


def _get_auth_payload() -> dict:
    client_id = os.getenv("PLAID_CLIENT_ID")
    secret = os.getenv("PLAID_SECRET")

    if not client_id or not secret:
        raise PlaidServiceError("Plaid credentials are not configured")

    return {
        "client_id": client_id,
        "secret": secret,
    }


def _mock_link_token() -> str:
    return f"link-mock-{uuid.uuid4()}"


def _mock_exchange(public_token: str) -> dict:
    token_fragment = public_token[-12:] if public_token else uuid.uuid4().hex[:12]
    return {
        "access_token": f"access-mock-{token_fragment}",
        "item_id": f"item-mock-{token_fragment}",
    }


def _mock_account_data(access_token: str) -> dict:
    token_hint = access_token.lower() if access_token else ""
    if "ca" in token_hint:
        return {
            "country": "CA",
            "account_number": "111122223333",
            "routing_number": None,
            "institution_number": "021",
            "transit_number": "01140",
            "iban": None,
            "bank_name": "Mock Plaid Canada",
        }

    return {
        "country": "US",
        "account_number": "9900009606",
        "routing_number": "011401533",
        "institution_number": None,
        "transit_number": None,
        "iban": None,
        "bank_name": "Mock Plaid Bank",
    }


def _post_plaid(path: str, payload: dict) -> dict:
    if not _plaid_enabled():
        if _mock_enabled():
            raise PlaidServiceError("MOCK_MODE")
        raise PlaidServiceError("Open banking provider is not plaid")

    try:
        import requests
    except ModuleNotFoundError as exc:
        if _mock_enabled():
            raise PlaidServiceError("MOCK_MODE") from exc
        raise PlaidServiceError("The 'requests' package is not installed") from exc

    request_payload = {
        **_get_auth_payload(),
        **payload,
    }

    try:
        response = requests.post(
            f"{_get_base_url()}{path}",
            json=request_payload,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        if _mock_enabled():
            raise PlaidServiceError("MOCK_MODE") from exc
        raise PlaidServiceError(f"Plaid request failed: {exc}") from exc


def create_link_token(user_id: str) -> str:
    payload = {
        "client_name": os.getenv("PLAID_CLIENT_NAME", "VeriPay"),
        "user": {"client_user_id": user_id},
        "products": ["auth"],
        "country_codes": ["US", "CA"],
        "language": "en",
    }

    try:
        data = _post_plaid("/link/token/create", payload)
        link_token = data.get("link_token")
        if not link_token:
            raise PlaidServiceError("Plaid did not return a link token")
        return link_token
    except PlaidServiceError as exc:
        if str(exc) == "MOCK_MODE":
            return _mock_link_token()
        raise


def exchange_public_token(public_token: str) -> dict:
    if not public_token:
        raise PlaidServiceError("public_token is required")

    try:
        data = _post_plaid(
            "/item/public_token/exchange",
            {"public_token": public_token},
        )
        access_token = data.get("access_token")
        item_id = data.get("item_id")
        if not access_token or not item_id:
            raise PlaidServiceError("Plaid did not return access token data")
        return {
            "access_token": access_token,
            "item_id": item_id,
        }
    except PlaidServiceError as exc:
        if str(exc) == "MOCK_MODE":
            return _mock_exchange(public_token)
        raise


def get_account_data(access_token: str) -> dict:
    if not access_token:
        raise PlaidServiceError("access_token is required")

    try:
        data = _post_plaid("/auth/get", {"access_token": access_token})
    except PlaidServiceError as exc:
        if str(exc) == "MOCK_MODE":
            return _mock_account_data(access_token)
        raise

    accounts = data.get("accounts") or []
    account_lookup = {account.get("account_id"): account for account in accounts if account.get("account_id")}
    numbers = data.get("numbers") or {}
    item = data.get("item") or {}

    eft_numbers = numbers.get("eft") or []
    if eft_numbers:
        eft = eft_numbers[0]
        account_id = eft.get("account_id")
        account_meta = account_lookup.get(account_id, {})
        return {
            "country": "CA",
            "account_number": eft.get("account"),
            "routing_number": None,
            "institution_number": eft.get("institution"),
            "transit_number": eft.get("branch"),
            "iban": None,
            "bank_name": item.get("institution_name") or account_meta.get("official_name") or account_meta.get("name"),
        }

    ach_numbers = numbers.get("ach") or []
    if ach_numbers:
        ach = ach_numbers[0]
        account_id = ach.get("account_id")
        account_meta = account_lookup.get(account_id, {})
        return {
            "country": "US",
            "account_number": ach.get("account"),
            "routing_number": ach.get("routing"),
            "institution_number": None,
            "transit_number": None,
            "iban": None,
            "bank_name": item.get("institution_name") or account_meta.get("official_name") or account_meta.get("name"),
        }

    international_numbers = numbers.get("international") or []
    if international_numbers:
        international = international_numbers[0]
        account_id = international.get("account_id")
        account_meta = account_lookup.get(account_id, {})
        return {
            "country": "OTHER",
            "account_number": None,
            "routing_number": None,
            "institution_number": None,
            "transit_number": None,
            "iban": international.get("iban"),
            "bank_name": item.get("institution_name") or account_meta.get("official_name") or account_meta.get("name"),
        }

    raise PlaidServiceError("Plaid did not return supported account details")
