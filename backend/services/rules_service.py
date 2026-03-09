import re
from typing import Optional, Tuple

from PyPDF2 import PdfReader
from extraction.image_extractor import (
    detect_layout,
    extract_table_regions,
    extract_table_text,
    pdf_to_image,
)

AMOUNT_RE = re.compile(r"(?<!\d)(?:\$?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})|\$?\s?\d+\.\d{2})(?!\d)")
ROW_NUMBER_RE = re.compile(r"(?<!\d)\d+(?:,\d{3})*(?:\.\d+)?(?!\d)")

TOTAL_KEYWORDS = ("total", "amount due", "balance due", "invoice total")
SUBTOTAL_KEYWORDS = ("subtotal",)
TAX_KEYWORDS = ("tax", "hst", "gst", "vat")


def _parse_amount(raw: str) -> Optional[float]:
    cleaned = raw.replace("$", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def _extract_text_and_fonts(pdf_path: str) -> Tuple[str, list[str]]:
    reader = PdfReader(pdf_path)
    text_parts = []
    fonts = set()

    for page in reader.pages:
        try:
            text_parts.append(page.extract_text() or "")
        except Exception:
            text_parts.append("")

        resources = page.get("/Resources")
        try:
            resources_obj = resources.get_object() if resources else None
        except Exception:
            resources_obj = resources

        if resources_obj and "/Font" in resources_obj:
            font_dict = resources_obj["/Font"]
            try:
                font_keys = font_dict.keys()
            except Exception:
                try:
                    font_keys = font_dict.get_object().keys()
                except Exception:
                    font_keys = []
            for key in font_keys:
                fonts.add(str(key))

    return "\n".join(text_parts).strip(), sorted(fonts)


def _parse_table_row(row_text: str) -> Optional[dict]:
    if not row_text or not row_text.strip():
        return None

    lowered = row_text.lower()
    if any(keyword in lowered for keyword in TOTAL_KEYWORDS + SUBTOTAL_KEYWORDS + TAX_KEYWORDS):
        return None

    numbers = ROW_NUMBER_RE.findall(row_text)
    if not numbers:
        return None

    line_total = _parse_amount(numbers[-1])
    if line_total is None:
        return None

    first_num_match = ROW_NUMBER_RE.search(row_text)
    description = row_text[:first_num_match.start()].strip() if first_num_match else row_text.strip()
    unit_price = _parse_amount(numbers[0]) if len(numbers) >= 2 else None
    quantity = _parse_amount(numbers[1]) if len(numbers) >= 3 else None

    return {
        "description": description or None,
        "unit_price": unit_price,
        "quantity": quantity,
        "line_total": line_total,
        "raw_row": row_text.strip()
    }


def _extract_line_items_from_tables(pdf_path: str) -> dict:
    image = pdf_to_image(pdf_path)
    if image is None:
        return {"line_items": [], "line_item_sum": 0.0, "line_item_count": 0}

    layout = detect_layout(image)
    tables = extract_table_regions(layout)
    if not tables:
        return {"line_items": [], "line_item_sum": 0.0, "line_item_count": 0}

    rows = extract_table_text(image, tables)
    line_items = []
    line_item_sum = 0.0

    for row in rows:
        parsed = _parse_table_row(row)
        if not parsed:
            continue
        line_items.append(parsed)
        line_item_sum += parsed["line_total"]

    return {
        "line_items": line_items,
        "line_item_sum": line_item_sum,
        "line_item_count": len(line_items)
    }


def run_rules_checks(pdf_path: str) -> dict:
    text, fonts = _extract_text_and_fonts(pdf_path)
    words = [word for word in text.split() if word.strip()]
    word_count = len(words)

    if not text:
        return {
            "status": "no_text",
            "word_count": word_count,
            "font_count": len(fonts),
            "fonts": fonts,
            "message": "No text extracted from PDF."
        }

    subtotal = None
    tax = None
    total = None
    heuristic_line_item_sum = 0.0
    heuristic_line_item_count = 0

    for line in text.splitlines():
        if not line.strip():
            continue
        amounts = [_parse_amount(m.group(0)) for m in AMOUNT_RE.finditer(line)]
        amounts = [amount for amount in amounts if amount is not None]
        if not amounts:
            continue

        lowered = line.lower()
        last_amount = amounts[-1]

        if any(keyword in lowered for keyword in TOTAL_KEYWORDS):
            total = last_amount
            continue

        if any(keyword in lowered for keyword in SUBTOTAL_KEYWORDS):
            subtotal = last_amount
            continue

        if any(keyword in lowered for keyword in TAX_KEYWORDS):
            tax = last_amount
            continue

        heuristic_line_item_sum += last_amount
        heuristic_line_item_count += 1

    table_line_items = _extract_line_items_from_tables(pdf_path)
    if table_line_items["line_item_count"] > 0:
        line_items = table_line_items["line_items"]
        line_item_sum = table_line_items["line_item_sum"]
        line_item_count = table_line_items["line_item_count"]
        line_item_source = "layoutparser"
    else:
        line_items = []
        line_item_sum = heuristic_line_item_sum
        line_item_count = heuristic_line_item_count
        line_item_source = "heuristic"

    # If subtotal is missing, derive it from detected line items.
    if subtotal is None and line_item_count > 0:
        subtotal = line_item_sum

    checks = {}
    subtotal_vs_items = None
    subtotal_delta = None
    if subtotal is not None and line_item_count:
        subtotal_vs_items = subtotal - line_item_sum
        subtotal_delta = abs(subtotal_vs_items)

    total_vs_subtotal_tax = None
    total_delta = None
    if total is not None and subtotal is not None and tax is not None:
        expected_total = subtotal + tax
        total_vs_subtotal_tax = total - expected_total
        total_delta = abs(total_vs_subtotal_tax)

    # Keep existing keys for frontend compatibility; values are numeric deltas.
    checks["subtotal_matches_items"] = (
        round(subtotal_vs_items, 2) if subtotal_vs_items is not None else None
    )
    checks["subtotal_delta"] = (
        round(subtotal_delta, 2) if subtotal_delta is not None else None
    )
    checks["total_matches_subtotal_tax"] = (
        round(total_vs_subtotal_tax, 2)
        if total_vs_subtotal_tax is not None else None
    )
    checks["total_delta"] = (
        round(total_delta, 2) if total_delta is not None else None
    )

    if line_item_count == 0 and subtotal is None and total is None:
        status = "insufficient_amounts"
    else:
        status = "ok"

    return {
        "status": status,
        "word_count": word_count,
        "font_count": len(fonts),
        "fonts": fonts,
        "line_item_source": line_item_source,
        "line_items": line_items,
        "line_item_count": line_item_count,
        "line_item_sum": round(line_item_sum, 2) if line_item_count else None,
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "subtotal_vs_items": (
            round(subtotal_vs_items, 2) if subtotal_vs_items is not None else None
        ),
        "total_vs_subtotal_tax": (
            round(total_vs_subtotal_tax, 2)
            if total_vs_subtotal_tax is not None else None
        ),
        "subtotal_delta": (
            round(subtotal_delta, 2) if subtotal_delta is not None else None
        ),
        "total_delta": (
            round(total_delta, 2) if total_delta is not None else None
        ),
        "checks": checks
    }
