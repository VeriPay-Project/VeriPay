import logging
import os
import time

import numpy as np
import torch
from PIL import Image
import warnings

warnings.filterwarnings("ignore", category=FutureWarning)

logger = logging.getLogger(__name__)

MAX_ANALYSIS_PAGES = int(os.environ.get("MAX_ANALYSIS_PAGES", "5"))
MODEL_NAME = "microsoft/layoutlmv3-base"
# HuggingFace caches to ~/.cache/huggingface by default.
# Override with HF_HOME or TRANSFORMERS_CACHE env vars in Docker.
_LOAD_RETRY_DELAY = 5  # seconds

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".webp"}

# ── Lazy model loading with retry ──────────────────���─────────────────────────
processor = None
model = None


def _load_model():
    """Load LayoutLMv3 processor + model with one retry on failure."""
    global processor, model
    from transformers import LayoutLMv3Processor, LayoutLMv3Model

    last_error = None
    for attempt in range(1, 3):  # try twice
        try:
            logger.info(
                "Loading LayoutLMv3 (attempt %d/2, cache_dir=%s)",
                attempt,
                os.environ.get("HF_HOME", "~/.cache/huggingface"),
            )
            processor = LayoutLMv3Processor.from_pretrained(
                MODEL_NAME, apply_ocr=True,
            )
            model = LayoutLMv3Model.from_pretrained(MODEL_NAME)
            model.eval()
            logger.info("LayoutLMv3 loaded successfully.")
            return
        except Exception as exc:
            last_error = exc
            logger.warning(
                "LayoutLMv3 load attempt %d failed: %s", attempt, exc,
            )
            if attempt < 2:
                time.sleep(_LOAD_RETRY_DELAY)

    logger.error(
        "LayoutLMv3 failed to load after 2 attempts: %s. "
        "Embedding extraction will return zeros.",
        last_error,
    )


# Attempt load at import time (non-fatal)
try:
    _load_model()
except Exception as exc:
    logger.error("Unexpected error during model init: %s", exc)


def _embed_single_image(image: Image.Image) -> np.ndarray:
    """Extract CLS embedding from a single PIL image via LayoutLMv3."""
    encoding = processor(
        image,
        return_tensors="pt",
        truncation=True,
    )
    with torch.no_grad():
        outputs = model(**encoding)
    return outputs.last_hidden_state[:, 0, :].squeeze().cpu().numpy()


def extract_layoutlm_embedding(file_path: str) -> np.ndarray:
    """
    Returns a single document-level embedding vector using LayoutLMv3.

    Supports both PDF files (multi-page, up to MAX_ANALYSIS_PAGES) and
    image files (PNG, JPEG, etc.). For multi-page documents the per-page
    CLS embeddings are mean-pooled into one vector.

    If the model is unavailable, returns a 768-dim zero vector so callers
    get a degraded result instead of a crash.
    """
    if model is None or processor is None:
        logger.warning(
            "LayoutLMv3 not loaded — returning zero embedding for %s",
            file_path,
        )
        return np.zeros(768)

    ext = os.path.splitext(file_path)[1].lower()

    if ext in IMAGE_EXTENSIONS:
        image = Image.open(file_path).convert("RGB")
        return _embed_single_image(image)

    # ── PDF path: process up to MAX_ANALYSIS_PAGES ───────────────────────
    from pdf2image import convert_from_path

    images = convert_from_path(
        file_path,
        first_page=1,
        last_page=MAX_ANALYSIS_PAGES,
    )

    page_embeddings = []
    for page_image in images:
        emb = _embed_single_image(page_image.convert("RGB"))
        page_embeddings.append(emb)

    # Mean-pool across pages
    return np.mean(page_embeddings, axis=0)
