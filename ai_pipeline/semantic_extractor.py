import json
import subprocess
from ai_pipeline.contracts.invoice_schema import INVOICE_SCHEMA

PROMPT_TEMPLATE = """
You are an invoice parsing system.

Extract the following fields from the invoice text.
Return ONLY valid JSON. No explanations.

Schema:
{schema}

Rules:
- Do NOT calculate values
- Do NOT guess
- If a field is missing, return null
- Use numbers for amounts (no currency symbols)

Invoice text:
{invoice_text}
"""


def _safe_json_loads(raw: str) -> dict:
    """
    Handles:
    - raw JSON
    - escaped JSON (\"key\": \"value\")
    """
    raw = raw.strip()

    # Case 1: already valid JSON
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Case 2: JSON string containing escaped JSON
    try:
        unescaped = json.loads(f'"{raw}"')
        return json.loads(unescaped)
    except Exception:
        raise


def extract_semantic_fields(invoice_text: str) -> dict:
    prompt = PROMPT_TEMPLATE.format(
        schema=json.dumps({k: str(v) for k, v in INVOICE_SCHEMA.items()}, indent=2),
        invoice_text=invoice_text[:6000]
    )

    result = subprocess.run(
        ["ollama", "run", "mistral"],
        input=prompt,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )

    if result.returncode != 0:
        return {
            "error": "ollama_failed",
            "details": result.stderr
        }

    try:
        parsed = _safe_json_loads(result.stdout)

        # Enforce schema completeness
        for key in INVOICE_SCHEMA:
            parsed.setdefault(key, None)

        return parsed

    except Exception:
        return {
            "error": "invalid_json_from_llm",
            "raw_output": result.stdout
        }
