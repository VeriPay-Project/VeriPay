"""
LLM-based invoice field extraction using Ollama.

Sends extracted invoice text to a local Ollama model and returns
structured fields for the VeriPay analysis pipeline.

Called from: routers/invoice.py (_run_analysis_pipeline)
"""

import asyncio
import json
import logging
import os
import re
import time

import httpx

logger = logging.getLogger(__name__)

# Ollama connection
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "18"))
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "12h")
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "1536"))
OLLAMA_NUM_THREAD = int(
    os.getenv("OLLAMA_NUM_THREAD", str(min(os.cpu_count() or 8, 12)))
)
OLLAMA_MAX_RETRIES = int(os.getenv("OLLAMA_MAX_RETRIES", "0"))
OLLAMA_MAX_TEXT_CHARS = int(os.getenv("OLLAMA_MAX_TEXT_CHARS", "2200"))

_client = httpx.AsyncClient(timeout=httpx.Timeout(OLLAMA_TIMEOUT, connect=10.0))

# Prompt
PROMPT = """\
You are a precise invoice data extraction engine. Extract fields from the invoice text below.

RULES:
- Return ONLY a JSON object. No markdown, no explanation, no extra text.
- If a field is not found, use null.
- For monetary values: numbers only, no currency symbols, no commas (e.g. "1234.56").
- For dates: keep the original format from the document.
- For bank_account: remove spaces, keep full number.

FIELD DEFINITIONS:

vendor_name: The company/person ISSUING the invoice (seller). Usually at the top or header. NOT the customer.
customer_name: The company/person BEING BILLED (buyer). Often after "Bill To", "Ship To", "Client". Use full name, not an ID.
invoice_number: The invoice reference ID. May appear as "Invoice #", "Invoice No", "Order ID", "Reference".
invoice_date: The date the invoice was issued. Usually near the top, called  date of issue or Date.
total_amount: The FINAL amount due (after tax/shipping). Look for "Total", "Amount Due", "Balance Due".
subtotal: Sum of line items BEFORE tax. Look for "Subtotal", "Sub-total".
tax: Tax amount. Numeric only. Look for "Tax", "GST", "HST", "VAT".
currency: ISO currency code (USD, CAD, EUR, GBP). Only if an ISO code or currency symbol is explicitly visible. Otherwise null.
bank_name: Bank name from payment instructions section.
bank_account: Full account number, IBAN, or combined routing+account. Remove spaces.
  - Canadian format: if you see Institution No + Transit No + Account No separately, combine as "institution-transit-account" (e.g. "003-00123-1234567").
  - US format: if you see Routing + Account separately, combine as "routing-account" (e.g. "011401533-1111222233330000").
  - IBAN: return without spaces (e.g. "GB29NWBK60161331926819").
institution_number: Canadian bank institution code (3 digits, e.g. "003" for RBC). Only if visible.
transit_number: Canadian bank transit/branch number (5 digits). Only if visible.
account_number_raw: The raw account number without routing/institution prefix. Fallback if bank_account cannot be assembled.

Return this exact JSON structure:
{"vendor_name": null, "customer_name": null, "invoice_number": null, "invoice_date": null, "total_amount": null, "subtotal": null, "tax": null, "currency": null, "bank_name": null, "bank_account": null, "institution_number": null, "transit_number": null, "account_number_raw": null}

Invoice text:
"""


