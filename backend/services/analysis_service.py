import hashlib
import json
import logging
from pathlib import Path
import sys
import shutil

import joblib
import numpy as np

from services.layoutlm_model_registry import (
    BASELINE_MODEL_ID,
    load_supervised_model_bundle,
)

logger = logging.getLogger(__name__)

AI_PIPELINE_DIR = Path(__file__).resolve().parents[2] / "ai_pipeline"
MODEL_PATH = AI_PIPELINE_DIR / "saved_models" / "anomaly_model.joblib"
MODEL_HASH_PATH = AI_PIPELINE_DIR / "saved_models" / "anomaly_model.joblib.sha256"
STATS_PATH = AI_PIPELINE_DIR / "saved_models" / "embedding_stats.json"

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


def _run_supervised_analysis(invoice_path: str, layoutlm_model_id: str, user_id: int) -> dict:
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

    explanations = [
        "Supervised LayoutLMv3 classifier used previous approve/reject reviewer labels.",
        f"The model predicted this invoice as {prediction_label.replace('_', ' ')}.",
    ]
    if embedding_distance is not None:
        explanations.append("Layout embedding distance was compared with the supervised training set.")

    return {
        "status": "ok",
        "model_type": "layoutlmv3_supervised_sklearn",
        "selected_model_id": layoutlm_model_id,
        "model_id": metadata["id"],
        "model_version": metadata["id"],
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
        return _run_supervised_analysis(invoice_path, selected_model_id, user_id)

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

    explanations = generate_explanations(distance_z, normalized_score)

    return {
        "status": "ok",
        "model_type": "layoutlmv3_isolation_forest",
        "selected_model_id": BASELINE_MODEL_ID,
        "model_id": BASELINE_MODEL_ID,
        "model_version": "layoutlmv3-isolation-forest",
        "anomaly_score": float(round(normalized_score, 3)),
        "risk_level": risk,
        "review_required": review_required,
        "embedding_distance": float(round(distance, 2)),
        "distance_z_score": float(round(distance_z, 2)),
        "explanations": explanations
    }
