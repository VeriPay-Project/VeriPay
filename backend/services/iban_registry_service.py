import requests
import os


IBAN_API_KEY = os.getenv("IBAN_API_KEY")  # optional if using paid API


def verify_iban_external(iban: str) -> dict:
    """
    External IBAN verification (basic)
    Using open IBAN API (can swap later)
    """

    if not iban:
        return {
            "success": False,
            "reason": "No IBAN provided"
        }

    try:
        # Example free API (no key required)
        url = f"https://openiban.com/validate/{iban}?getBIC=true&validateBankCode=true"

        response = requests.get(url, timeout=5)
        data = response.json()

        if not data.get("valid"):
            return {
                "success": False,
                "reason": "IBAN failed external validation"
            }

        return {
            "success": True,
            "iban": iban,
            "bank_name": data.get("bankData", {}).get("name"),
            "bic": data.get("bankData", {}).get("bic"),
            "country": data.get("countryCode"),
            "confidence": "medium"
        }

    except Exception as e:
        return {
            "success": False,
            "reason": f"External verification failed: {str(e)}"
        }