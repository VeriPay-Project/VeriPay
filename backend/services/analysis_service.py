import hashlib
import json
import logging
import os
from pathlib import Path
import sys
import shutil
import time

import httpx
import joblib
import numpy as np

from services.layoutlm_model_registry import (
    BASELINE_MODEL_ID,
    DEMO_MODEL_NAMES,
    load_supervised_model_bundle,
)

logger = logging.getLogger(__name__)

AI_PIPELINE_DIR = Path(__file__).resolve().parents[2] / "ai_pipeline"
MODEL_PATH = AI_PIPELINE_DIR / "saved_models" / "anomaly_model.joblib"
MODEL_HASH_PATH = AI_PIPELINE_DIR / "saved_models" / "anomaly_model.joblib.sha256"
STATS_PATH = AI_PIPELINE_DIR / "saved_models" / "embedding_stats.json"
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "45"))
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "12h")
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "1536"))
OLLAMA_NUM_THREAD = int(
    os.getenv("OLLAMA_NUM_THREAD", str(min(os.cpu_count() or 4, 4)))
)
OLLAMA_LAYOUT_TIMEOUT = float(os.getenv("OLLAMA_LAYOUT_TIMEOUT", "12"))

if str(AI_PIPELINE_DIR) not in sys.path:
    sys.path.append(str(AI_PIPELINE_DIR))

# ── Module-level model cache ─────────────────────────────────────────────────
_cached_detector = None


def _load_detector():
    """Load and cache the anomaly detector with SHA256 integrity check."""
    global _cached_detector
    if _cached_detector is not None:
        return _cached_detector

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

    if not MODEL_HASH_PATH.exists():
        raise FileNotFoundError(f"Model hash file not found: {MODEL_HASH_PATH}")

    expected_hash = MODEL_HASH_PATH.read_text().strip()
    actual_hash = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()

    if actual_hash != expected_hash:
        raise ValueError(
            f"Model file integrity check failed. "
            f"Expected SHA256 {expected_hash}, got {actual_hash}. "
            "The model file may have been tampered with."
        )

    _cached_detector = joblib.load(MODEL_PATH)
    logger.info("Anomaly detector loaded and verified (SHA256 OK).")
    return _cached_detector


def _risk_from_rejection_probability(rejection_probability: float) -> tuple[str, bool]:
    if rejection_probability >= 0.65:
        return "HIGH", True
    if rejection_probability >= 0.35:
        return "MEDIUM", True
    return "LOW", False


def _layout_familiarity(distance_z_score: float | None) -> tuple[str, str | None]:
    if distance_z_score is None:
        return "unknown", None
    if distance_z_score >= 2.5:
        return (
            "unfamiliar",
            "This invoice layout is far from the supervised training examples. Treat the Layout prediction as unreliable and review manually.",
        )
    if distance_z_score >= 1.5:
        return (
            "caution",
            "This invoice layout differs from the supervised training examples. Use the Layout prediction with caution.",
        )
    return "familiar", None


def _clamp01(value: float) -> float:
    return max(0.0, min(float(value), 1.0))


def _layout_consistency_score(distance_z_score: float | None) -> float | None:
    if distance_z_score is None:
        return None
    # Negative z-scores mean the layout is closer to the training centroid than
    # an average training sample. Treat those as fully consistent.
    return _clamp01(1.0 - (max(distance_z_score, 0.0) / 3.0))


def _layout_consistency_level(score: float | None) -> str:
    if score is None:
        return "unknown"
    if score >= 0.70:
        return "high"
    if score >= 0.40:
        return "medium"
    return "low"