def _simplify_text_for_match(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


FIELD_LABELS = {
    "invoice_number": {
        "invoice no",
        "invoice number",
        "invoice id",
        "invoice",
    },
    "invoice_date": {
        "invoice date",
        "date issued",
        "issue date",
        "date",
    },
    "subtotal": {
        "subtotal",
        "sub total",
    },
    "tax": {
        "tax",
        "sales tax",
        "gst",
        "hst",
        "vat",
    },
    "total_amount": {
        "total due",
        "total due usd",
        "amount due",
        "balance due",
        "total amount",
        "total",
    },
    "currency": {
        "currency",
    },
    "bank_name": {
        "bank name",
        "bank",
    },
    "account_name": {
        "account name",
    },
    "account_number_raw": {
        "account no",
        "account number",
        "account",
        "acct no",
        "a c no",
    },
    "routing_number": {
        "aba routing no",
        "aba routing number",
        "routing no",
        "routing number",
        "aba",
    },
    "institution_number": {
        "institution no",
        "institution number",
        "institution code",
    },
    "transit_number": {
        "transit no",
        "transit number",
        "branch transit",
    },
    "customer_name": {
        "bill to",
        "ship to",
        "customer",
        "client",
    },
    "vendor_name": {
        "bill from",
        "vendor",
        "supplier",
        "issuer",
        "seller",
        "from",
    },
}

ALL_KNOWN_LABELS = {
    label for labels in FIELD_LABELS.values() for label in labels
} | {
    "po reference",
    "payment terms",
    "ein",
    "d u n s",
    "swift bic",
    "swift",
    "bic",
    "description",
    "qty",
    "quantity",
    "unit price usd",
    "sales tax",
    "amount usd",
    "wire transfer ach payment details",
    "notes",
    "terms",
    "bill from",
    "bill to",
}

COMPANY_SUFFIXES = (
    "LLC",
    "INC",
    "LTD",
    "LIMITED",
    "CORP",
    "CORPORATION",
    "COMPANY",
    "CO",
    "GROUP",
    "TECHNOLOGIES",
    "SOLUTIONS",
    "SYSTEMS",
    "INDUSTRIES",
    "SERVICES",
    "HOLDINGS",
    "PARTNERS",
    "LABS",
    "BANK",
)

COUNTRY_OR_REGION_LINES = {
    "united states",
    "united kingdom",
    "canada",
    "australia",
    "new zealand",
}

ADDRESS_HINT_PATTERN = re.compile(
    r"\b(?:street|st\b|avenue|ave\b|suite|road|rd\b|boulevard|blvd\b|"
    r"drive|dr\b|lane|ln\b|floor|fl\b|building|unit|po box|postal|"
    r"new york|toronto|london|dubai|singapore|ontario|california|ny\b|"
    r"\bzip\b|\bpostal code\b)\b",
    flags=re.IGNORECASE,
)
EMAIL_OR_URL_PATTERN = re.compile(r"(?:@|https?://|www\.)", flags=re.IGNORECASE)
PHONE_PATTERN = re.compile(r"(?:\+\d|\(\d{3}\)|\d{3}[-. ]\d{3}[-. ]\d{4})")
US_ACCOUNT_PATTERN = re.compile(r"^\d{9}-\d{6,20}$")
CA_ACCOUNT_PATTERN = re.compile(r"^\d{3}-\d{5}-\d{6,20}$")
IBAN_PATTERN = re.compile(r"^[A-Z]{2}\d[A-Z0-9]{13,32}$")

KEY_LINE_PATTERN = re.compile(
    r"(invoice|vendor|supplier|seller|bill to|ship to|customer|client|date|due|"
    r"reference|order|po\b|subtotal|sub-total|tax|gst|hst|vat|total|amount|"
    r"balance|bank|iban|swift|bic|account|routing|transit|institution|payment)",
    flags=re.IGNORECASE,
)
DATE_PATTERN = re.compile(
    r"\b(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|"
    r"[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})\b"
)
AMOUNT_PATTERN = re.compile(r"(?:\$|USD|CAD|EUR|GBP|\b\d+[.,]\d{2}\b)")
ACCOUNT_PATTERN = re.compile(
    r"\b(?:[A-Z]{2}\d[\dA-Z]{12,32}|\d{3}[- ]?\d{5}[- ]?\d{6,20}|"
    r"\d{9}[- ]?\d{6,20}|\d{6,20})\b"
)


def _empty_extraction(status: str = "success", error: str | None = None) -> dict:
    return {
        "vendor_name": None,
        "bank_name": None,
        "bank_account": None,
        "institution_number": None,
        "transit_number": None,
        "account_number_raw": None,
        "invoice_number": None,
        "total_amount": None,
        "customer_name": None,
        "invoice_date": None,
        "subtotal": None,
        "tax": None,
        "currency": None,
        "extraction_status": status,
        "extraction_error": error,
    }


def _focus_invoice_text(text: str) -> str:
    normalized = re.sub(r"\r\n?", "\n", text)
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized).strip()
    if len(normalized) <= OLLAMA_MAX_TEXT_CHARS:
        return normalized

    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    if not lines:
        return normalized[:OLLAMA_MAX_TEXT_CHARS]

    selected_indexes = set(range(min(len(lines), 12)))
    for idx, line in enumerate(lines):
        if (
            KEY_LINE_PATTERN.search(line)
            or DATE_PATTERN.search(line)
            or AMOUNT_PATTERN.search(line)
            or ACCOUNT_PATTERN.search(line)
        ):
            start = max(0, idx - 1)
            end = min(len(lines), idx + 2)
            selected_indexes.update(range(start, end))

    focused = "\n".join(lines[idx] for idx in sorted(selected_indexes)).strip()
    if len(focused) < min(len(normalized), 400):
        focused = "\n".join(lines[:20]).strip()

    return (focused or normalized)[:OLLAMA_MAX_TEXT_CHARS]


