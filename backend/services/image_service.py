"""
VeriPay Image Service — Merged
================================
Combines:
  - pdf2image.convert_from_path locked to match LayoutLM exactly (uploaded v2)
  - PyMuPDF fallback when pdf2image is unavailable (pasted v3)
  - In-memory cache keyed on file path + mtime + size (uploaded v2)
  - Safe filename with MD5 hash to prevent collision (pasted v3)
  - File size guard (pasted v3)
  - Returns rendered numpy image alongside metadata so forensics can share
    the same pixels without a second render pass
  - OpenCV copy into controlled OUTPUT_DIR for image files (pasted v3)

IMPORTANT — DPI is locked at 200 to match LayoutLM. Do not change without
retraining the model.
"""

import os
import hashlib
import logging
import shutil
import tempfile
from typing import Optional, Tuple

import numpy as np

try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False

try:
    import fitz
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

try:
    import cv2
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

try:
    from PIL import Image as PilImage
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


logger = logging.getLogger("veripay.image_service")

# 🔒 LOCKED — must match layoutlm_features.py convert_from_path call.
LOCKED_DPI = 200
MAX_ANALYSIS_PAGES = int(os.environ.get("MAX_ANALYSIS_PAGES", "5"))

OUTPUT_DIR     = "uploads/rendered"
MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB

# In-memory cache: cache_key → output_path
_image_cache: dict[str, str] = {}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _ensure_output_dir() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def _safe_filename(file_path: str) -> str:
    """Collision-safe output filename using MD5 of path."""
    base = os.path.basename(file_path)
    name_hash = hashlib.md5(file_path.encode()).hexdigest()[:8]
    return f"preview_{name_hash}_{base}.png"


def _cache_key(file_path: str) -> str:
    """Cache key includes path + mtime + size so re-uploads bust the cache."""
    try:
        stat = os.stat(file_path)
        raw = f"{file_path}:{stat.st_size}:{stat.st_mtime}"
    except OSError:
        raw = file_path
    return hashlib.md5(raw.encode()).hexdigest()[:16]


def _validate_file(file_path: str) -> Optional[str]:
    """Return error string if file is invalid, None if ok."""
    if not os.path.exists(file_path):
        return "File not found"
    try:
        size = os.path.getsize(file_path)
        if size > MAX_FILE_BYTES:
            return f"File too large ({size} bytes, max {MAX_FILE_BYTES})"
        if size == 0:
            return "File is empty"
    except OSError as exc:
        return f"File stat failed: {exc}"
    return None


def _bgr_to_png(image_bgr: np.ndarray, output_path: str) -> bool:
    """Save BGR numpy array as PNG. Returns True on success."""
    if not HAS_OPENCV:
        return False
    try:
        cv2.imwrite(output_path, image_bgr)
        return True
    except Exception as exc:
        logger.warning("_bgr_to_png failed: %s", exc)
        return False


def _pil_to_bgr(pil_image: "PilImage.Image") -> Optional[np.ndarray]:
    if not (HAS_PIL and HAS_OPENCV):
        return None
    try:
        rgb = np.array(pil_image.convert("RGB"))
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception as exc:
        logger.warning("_pil_to_bgr failed: %s", exc)
        return None


# ─── PDF rendering ────────────────────────────────────────────────────────────

def _render_pdf_pdf2image(
    file_path: str, max_pages: int = 1,
) -> Tuple[Optional[list[np.ndarray]], Optional[str]]:
    """
    Render up to *max_pages* pages using pdf2image (matches LayoutLM DPI).
    Returns (list_of_bgr_images, error_string).
    """
    try:
        images = convert_from_path(
            file_path,
            first_page=1,
            last_page=max_pages,
            dpi=LOCKED_DPI,
        )
        if not images:
            return None, "pdf2image produced no images"

        bgr_pages = []
        for pil_img in images:
            bgr = _pil_to_bgr(pil_img)
            if bgr is None:
                return None, "PIL→BGR conversion failed"
            bgr_pages.append(bgr)
        return bgr_pages, None

    except Exception as exc:
        return None, f"pdf2image failed: {exc}"