def _present_invoice_fields(semantic_fields: dict | None) -> list[str]:
    if not isinstance(semantic_fields, dict):
        return []

    field_labels = {
        "vendor_name": "vendor name",
        "customer_name": "customer name",
        "invoice_number": "invoice number",
        "invoice_date": "invoice date",
        "total_amount": "total amount",
        "bank_account": "bank account",
        "bank_name": "bank name",
    }
    return [
        label
        for key, label in field_labels.items()
        if str(semantic_fields.get(key) or "").strip().lower()
        not in {"", "n/a", "na", "none", "null", "unknown"}
    ]


def _fallback_layout_reason(
    *,
    prediction_label: str,
    approval_probability: float,
    rejection_probability: float,
    layout_consistency_score: float | None,
    layout_familiarity: str,
    distance_z_score: float | None,
    semantic_fields: dict | None,
    extracted_text: str | None,
) -> str:
    consistency_level = _layout_consistency_level(layout_consistency_score)
    score_text = (
        f"{layout_consistency_score:.2f}"
        if isinstance(layout_consistency_score, float)
        else "unknown"
    )
    z_text = f"{distance_z_score:.2f}" if distance_z_score is not None else "unknown"
    present_fields = _present_invoice_fields(semantic_fields)
    text_length = len((extracted_text or "").strip())

    if rejection_probability >= 0.65:
        decision = (
            f"The layout model gave this invoice a high fake-risk score because "
            f"the rejected class is stronger than the approved class "
            f"({rejection_probability:.2f} vs {approval_probability:.2f})."
        )
    elif rejection_probability >= 0.35:
        decision = (
            f"The layout model is uncertain because the rejected class is not low "
            f"({rejection_probability:.2f}) and the approved class is "
            f"{approval_probability:.2f}."
        )
    else:
        decision = (
            f"The layout model gave this invoice a low fake-risk score because "
            f"the approved class is stronger than the rejected class "
            f"({approval_probability:.2f} vs {rejection_probability:.2f})."
        )

    consistency = (
        f" Layout consistency is {consistency_level} ({score_text}); "
        f"the embedding z-score is {z_text}, so the page is considered "
        f"{layout_familiarity} compared with the supervised training layouts."
    )

    if present_fields:
        evidence = f" Extracted fields found: {', '.join(present_fields[:5])}."
    elif text_length:
        evidence = " OCR text was available, but key invoice fields were limited."
    else:
        evidence = " OCR text was very limited, so the reason relies mainly on layout embedding behavior."

    return decision + consistency + evidence


def _parse_ollama_json_response(response_obj: object) -> dict | None:
    if isinstance(response_obj, dict):
        return response_obj
    if not isinstance(response_obj, str):
        return None

    cleaned = response_obj.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            parsed = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            return None
    return parsed if isinstance(parsed, dict) else None


def _is_supported_layout_reason(reason: str) -> bool:
    normalized = " ".join(reason.lower().split())
    if any(word in normalized for word in ("incorrect", "mistaken", "wrong")):
        return False
    causal_markers = ("due to", "because of", "caused by")
    consistency_terms = ("consistency", "familiarity", "familiar")
    return not (
        any(marker in normalized for marker in causal_markers)
        and any(term in normalized for term in consistency_terms)
    )