def _detect_explicit_currency(text: str) -> str | None:
    upper_text = text.upper()
    if "CAD" in upper_text or "C$" in upper_text:
        return "CAD"
    if "USD" in upper_text or "US$" in upper_text:
        return "USD"
    if "EUR" in upper_text or "\u20ac" in text:
        return "EUR"
    if "GBP" in upper_text or "\u00a3" in text:
        return "GBP"
    return None


def _normalize_currency(value: str) -> str | None:
    upper_value = value.upper()
    for code in ("CAD", "USD", "EUR", "GBP"):
        if code in upper_value:
            return code
    if "\u20ac" in value:
        return "EUR"
    if "\u00a3" in value:
        return "GBP"
    return None


def _is_known_label_line(value: str) -> bool:
    normalized = _simplify_text_for_match(value)
    return normalized in ALL_KNOWN_LABELS


def _split_label_value(line: str) -> tuple[str, str] | None:
    match = re.match(r"^\s*([^:]{1,48}?)\s*[:#-]\s*(.+?)\s*$", line)
    if not match:
        return None

    left, right = match.groups()
    left_normalized = _simplify_text_for_match(left)
    if left_normalized in ALL_KNOWN_LABELS and right.strip():
        return left_normalized, right.strip()
    return None


def _clean_lines(text: str) -> list[str]:
    normalized = re.sub(r"\r\n?", "\n", text or "")
    return [line.strip() for line in normalized.splitlines() if line.strip()]


def _find_label_value(
    lines: list[str],
    labels: set[str],
    *,
    start: int = 0,
    end: int | None = None,
    lookahead: int = 3,
) -> str | None:
    limit = len(lines) if end is None else min(len(lines), end)

    for idx in range(start, limit):
        inline_parts = _split_label_value(lines[idx])
        if inline_parts and inline_parts[0] in labels:
            return inline_parts[1]

        if _simplify_text_for_match(lines[idx]) not in labels:
            continue

        for next_idx in range(idx + 1, min(limit, idx + 1 + lookahead)):
            candidate = lines[next_idx].strip()
            if not candidate or candidate in {":", "-", "—"}:
                continue
            if _is_known_label_line(candidate):
                break
            return candidate
    return None


def _normalize_amount_text(value: str | None) -> str | None:
    if not value:
        return None

    cleaned = re.sub(r"[^0-9.\-]", "", value)
    return cleaned or None


def _normalize_digits(value: str | None) -> str | None:
    if not value:
        return None

    digits = re.sub(r"\D+", "", value)
    return digits or None