def _render_pdf_pymupdf(
    file_path: str, max_pages: int = 1,
) -> Tuple[Optional[list[np.ndarray]], Optional[str]]:
    """
    Fallback PDF renderer using PyMuPDF.  Returns list of BGR arrays.
    """
    if not HAS_PYMUPDF:
        return None, "Neither pdf2image nor PyMuPDF is available"

    try:
        with fitz.open(file_path) as doc:
            if len(doc) == 0:
                return None, "PDF has no pages"

            bgr_pages = []
            for page_idx in range(min(len(doc), max_pages)):
                pix = doc[page_idx].get_pixmap(dpi=LOCKED_DPI, alpha=False)
                img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                    pix.height, pix.width, pix.n
                )

                if not HAS_OPENCV:
                    return None, "OpenCV not available for color conversion"

                if pix.n == 4:
                    bgr_pages.append(cv2.cvtColor(img, cv2.COLOR_RGBA2BGR))
                elif pix.n == 3:
                    bgr_pages.append(cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
                elif pix.n == 1:
                    bgr_pages.append(cv2.cvtColor(img, cv2.COLOR_GRAY2BGR))
                else:
                    bgr_pages.append(img)

            return bgr_pages, None

    except Exception as exc:
        return None, f"PyMuPDF render failed: {exc}"


# ─── Main entry point ─────────────────────────────────────────────────────────

def render_invoice_preview(
    file_path: str,
    file_type: str,
) -> Optional[dict]:
    """
    Convert a PDF or image file into a frontend-ready preview.

    Returns a dict with:
      image_path   — URL-safe path for the frontend
      width        — pixel width of the rendered image
      height       — pixel height of the rendered image
      image_bgr    — numpy BGR array (for forensics to consume directly)
      page         — page number rendered (always 1)
      total_pages  — total pages in document
      dpi          — DPI used
      source_type  — "pdf" or "image"
      loader       — which rendering method was used

    Returns None on failure.
    """
    _ensure_output_dir()

    error = _validate_file(file_path)
    if error:
        logger.warning("render_invoice_preview: %s — %s", error, file_path)
        return None

    output_path = os.path.join(OUTPUT_DIR, _safe_filename(file_path))
    key = _cache_key(file_path)

    # ── PDF ──────────────────────────────────────────────────────────────────
    if file_type == "pdf":
        total_pages = _count_pdf_pages(file_path)
        pages_to_render = min(total_pages, MAX_ANALYSIS_PAGES)

        # Try pdf2image first (matches LayoutLM exactly)
        bgr_pages = None
        loader = None

        if HAS_PDF2IMAGE:
            bgr_pages, err = _render_pdf_pdf2image(file_path, max_pages=pages_to_render)
            loader = "pdf2image"
            if err:
                logger.warning("pdf2image failed, trying PyMuPDF: %s", err)
                bgr_pages = None

        if bgr_pages is None:
            bgr_pages, err = _render_pdf_pymupdf(file_path, max_pages=pages_to_render)
            loader = "pymupdf"
            if err:
                logger.error("All PDF renderers failed: %s", err)
                return None

        # Save first page as the preview image
        if not _bgr_to_png(bgr_pages[0], output_path):
            logger.error("Failed to save rendered PDF preview: %s", output_path)
            return None

        _image_cache[key] = output_path

        h, w = bgr_pages[0].shape[:2]
        return {
            "image_path":  _to_url_path(output_path),
            "width":       w,
            "height":      h,
            "image_bgr":   bgr_pages[0],
            "all_pages_bgr": bgr_pages,
            "pages_rendered": len(bgr_pages),
            "page":        1,
            "total_pages": total_pages,
            "dpi":         LOCKED_DPI,
            "source_type": "pdf",
            "loader":      loader,
        }

    # ── Image ────────────────────────────────────────────────────────────────
    elif file_type == "image":
        # Serve from cache if unchanged
        if key in _image_cache and os.path.exists(_image_cache[key]):
            cached_path = _image_cache[key]
            image_bgr = cv2.imread(cached_path) if HAS_OPENCV else None
            if image_bgr is not None:
                h, w = image_bgr.shape[:2]
                return {
                    "image_path":  _to_url_path(cached_path),
                    "width":       w,
                    "height":      h,
                    "image_bgr":   image_bgr,
                    "page":        1,
                    "total_pages": 1,
                    "dpi":         None,
                    "source_type": "image",
                    "loader":      "cache",
                }

        # Read and copy into controlled output dir
        image_bgr = None
        loader = None

        if HAS_OPENCV:
            image_bgr = cv2.imread(file_path, cv2.IMREAD_COLOR)
            loader = "opencv"

        if image_bgr is None and HAS_PIL:
            try:
                with PilImage.open(file_path) as src:
                    image_bgr = _pil_to_bgr(src)
                loader = "pil_fallback"
            except Exception as exc:
                logger.warning("PIL fallback failed: %s", exc)

        if image_bgr is None:
            logger.error("Could not read image: %s", file_path)
            return None

        if not _bgr_to_png(image_bgr, output_path):
            # Last resort: raw file copy
            try:
                shutil.copy(file_path, output_path)
                loader = "raw_copy"
            except Exception as exc:
                logger.error("Image copy failed: %s", exc)
                return None

        _image_cache[key] = output_path

        h, w = image_bgr.shape[:2]
        return {
            "image_path":  _to_url_path(output_path),
            "width":       w,
            "height":      h,
            "image_bgr":   image_bgr,
            "page":        1,
            "total_pages": 1,
            "dpi":         None,
            "source_type": "image",
            "loader":      loader,
        }

    else:
        logger.warning("Unsupported file_type: %s", file_type)
        return None


# ─── Utilities ────────────────────────────────────────────────────────────────

def _to_url_path(path: str) -> str:
    """Convert filesystem path to an authenticated API URL path."""
    filename = os.path.basename(path)
    return f"/api/rendered/{filename}"


def _count_pdf_pages(file_path: str) -> int:
    if not HAS_PYMUPDF:
        return 1
    try:
        with fitz.open(file_path) as doc:
            return len(doc)
    except Exception:
        return 1


def clear_cache() -> None:
    """Clear the in-memory image cache. Call after each request if needed."""
    _image_cache.clear()