def _ollama_layout_reason(
    *,
    prediction_label: str,
    approval_probability: float,
    rejection_probability: float,
    layout_consistency_score: float | None,
    layout_familiarity: str,
    distance_z_score: float | None,
    semantic_fields: dict | None,
    extracted_text: str | None,
) -> tuple[str, str]:
    fallback = _fallback_layout_reason(
        prediction_label=prediction_label,
        approval_probability=approval_probability,
        rejection_probability=rejection_probability,
        layout_consistency_score=layout_consistency_score,
        layout_familiarity=layout_familiarity,
        distance_z_score=distance_z_score,
        semantic_fields=semantic_fields,
        extracted_text=extracted_text,
    )

    text_length = len((extracted_text or "").strip())
    present_fields = _present_invoice_fields(semantic_fields)
    facts = {
        "prediction": prediction_label,
        "approval_probability": round(float(approval_probability), 3),
        "rejection_probability": round(float(rejection_probability), 3),
        "layout_consistency_score": (
            None if layout_consistency_score is None else round(layout_consistency_score, 3)
        ),
        "layout_consistency_level": _layout_consistency_level(layout_consistency_score),
        "layout_familiarity": layout_familiarity,
        "distance_z_score": None if distance_z_score is None else round(distance_z_score, 2),
        "present_invoice_fields": present_fields,
        "ocr_text_available": text_length > 0,
        "ocr_text_length": text_length,
    }
    prompt = (
        "Explain an invoice LayoutLM fraud-analysis result in plain English. "
        "Use only the supplied facts. Do not claim you visually inspected pixels. "
        "Familiar means similar to supervised training layouts, never familiar to a user. "
        "If fake-risk is high but layout consistency is also high, explain that the "
        "document layout is familiar but the trained classifier still sees it as fake-like. "
        "High layout consistency is not the reason for fake-risk; it only means the "
        "page shape is not unusual for the training set. "
        "Never say the classifier is correct, incorrect, mistaken, or wrong. "
        "Return only JSON with this exact shape: "
        '{"reason":"one concise explanation under 70 words"}\n\n'
        f"Facts:\n{json.dumps(facts, ensure_ascii=True)}"
    )
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
            "num_predict": 140,
        },
    }

    started_at = time.perf_counter()
    try:
        with httpx.Client(timeout=httpx.Timeout(OLLAMA_LAYOUT_TIMEOUT, connect=5.0)) as client:
            response = client.post(OLLAMA_URL, json=payload)
            response.raise_for_status()
        data = response.json()
        parsed = _parse_ollama_json_response(data.get("response"))
        reason = parsed.get("reason") if isinstance(parsed, dict) else None
        if (
            isinstance(reason, str)
            and reason.strip()
            and _is_supported_layout_reason(reason)
        ):
            logger.info(
                "Ollama layout explanation complete in %.2fs",
                time.perf_counter() - started_at,
            )
            return reason.strip(), "ollama"
        if isinstance(reason, str):
            logger.warning("Ollama layout explanation rejected: %s", reason[:200])
    except Exception as exc:
        logger.warning("Ollama layout explanation failed: %s", exc)

    return fallback, "local_fallback"