def _is_plausible_bank_account(value: str | None) -> bool:
    if not value:
        return False

    compact = re.sub(r"[\s-]+", "", value).upper()
    if not compact:
        return False
    if IBAN_PATTERN.fullmatch(compact):
        return True
    if US_ACCOUNT_PATTERN.fullmatch(value) or CA_ACCOUNT_PATTERN.fullmatch(value):
        return True
    return compact.isdigit() and len(compact) >= 6


def _looks_like_company_name(value: str) -> bool:
    stripped = value.strip()
    if not stripped:
        return False
    if _is_known_label_line(stripped):
        return False
    if EMAIL_OR_URL_PATTERN.search(stripped) or PHONE_PATTERN.search(stripped):
        return False
    if ADDRESS_HINT_PATTERN.search(stripped):
        return False
    if _simplify_text_for_match(stripped) in COUNTRY_OR_REGION_LINES:
        return False
    if any(char.isdigit() for char in stripped):
        return False

    tokens = re.findall(r"[A-Za-z&'.-]+", stripped)
    if len(tokens) < 2:
        return False

    upper = stripped.upper()
    if any(suffix in upper for suffix in COMPANY_SUFFIXES):
        return True

    if len(tokens) >= 3 and any(len(token) > 4 for token in tokens):
        return True

    return False


def _extract_header_vendor_name(lines: list[str]) -> str | None:
    fragments: list[str] = []

    for line in lines[:4]:
        normalized = _simplify_text_for_match(line)
        if normalized in {
            "invoice",
            "tax invoice",
            "bill from",
            "bill to",
        }:
            break
        if EMAIL_OR_URL_PATTERN.search(line) or PHONE_PATTERN.search(line):
            break
        if any(char.isdigit() for char in line):
            break
        fragments.append(line.strip())

    if not fragments:
        return None

    combined = " ".join(fragment for fragment in fragments if fragment)
    return combined if _looks_like_company_name(combined) else None


def _extract_party_candidates(
    lines: list[str],
    vendor_name: str | None,
) -> tuple[str | None, str | None]:
    if not lines:
        return vendor_name, None

    table_start = next(
        (
            idx for idx, line in enumerate(lines)
            if _simplify_text_for_match(line) in {
                "description",
                "wire transfer ach payment details",
            }
        ),
        len(lines),
    )
    metadata_end = max(
        (
            idx for idx, line in enumerate(lines[:table_start])
            if _simplify_text_for_match(line) in {
                "invoice no",
                "invoice number",
                "date issued",
                "invoice date",
                "due date",
                "po reference",
                "payment terms",
                "currency",
                "ein",
                "d u n s",
            }
        ),
        default=-1,
    )
    candidate_lines: list[str] = []
    seen = set()

    for line in lines[metadata_end + 1:table_start]:
        if not _looks_like_company_name(line):
            continue

        compact = re.sub(r"[^A-Z0-9]+", "", line.upper())
        if compact in seen:
            continue
        seen.add(compact)
        candidate_lines.append(line.strip())

    if not candidate_lines:
        return vendor_name, None

    normalized_vendor = (
        re.sub(r"[^A-Z0-9]+", "", vendor_name.upper()) if vendor_name else None
    )
    vendor_candidate = vendor_name
    customer_candidate = None

    if normalized_vendor:
        for idx, candidate in enumerate(candidate_lines):
            normalized_candidate = re.sub(r"[^A-Z0-9]+", "", candidate.upper())
            if normalized_candidate == normalized_vendor:
                vendor_candidate = vendor_candidate or candidate
                if idx + 1 < len(candidate_lines):
                    customer_candidate = candidate_lines[idx + 1]
                break

    if customer_candidate is None and len(candidate_lines) >= 2:
        vendor_candidate = vendor_candidate or candidate_lines[0]
        customer_candidate = candidate_lines[1]
    elif customer_candidate is None and len(candidate_lines) == 1:
        vendor_candidate = vendor_candidate or candidate_lines[0]

    return vendor_candidate, customer_candidate


