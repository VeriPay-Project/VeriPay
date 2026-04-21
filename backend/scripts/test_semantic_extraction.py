import asyncio
import json
import logging
import sys
import time
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.append(str(BACKEND_DIR))

from services.semantic_extraction_service import extract_invoice_semantic

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


SAMPLE_TEXT = """
PinnacleEdge Technologies
LLC
INVOICE
Bill From
Bill To
Invoice No.
INV-2025-03741
Date Issued
March 21, 2025
Due Date
April 4, 2025
PO Reference
PO-HRG-20250219
Payment Terms
Net 14
Currency
USD
EIN
EIN: 82-4471209
D-U-N-S
D-U-N-S: 078-241-563
PinnacleEdge Technologies LLC
Horizon Retail Group Inc.
1250 Avenue of the Americas, Suite
2100
350 Fifth Avenue, Suite 4100
New York, NY 10020
New York, NY 10118
United States
United States
+1 (212) 555-0348
Patricia Nguyen
billing@pinnacleedgetech.com
ap@horizonretailgroup.com
www.pinnacleedgetech.com
Subtotal
$35,595.00
Sales Tax
N/A
TOTAL DUE (USD)
$35,595.00
Wire Transfer / ACH Payment Details
Bank Name
Bank of America, N.A.
Account Name
PinnacleEdge Technologies LLC
ABA Routing No.
026009593
Account No.
8831047290
SWIFT/BIC
BOFAUS3N
Reference
INV-2025-03741
"""

EXPECTED_FIELDS = {
    "vendor_name": "PinnacleEdge Technologies LLC",
    "customer_name": "Horizon Retail Group Inc.",
    "invoice_number": "INV-2025-03741",
    "invoice_date": "March 21, 2025",
    "bank_name": "Bank of America, N.A.",
    "bank_account": "026009593-8831047290",
    "subtotal": "35595.00",
    "total_amount": "35595.00",
    "currency": "USD",
}


def main():
    started_at = time.perf_counter()
    extracted = asyncio.run(extract_invoice_semantic(SAMPLE_TEXT))
    logger.info("Semantic extraction result:")
    logger.info(json.dumps(extracted, indent=2))
    missing_or_wrong = {
        key: {"expected": expected, "actual": extracted.get(key)}
        for key, expected in EXPECTED_FIELDS.items()
        if extracted.get(key) != expected
    }
    if missing_or_wrong:
        logger.error("Regression detected: %s", json.dumps(missing_or_wrong, indent=2))
        raise SystemExit(1)
    logger.info("Elapsed: %.2fs", time.perf_counter() - started_at)


if __name__ == "__main__":
    main()
