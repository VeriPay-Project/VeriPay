import glob
import logging
import os
from advanced.pipeline_layoutlm import process_invoice_layoutlm
from advanced.anomaly import AnomalyDetector
from utils.normalize import normalize_scores
from utils.visualize import visualize_results

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main():
    invoice_paths = glob.glob("sample_invoices/*.pdf")

    if len(invoice_paths) < 2:
        raise ValueError("Add at least 2 PDF invoices")

    detector = AnomalyDetector()
    embeddings = []

    logger.info("Found %d invoices (LayoutLMv3 pipeline)", len(invoice_paths))

    # ---- Feature extraction ----
    for path in invoice_paths:
        embeddings.append(process_invoice_layoutlm(path))

    # ---- Train AI ----
    detector.train([dict(enumerate(e)) for e in embeddings])

    # ---- Scoring ----
    results = []
    for path in invoice_paths:
        emb = process_invoice_layoutlm(path)
        score = detector.score(dict(enumerate(emb)))

        results.append({
            "invoice": os.path.basename(path),
            "score": score
        })

    # ---- Normalize ----
    normalize_scores(results)
    results.sort(key=lambda x: x["normalized_score"], reverse=True)

    logger.info("LayoutLMv3 Anomaly Detection Results")
    logger.info("-----------------------------------")

    for r in results:
        logger.info("%s -> %s", r["invoice"], round(r["normalized_score"], 3))

    visualize_results(results)

if __name__ == "__main__":
    main()