def _extract_fields_heuristically(text: str) -> dict[str, str | None]:
    lines = _clean_lines(text)
    if not lines:
        return {}

    fields: dict[str, str | None] = {
        "vendor_name": None,
        "customer_name": None,
        "invoice_number": None,
        "invoice_date": None,
        "total_amount": None,
        "subtotal": None,
        "tax": None,
        "currency": None,
        "bank_name": None,
        "bank_account": None,
        "institution_number": None,
        "transit_number": None,
        "account_number_raw": None,
    }

    fields["invoice_number"] = _find_label_value(lines, FIELD_LABELS["invoice_number"])
    fields["invoice_date"] = _find_label_value(lines, FIELD_LABELS["invoice_date"])
    fields["currency"] = _find_label_value(lines, FIELD_LABELS["currency"])
    fields["bank_name"] = _find_label_value(lines, FIELD_LABELS["bank_name"])
    fields["subtotal"] = _normalize_amount_text(
        _find_label_value(lines, FIELD_LABELS["subtotal"])
    )
    fields["tax"] = _normalize_amount_text(
        _find_label_value(lines, FIELD_LABELS["tax"])
    )
    fields["total_amount"] = _normalize_amount_text(
        _find_label_value(lines, FIELD_LABELS["total_amount"])
    )
    fields["institution_number"] = _normalize_digits(
        _find_label_value(lines, FIELD_LABELS["institution_number"])
    )
    fields["transit_number"] = _normalize_digits(
        _find_label_value(lines, FIELD_LABELS["transit_number"])
    )

    routing_number = _normalize_digits(
        _find_label_value(lines, FIELD_LABELS["routing_number"])
    )
    account_number = _normalize_digits(
        _find_label_value(lines, FIELD_LABELS["account_number_raw"])
    )
    fields["account_number_raw"] = account_number

    if routing_number and account_number:
        fields["bank_account"] = f"{routing_number}-{account_number}"
    elif account_number:
        fields["bank_account"] = account_number

    header_vendor = _extract_header_vendor_name(lines)
    vendor_candidate, customer_candidate = _extract_party_candidates(
        lines,
        header_vendor,
    )
    fields["vendor_name"] = vendor_candidate or header_vendor
    fields["customer_name"] = customer_candidate

    return fields


def _normalize_field_value(field_name: str, value: object) -> str | None:
    if value is None:
        return None

    clean = str(value).strip()
    if not clean or clean.lower() in {"null", "none", "n/a"}:
        return None

    if field_name in {"total_amount", "subtotal", "tax"}:
        clean = re.sub(r"[^0-9.\-]", "", clean)
        return clean or None

    if field_name == "currency":
        return _normalize_currency(clean)

    if field_name in {"bank_account", "account_number_raw"}:
        clean = re.sub(r"\s+", "", clean)
        return clean or None

    if field_name == "institution_number":
        digits = re.sub(r"\D+", "", clean)
        return digits if len(digits) == 3 else clean

    if field_name == "transit_number":
        digits = re.sub(r"\D+", "", clean)
        return digits if len(digits) == 5 else clean

    return clean


async def _post_ollama(payload: dict) -> httpx.Response:
    for attempt in range(OLLAMA_MAX_RETRIES + 1):
        try:
            return await _client.post(OLLAMA_URL, json=payload)
        except httpx.TimeoutException:
            if attempt >= OLLAMA_MAX_RETRIES:
                raise
            logger.warning(
                "Ollama timeout attempt %d/%d. Retrying.",
                attempt + 1,
                OLLAMA_MAX_RETRIES + 1,
            )
            await asyncio.sleep(1)


