import json
import re

import requests


OLLAMA_URL = "http://ollama:11434/api/generate"
OLLAMA_MODEL = "qwen2.5:3b"


def _empty_extraction() -> dict:
    return {
        "vendor_name": None,
        "bank_name": None,
        "bank_account": None,
        "invoice_number": None,
        "total_amount": None,
    }


def _parse_json_payload(raw_text: str) -> dict | None:
    if not raw_text:
        return None

    cleaned = raw_text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        payload = json.loads(cleaned)
        return payload if isinstance(payload, dict) else None
    except Exception:
        pass

    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not match:
        return None

    try:
        payload = json.loads(match.group(0))
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def extract_invoice_semantic(text: str) -> dict:
    result = _empty_extraction()
    if not text or not text.strip():
        return result

    prompt = f"""You are an invoice data extraction system.

Extract the following fields from the invoice text and return ONLY valid JSON.

Fields:
vendor_name
bank_name
bank_account
invoice_number
total_amount

Rules:

* Return JSON only
* Do not include explanations
* If a field is missing return null

Invoice text:
{text}
"""

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
            },
            timeout=30,
        )
        response.raise_for_status()
        body = response.json()
    except Exception:
        return result

    model_output = body.get("response")
    if not isinstance(model_output, str):
        return result

    parsed = _parse_json_payload(model_output)
    if not parsed:
        return result

    for key in result.keys():
        value = parsed.get(key)
        if value is None:
            result[key] = None
        elif isinstance(value, str):
            clean_value = value.strip()
            result[key] = clean_value if clean_value else None
        else:
            clean_value = str(value).strip()
            result[key] = clean_value if clean_value else None

    return result
