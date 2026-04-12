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


# Known Canadian financial institution numbers
# Source: Payments Canada / CPA member list
KNOWN_CA_INSTITUTIONS: set[str] = {
    "001",  # BMO
    "002",  # BNS (Scotiabank)
    "003",  # RBC
    "004",  # TD
    "006",  # NBC (National Bank of Canada)
    "010",  # CIBC
    "016",  # HSBC Canada
    "030",  # CIBC / Simplii Financial
    "039",  # Laurentian Bank
    "219",  # ATB Financial
    "310",  # PC Financial
    "614",  # Tangerine
    "815",  # Desjardins
    "828",  # Central 1 Credit Union
    "829",  # QCU (Québec Credit Unions)
    "837",  # Meridian Credit Union
    "839",  # ACU (Atlantic Credit Union)
    "865",  # Motus Bank
    "879",  # DC Payments
    "899",  # CWB (Canadian Western Bank)
}


def validate_canadian_account(parsed: dict) -> dict:
    """
    Validate a Canadian bank account.
    Expects parsed to contain: institution, transit, account.
    """
    errors = []

    institution = str(parsed.get("institution") or "").strip()
    transit = str(parsed.get("transit") or "").strip()
    account = str(parsed.get("account") or "").strip()

    # Institution number: exactly 3 digits
    if not re.fullmatch(r"\d{3}", institution):
        errors.append(
            f"Institution number must be exactly 3 digits, got '{institution}'"
        )
    elif institution not in KNOWN_CA_INSTITUTIONS:
        errors.append(
            f"Unrecognized institution number '{institution}'. "
            "Not in the known Canadian financial institutions list."
        )

    # Transit number: exactly 5 digits
    if not re.fullmatch(r"\d{5}", transit):
        errors.append(
            f"Transit number must be exactly 5 digits, got '{transit}'"
        )

    # Account number: 7–12 digits
    if not re.fullmatch(r"\d{7,12}", account):
        errors.append(
            f"Account number must be 7-12 digits, got '{account}'"
        )

    if errors:
        return {"valid": False, "reason": "; ".join(errors)}

    return {"valid": True, "reason": None}


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
        return validate_canadian_account(parsed)

    return {
        "valid": False,
        "reason": "Unsupported country"
    }