async def extract_invoice_fields(text: str) -> dict:
    """
    Main entry point. Takes OCR/extracted text, returns structured fields.

    Always returns a dict with extraction_status and extraction_error keys.
    """
    source_text = (text or "").strip()
    if not source_text:
        return _empty_extraction(status="success")

    heuristic_fields = _extract_fields_heuristically(source_text)
    focused_text = _focus_invoice_text(source_text)
    prompt = PROMPT + focused_text

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": {
            "temperature": 0,
            "num_ctx": OLLAMA_NUM_CTX,
            "num_thread": OLLAMA_NUM_THREAD,
            "num_predict": 160,
        },
    }

    started_at = time.perf_counter()

    try:
        resp = await _post_ollama(payload)
    except httpx.TimeoutException:
        logger.error("Ollama timed out after %.0fs (%s)", OLLAMA_TIMEOUT, OLLAMA_URL)
        return _empty_extraction(
            status="failed",
            error=f"Ollama timed out after {OLLAMA_TIMEOUT:.0f}s",
        )
    except httpx.RequestError as exc:
        logger.error("Ollama connection failed (%s): %s", OLLAMA_URL, exc)
        return _empty_extraction(
            status="failed",
            error=f"Ollama unreachable: {type(exc).__name__}",
        )

    if resp.status_code != 200:
        logger.error("Ollama HTTP %d: %s", resp.status_code, resp.text[:500])
        return _empty_extraction(status="failed", error=f"Ollama HTTP {resp.status_code}")

    data = resp.json()
    response_obj = data.get("response")
    parsed = None

    if isinstance(response_obj, dict):
        parsed = response_obj
    elif isinstance(response_obj, str):
        cleaned = response_obj.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
            if match:
                try:
                    parsed = json.loads(match.group(0))
                except json.JSONDecodeError:
                    parsed = None

    if not isinstance(parsed, dict):
        logger.error("Could not parse Ollama response as JSON: %.200s", response_obj)
        return _empty_extraction(status="failed", error="LLM response was not valid JSON")

    field_map = {
        "vendor_name": ["vendor_name"],
        "bank_name": ["bank_name"],
        "bank_account": ["bank_account"],
        "institution_number": ["institution_number"],
        "transit_number": ["transit_number"],
        "account_number_raw": ["account_number_raw"],
        "invoice_number": ["invoice_number"],
        "total_amount": ["total_amount", "total"],
        "customer_name": ["customer_name"],
        "invoice_date": ["invoice_date"],
        "subtotal": ["subtotal"],
        "tax": ["tax"],
        "currency": ["currency"],
    }

    result = _empty_extraction(status="success")
    explicit_currency = _detect_explicit_currency(source_text)

    for our_key, candidates in field_map.items():
        for candidate in candidates:
            clean = _normalize_field_value(our_key, parsed.get(candidate))
            if clean is not None:
                result[our_key] = clean
                break

    for our_key, heuristic_value in heuristic_fields.items():
        clean = _normalize_field_value(our_key, heuristic_value)
        if clean is None:
            continue

        current_value = result.get(our_key)
        if current_value is None:
            result[our_key] = clean
            continue

        if our_key == "bank_account" and not _is_plausible_bank_account(current_value):
            result[our_key] = clean

    result["currency"] = explicit_currency or result["currency"]
    if result["bank_account"] and not _is_plausible_bank_account(result["bank_account"]):
        result["bank_account"] = None

    if result["bank_account"] is None and result["account_number_raw"] is not None:
        result["bank_account"] = result["account_number_raw"]

    if result["bank_account"] is None and heuristic_fields.get("bank_account"):
        result["bank_account"] = _normalize_field_value(
            "bank_account",
            heuristic_fields["bank_account"],
        )

    if result["bank_name"] is None:
        result["bank_name"] = _normalize_field_value(
            "bank_name",
            heuristic_fields.get("bank_name"),
        )

    if result["customer_name"] is None:
        result["customer_name"] = _normalize_field_value(
            "customer_name",
            heuristic_fields.get("customer_name"),
        )

    populated_fields = sum(
        1 for key, value in result.items()
        if value is not None and not key.startswith("extraction_")
    )
    logger.info(
        "Ollama extraction complete in %.2fs with %d fields populated "
        "(model=%s, source_len=%d, focused_len=%d)",
        time.perf_counter() - started_at,
        populated_fields,
        OLLAMA_MODEL,
        len(source_text),
        len(focused_text),
    )
    return result


async def extract_invoice_semantic(text: str) -> dict:
    """Compatibility alias for older scripts/tests."""
    return await extract_invoice_fields(text)
