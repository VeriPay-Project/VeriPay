from extraction.text_for_llm import extract_text_for_llm
from extraction.line_items import extract_line_items
from services.rules_service import run_rules_checks
from services.analysis_service import run_ai_analysis

from ai_pipeline.semantic_extractor import extract_semantic_fields


def analyze_invoice(pdf_path: str) -> dict:
    """
    Orchestrates:
    - Text extraction
    - Semantic LLM extraction
    - Rule validation
    - AI anomaly detection
    """

    # 1️⃣ Extract text
    payload = extract_text_for_llm(pdf_path)
    text = payload["text"]

    # 2️⃣ Semantic extraction (LLM)
    semantic = extract_semantic_fields(text)

    # 3️⃣ Extract line items (heuristic)
    line_items = extract_line_items(text)

    # 4️⃣ Rule validation
    rule_results = run_rules_checks(
        line_items=line_items,
        subtotal=_safe_float(semantic.get("subtotal")),
        tax=_safe_float(semantic.get("tax")),
        total=_safe_float(semantic.get("total"))
    )

    # 5️⃣ AI anomaly analysis
    anomaly = run_ai_analysis(pdf_path)

    return {
        "semantic_fields": semantic,
        "rule_based_checks": rule_results,
        "ai_anomaly_analysis": anomaly
    }


def _safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
