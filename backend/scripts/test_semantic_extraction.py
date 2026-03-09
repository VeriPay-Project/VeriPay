import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.append(str(BACKEND_DIR))

from services.semantic_extraction_service import extract_invoice_semantic


SAMPLE_TEXT = """
Vendor: ABC Supplies Ltd
Invoice Number: INV-2026-00123
Bank Name: Example Bank
Account: DE89 3704 0044 0532 0130 00
Total Amount: 482.49
"""


def main():
    extracted = extract_invoice_semantic(SAMPLE_TEXT)
    print("Semantic extraction result:")
    print(json.dumps(extracted, indent=2))


if __name__ == "__main__":
    main()