def _run_supervised_analysis(
    invoice_path: str,
    layoutlm_model_id: str,
    user_id: int,
    extracted_text: str | None = None,
    semantic_fields: dict | None = None,
) -> dict:
    from advanced.pipeline_layoutlm import process_invoice_layoutlm
    from interpretation.explanation import compute_z_score

    try:
        bundle = load_supervised_model_bundle(user_id, layoutlm_model_id)
    except (FileNotFoundError, ValueError) as exc:
        return {
            "status": "model_load_failed",
            "model_type": "layoutlmv3_supervised_sklearn",
            "selected_model_id": layoutlm_model_id,
            "message": str(exc),
        }

    try:
        embedding = process_invoice_layoutlm(invoice_path)
    except Exception as exc:
        return {
            "status": "error",
            "model_type": "layoutlmv3_supervised_sklearn",
            "selected_model_id": layoutlm_model_id,
            "message": f"AI analysis failed: {exc}",
        }

    model = bundle["model"]
    metadata = bundle["metadata"]
    X = np.asarray([embedding], dtype=np.float32)

    probabilities = model.predict_proba(X)[0]
    classes = [int(c) for c in model.classes_]
    class_probability = {label: float(probabilities[idx]) for idx, label in enumerate(classes)}

    approval_probability = class_probability.get(1, 0.0)
    rejection_probability = class_probability.get(0, 1.0 - approval_probability)
    prediction_numeric = int(model.predict(X)[0])
    prediction_label = "approved" if prediction_numeric == 1 else "rejected"
    model_confidence = max(approval_probability, rejection_probability)
    risk, review_required = _risk_from_rejection_probability(rejection_probability)

    centroid = np.asarray(bundle.get("centroid") or [], dtype=np.float32)
    embedding_distance = None
    distance_z_score = None
    if centroid.size == embedding.size:
        embedding_distance = float(np.linalg.norm(embedding - centroid))
        distance_z_score = compute_z_score(
            embedding_distance,
            float(bundle.get("mean_distance") or 0.0),
            float(bundle.get("std_distance") or 1.0),
        )
        if distance_z_score >= 2.5:
            risk = "HIGH"
            review_required = True

    layout_familiarity, reliability_warning = _layout_familiarity(distance_z_score)
    layout_consistency_score = _layout_consistency_score(distance_z_score)
    layout_consistency_reason, layout_reason_source = _ollama_layout_reason(
        prediction_label=prediction_label,
        approval_probability=approval_probability,
        rejection_probability=rejection_probability,
        layout_consistency_score=layout_consistency_score,
        layout_familiarity=layout_familiarity,
        distance_z_score=distance_z_score,
        semantic_fields=semantic_fields,
        extracted_text=extracted_text,
    )

    explanations = [
        "Supervised LayoutLMv3 classifier used previous approve/reject reviewer labels.",
        f"The model predicted this invoice as {prediction_label.replace('_', ' ')}.",
        layout_consistency_reason,
    ]
    if embedding_distance is not None:
        explanations.append("Layout embedding distance was compared with the supervised training set.")
    if reliability_warning:
        explanations.append(reliability_warning)

    return {
        "status": "ok",
        "model_type": "layoutlmv3_supervised_sklearn",
        "selected_model_id": layoutlm_model_id,
        "model_id": metadata["id"],
        "model_version": metadata["id"],
        "model_display_name": DEMO_MODEL_NAMES.get(metadata.get("pseudo_rule_version") or "", metadata.get("name") or metadata["id"]),
        "algorithm": metadata.get("algorithm"),
        "training_sample_count": metadata.get("trained_sample_count"),
        "approved_count": metadata.get("approved_count"),
        "rejected_count": metadata.get("rejected_count"),
        "prediction_label": prediction_label,
        "approval_probability": float(round(approval_probability, 3)),
        "rejection_probability": float(round(rejection_probability, 3)),
        "classifier_confidence": float(round(model_confidence, 3)),
        "anomaly_score": float(round(rejection_probability, 3)),
        "risk_level": risk,
        "review_required": review_required,
        "layout_familiarity": layout_familiarity,
        "layout_consistency_score": (
            None
            if layout_consistency_score is None
            else float(round(layout_consistency_score, 3))
        ),
        "layout_consistency_level": _layout_consistency_level(layout_consistency_score),
        "layout_consistency_reason": layout_consistency_reason,
        "layout_reason_source": layout_reason_source,
        "unfamiliar_layout": layout_familiarity == "unfamiliar",
        "reliability_warning": reliability_warning,
        "embedding_distance": None if embedding_distance is None else float(round(embedding_distance, 2)),
        "distance_z_score": None if distance_z_score is None else float(round(distance_z_score, 2)),
        "metrics": metadata.get("metrics"),
        "label_mapping": metadata.get("label_mapping"),
        "explanations": explanations,
    }


