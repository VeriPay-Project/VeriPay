✅ TODO – VeriPay Pipeline Fixes
🔴 Priority 1 – Semantic ↔ Rule Binding

Use semantic_json output as input to rule-based checks

Rules should validate:

semantic.subtotal

semantic.tax

semantic.total

semantic.line_items (when available)

Store:

raw semantic output

rule validation result against semantic data

🔴 Priority 2 – Ollama clarity

Separate:

semantic_llm_raw

semantic_normalized

Ensure rules use normalized semantic output, not hardcoded test data

Add a clear flag:

semantic_source: ollama | fallback | none

🟠 Priority 3 – Image pipeline completion

For images:

OCR → text

Text → semantic extraction

Semantic → rule validation

Crypto stays disabled (correct)

AI anomaly:

optional for images

mark clearly as "status": "not_supported"

🟠 Priority 4 – Frontend clarity (later)

Visually show:

“Semantic extracted but failed validation”

“Rule mismatch detected”

Highlight deltas instead of silent N/A

🟢 Priority 5 – Migrations & stability

Add Alembic after pipeline stabilizes

Create migration for:

semantic_json

future semantic_source