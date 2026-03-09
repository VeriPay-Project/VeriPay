from functools import lru_cache
import shutil

import pytesseract
from PIL import Image

try:
    import numpy as np
except Exception:  # pragma: no cover - optional runtime dependency guard
    np = None

try:
    from pdf2image import convert_from_path
except Exception:  # pragma: no cover - optional runtime dependency guard
    convert_from_path = None

try:
    import layoutparser as lp
except Exception:  # pragma: no cover - optional runtime dependency guard
    lp = None


# Resolve tesseract binary dynamically (cross-platform)
tesseract_path = shutil.which("tesseract")

if not tesseract_path:
    raise RuntimeError(
        "Tesseract OCR is not installed or not in PATH. "
        "Install it using:\n"
        "  macOS: brew install tesseract\n"
        "  Ubuntu: sudo apt install tesseract-ocr\n"
        "  Windows: https://github.com/UB-Mannheim/tesseract/wiki"
    )

pytesseract.pytesseract.tesseract_cmd = tesseract_path


@lru_cache(maxsize=1)
def _get_layout_model():
    if lp is None:
        return None
    try:
        return lp.AutoLayoutModel(
            "lp://PubLayNet/faster_rcnn_R_50_FPN_3x/config"
        )
    except Exception:
        return None


@lru_cache(maxsize=1)
def _get_ocr_agent():
    if lp is None:
        return None
    try:
        return lp.TesseractAgent(languages="eng")
    except Exception:
        return None


def pdf_to_image(pdf_path: str):
    if convert_from_path is None:
        return None
    images = convert_from_path(pdf_path)
    if not images:
        return None
    return images[0]


def detect_layout(image) -> list:
    layout_model = _get_layout_model()
    if layout_model is None or image is None or np is None:
        return []

    image_np = np.array(image)
    try:
        return layout_model.detect(image_np)
    except Exception:
        return []


def extract_table_regions(layout) -> list:
    tables = []
    for block in layout or []:
        block_type = str(getattr(block, "type", "")).lower()
        if block_type == "table":
            tables.append(block)
    return tables


def extract_table_text(image, tables: list) -> list[str]:
    if image is None or not tables or np is None:
        return []

    ocr_agent = _get_ocr_agent()
    if ocr_agent is None:
        return []

    image_np = np.array(image)
    rows: list[str] = []

    for table in tables:
        try:
            if hasattr(table, "crop_image"):
                segment = table.crop_image(image_np)
            elif hasattr(table, "crop"):
                segment = table.crop(image_np)
            else:
                continue

            text = ocr_agent.detect(segment) or ""
            for line in text.splitlines():
                line = line.strip()
                if line:
                    rows.append(line)
        except Exception:
            continue

    return rows


def extract_image_content(file_path: str) -> dict:
    image = Image.open(file_path)

    text = pytesseract.image_to_string(image)

    return {
        "text": text.strip(),
        "signature_present": False,
        "signature_metadata": None,
    }