def run_ai_analysis(
    invoice_path: str,
    layoutlm_model_id: str = BASELINE_MODEL_ID,
    user_id: int | None = None,
    extracted_text: str | None = None,
    semantic_fields: dict | None = None,
) -> dict:
    tesseract_path = shutil.which("tesseract")
    if not tesseract_path:
        return {
            "status": "error",
            "message": "Tesseract OCR is not installed. Run: brew install tesseract"
        }

    file_ext = Path(invoice_path).suffix.lower()
    is_image = file_ext in {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".webp"}

    if not is_image and not shutil.which("pdftoppm"):
        return {
            "status": "error",
            "message": "Poppler is not installed. Run: brew install poppler"
        }

    import pytesseract
    from advanced.pipeline_layoutlm import process_invoice_layoutlm
    from interpretation.explanation import compute_z_score, generate_explanations
    from interpretation.risk_policy import interpret_risk

    pytesseract.pytesseract.tesseract_cmd = tesseract_path

    selected_model_id = layoutlm_model_id or BASELINE_MODEL_ID
    if selected_model_id not in {BASELINE_MODEL_ID, "baseline"}:
        if user_id is None:
            return {
                "status": "error",
                "model_type": "layoutlmv3_supervised_sklearn",
                "selected_model_id": selected_model_id,
                "message": "A user id is required for supervised LayoutLMv3 model selection.",
            }
        return _run_supervised_analysis(
            invoice_path,
            selected_model_id,
            user_id,
            extracted_text=extracted_text,
            semantic_fields=semantic_fields,
        )

    if not MODEL_PATH.exists() or not STATS_PATH.exists():
        return {
            "status": "error",
            "message": "AI model files are missing. Train or copy saved_models first."
        }

    try:
        detector = _load_detector()
    except (FileNotFoundError, ValueError) as exc:
        logger.error("Failed to load anomaly model: %s", exc)
        return {
            "status": "model_load_failed",
            "prediction": -1,
            "confidence": 0,
            "message": str(exc)
        }

    with open(STATS_PATH, "r") as f:
        stats = json.load(f)

    try:
        embedding = process_invoice_layoutlm(invoice_path)
    except Exception as exc:
        return {
            "status": "error",
            "message": f"AI analysis failed: {exc}"
        }

    raw_score = detector.score(dict(enumerate(embedding)))
    normalized_score = 1 / (1 + np.exp(-raw_score))

    centroid = np.array(stats["centroid"])
    distance = float(np.linalg.norm(embedding - centroid))

    distance_z = compute_z_score(
        distance,
        stats["mean_distance"],
        stats["std_distance"]
    )

    risk, review_required = interpret_risk(normalized_score)

    if distance_z >= 2.5:
        risk = "HIGH"
        review_required = True

    layout_familiarity, reliability_warning = _layout_familiarity(distance_z)
    layout_consistency_score = _layout_consistency_score(distance_z)
    layout_consistency_reason, layout_reason_source = _ollama_layout_reason(
        prediction_label="rejected" if risk == "HIGH" else "approved",
        approval_probability=float(1.0 - normalized_score),
        rejection_probability=float(normalized_score),
        layout_consistency_score=layout_consistency_score,
        layout_familiarity=layout_familiarity,
        distance_z_score=distance_z,
        semantic_fields=semantic_fields,
        extracted_text=extracted_text,
    )
    explanations = generate_explanations(distance_z, normalized_score)
    explanations.append(layout_consistency_reason)
    if reliability_warning:
        explanations.append(reliability_warning)

    return {
        "status": "ok",
        "model_type": "layoutlmv3_isolation_forest",
        "selected_model_id": BASELINE_MODEL_ID,
        "model_id": BASELINE_MODEL_ID,
        "model_version": "layoutlmv3-isolation-forest",
        "anomaly_score": float(round(normalized_score, 3)),
        "risk_level": risk,
        "review_required": review_required,
        "layout_familiarity": layout_familiarity,
        "layout_consistency_score": (
            None
            if layout_consistency_score is None
            else float(round(layout_consistency_score, 3))
        ),
        "layout_consistency_level": _layout_consistency_level(layout_consistency_score),
        "layout_consistency_reason": layout_consistency_reason,
        "layout_reason_source": layout_reason_source,
        "unfamiliar_layout": layout_familiarity == "unfamiliar",
        "reliability_warning": reliability_warning,
        "embedding_distance": float(round(distance, 2)),
        "distance_z_score": float(round(distance_z, 2)),
        "explanations": explanations
    }
