import re

def validate_iban(iban: str) -> bool:
    if not iban:
        return False

    iban = iban.replace(" ", "").upper()

    # 🔹 Step 1: Basic regex format check
    if not re.fullmatch(r"[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}", iban):
        return False

    # 🔹 Step 2: Length check (redundant but safe)
    if len(iban) < 15 or len(iban) > 34:
        return False

    # 🔹 Step 3: Move first 4 chars
    rearranged = iban[4:] + iban[:4]

    # 🔹 Step 4: Convert letters → numbers
    converted = ""
    for ch in rearranged:
        if ch.isdigit():
            converted += ch
        else:
            converted += str(ord(ch) - 55)

    # 🔹 Step 5: mod-97
    return int(converted) % 97 == 1


def validate_us_routing(routing: str) -> bool:
    """
    US routing number checksum validation
    """
    if not routing or len(routing) != 9 or not routing.isdigit():
        return False

    digits = list(map(int, routing))

    checksum = (
        3 * (digits[0] + digits[3] + digits[6]) +
        7 * (digits[1] + digits[4] + digits[7]) +
        1 * (digits[2] + digits[5] + digits[8])
    )

    return checksum % 10 == 0


def validate_account(country: str, parsed: dict) -> dict:
    """
    Main validation entry
    """
    country = country.upper() if isinstance(country, str) else country

    if country == "US":
        routing_valid = validate_us_routing(parsed.get("routing"))
        return {
            "valid": routing_valid,
            "reason": None if routing_valid else "Invalid routing number"
        }

    if country == "OTHER":
        iban_valid = validate_iban(parsed.get("iban"))
        return {
            "valid": iban_valid,
            "reason": None if iban_valid else "Invalid IBAN checksum"
        }

    if country == "CA":
        # For now: basic structure already validated
        return {
            "valid": True,
            "reason": None
        }

    return {
        "valid": False,
        "reason": "Unsupported country"
    }
