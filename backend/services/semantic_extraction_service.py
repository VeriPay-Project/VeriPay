import json
import os
import re
import requests

# ── Schema inlined — no external dependency needed ─────────────────────────────
INVOICE_SCHEMA = {
    "invoice_number": "string or null",
    "vendor_name": "string or null",
    "customer_name": "string or null",
    "invoice_date": "string or null",
    "subtotal": "number or null",
    "tax": "number or null",
    "total": "number or null",
    "total_amount": "number or null",
    "currency": "string or null",
    "bank_name": "string or null",
    "bank_account": "string or null",
    "institution_number": "string or null",
    "transit_number": "string or null",
    "account_number_raw": "string or null",
}

PROMPT_TEMPLATE = """
You are an intelligent invoice field extraction engine.

Your job is to extract structured invoice data from raw invoice text.

Return ONLY a valid JSON object.
No explanations.
No markdown.
No text before or after JSON.
If a field is missing, return null.

Do NOT rely only on explicit keywords.
Use document structure, layout patterns, numeric patterns, and contextual meaning.

Extraction Guidelines:

1. invoice_number:
   - May appear as Order ID, Invoice ID, Reference ID
   - Usually a short alphanumeric identifier near the top.
   - Often associated with a date or appears prominently.
   - If multiple IDs exist, choose the one most likely representing the invoice reference.

2. vendor_name:
   - The entity issuing the invoice.
   - Usually appears at the top of the document.
   - Not the customer being billed.

3. customer_name:
   - The actual person or company being billed.
   - If a "Customer ID" is present, DO NOT return the ID.
   - Prefer a full name (e.g., "John Smith") over short codes.
   - If both ID and name exist, return the name.
   - Often appears in a billing section or contact section.

4. invoice_date:
   - A date associated with the document issuance.
   - Prefer the primary date near the top.

5. subtotal:
   - Sum of line items before tax.
   - Numeric only.
   - Remove currency symbols.

6. tax:
   - If tax is marked as included (e.g., "inc", "included"), still extract the numeric tax amount.

7. total / total_amount:
   - Final payable amount.
   - Numeric only.
   - Remove currency symbols.

8. currency:
   - Infer from currency symbols ($, €, £) or context.
   - Return ISO code (USD, CAD, EUR, GBP, etc.).
   - Extract ONLY if a currency symbol or code is explicitly visible.
   - If no currency symbol or code appears in the document, return null.
   - Do NOT infer currency from country.

9. bank_name:
   - Name of the bank for payment.
   - Usually in a payment details section.

10. bank_account:
    - Account number, IBAN, or similar payment identifier.
    - Remove spaces but keep the full number.

    - CANADIAN ACCOUNTS (Transit + Institution + Account):
      If you see separate Transit No., Institution No., and Account No. fields,
      combine them as "institution-transit-account".
      Example:
        Institution No. 003
        Transit No. 00123
        Account No. 1234567
        Output: "bank_account": "003-00123-1234567"
      Also set institution_number, transit_number, and account_number_raw separately.

    - US ACCOUNTS (Routing + Account):
      If routing number and account number are separate, combine as "routing-account".
      Example:
        Routing Number: 011401533
        Account Number: 1111222233330000
        Output: "bank_account": "011401533-1111222233330000"

    - IBAN:
      Return as-is without spaces.
      Example: "GB29NWBK60161331926819"

11. institution_number:
    - Canadian bank institution code. Usually 3 digits.
    - Example: "003" for RBC, "004" for TD, "010" for CIBC.
    - Only present on Canadian invoices.

12. transit_number:
    - Canadian bank branch/transit number. Usually 5 digits.
    - Only present on Canadian invoices.

13. account_number_raw:
    - The raw account number without routing/institution/transit prefix.
    - Useful as a fallback if bank_account cannot be fully assembled.

Return EXACTLY this JSON schema:

{schema}

Invoice text:
{invoice_text}
"""

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "120"))

_session = requests.Session()


def _empty_extraction() -> dict:
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
    }


def extract_invoice_semantic(text: str) -> dict:
    """
    Main entry point called by the router.
    Uses the full LLM extraction pipeline.
    Works for both PDF and image extracted text.
    """
    result = _empty_extraction()

    text = (text or "")[:3500]
    if not text.strip():
        return result

    print("\n================= LLM DEBUG =================")
    print("MODEL:", OLLAMA_MODEL)
    print("TEXT LENGTH:", len(text))
    print("TEXT PREVIEW:\n", text[:500])

    prompt = PROMPT_TEMPLATE.format(
        schema=json.dumps(INVOICE_SCHEMA, indent=2),
        invoice_text=text,
    )

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "keep_alive": "10m",
        "options": {
            "temperature": 0,
            "num_ctx": 2048,
            "num_thread": 8,
        },
    }

    print("SENDING REQUEST TO:", OLLAMA_URL)

    try:
        resp = _session.post(OLLAMA_URL, json=payload, timeout=OLLAMA_TIMEOUT)
    except Exception as exc:
        print("❌ OLLAMA CONNECTION FAILED:", exc)
        return result

    print("STATUS CODE:", resp.status_code)

    if resp.status_code != 200:
        print("❌ OLLAMA ERROR RESPONSE:", resp.text)
        return result

    data = resp.json()
    response_obj = data.get("response")

    print("RESPONSE TYPE:", type(response_obj))
    print("RESPONSE CONTENT:\n", response_obj)

    parsed = None

    if isinstance(response_obj, str):
        cleaned = response_obj.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            parsed = json.loads(cleaned)
            print("✅ Parsed JSON successfully from string.")
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
            if match:
                try:
                    parsed = json.loads(match.group(0))
                except Exception:
                    print("❌ Failed to parse JSON from regex match.")
            if not parsed:
                print("❌ Failed to parse JSON string entirely.")
                return result

    elif isinstance(response_obj, dict):
        parsed = response_obj
        print("✅ Response already dict.")

    else:
        print("❌ Unexpected response structure.")
        return result

    if not isinstance(parsed, dict):
        return result

    # ── Map parsed fields to our standard router keys ──────────────────
    field_map = {
        "vendor_name":       ["vendor_name"],
        "bank_name":         ["bank_name"],
        "bank_account":      ["bank_account"],
        "institution_number": ["institution_number"],
        "transit_number":    ["transit_number"],
        "account_number_raw": ["account_number_raw"],
        "invoice_number":    ["invoice_number"],
        "total_amount":      ["total_amount", "total"],
        "customer_name":     ["customer_name"],
        "invoice_date":      ["invoice_date"],
        "subtotal":          ["subtotal"],
        "tax":               ["tax"],
        "currency":          ["currency"],
    }

    for our_key, candidates in field_map.items():
        for candidate in candidates:
            value = parsed.get(candidate)
            if value is not None:
                clean = str(value).strip()
                if clean and clean.lower() != "null":
                    result[our_key] = clean
                    break

    print("FINAL EXTRACTED FIELDS:\n", result)
    print("=============== END LLM DEBUG ===============\n")

    return result