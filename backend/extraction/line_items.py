import re

AMOUNT_RE = re.compile(r"(?<!\d)\d+(?:,\d{3})*(?:\.\d{2})")

def extract_line_items(text: str) -> list[float]:
    """
    Heuristic:
    - Extract all monetary values
    - Exclude obvious totals later via validation
    """

    amounts = []

    for line in text.splitlines():
        matches = AMOUNT_RE.findall(line)
        for m in matches:
            try:
                amounts.append(float(m.replace(",", "")))
            except ValueError:
                pass

    return amounts
