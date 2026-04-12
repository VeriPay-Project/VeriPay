import hashlib
import json
import logging
from pathlib import Path
import sys
import shutil

import joblib
import numpy as np

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


def run_ai_analysis(invoice_path: str) -> dict:
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

    if not MODEL_PATH.exists() or not STATS_PATH.exists():
        return {
            "status": "error",
            "message": "AI model files are missing. Train or copy saved_models first."
        }

    import pytesseract
    from advanced.pipeline_layoutlm import process_invoice_layoutlm
    from interpretation.explanation import compute_z_score, generate_explanations
    from interpretation.risk_policy import interpret_risk

    pytesseract.pytesseract.tesseract_cmd = tesseract_path

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
        "anomaly_score": float(round(normalized_score, 3)),
        "risk_level": risk,
        "review_required": review_required,
        "embedding_distance": float(round(distance, 2)),
        "distance_z_score": float(round(distance_z, 2)),
        "explanations": explanations
    }
