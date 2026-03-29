import glob
import os
from advanced.pipeline_layoutlm import process_invoice_layoutlm
from advanced.anomaly import AnomalyDetector
from utils.normalize import normalize_scores
from utils.visualize import visualize_results


def main():
    invoice_paths = glob.glob("sample_invoices/*.pdf")

    if len(invoice_paths) < 2:
        raise ValueError("Add at least 2 PDF invoices")

    detector = AnomalyDetector()
    embeddings = []

    print(f"Found {len(invoice_paths)} invoices (LayoutLMv3 pipeline)")

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

    print("\nLayoutLMv3 Anomaly Detection Results")
    print("-----------------------------------")

    for r in results:
        print(f"{r['invoice']} → {round(r['normalized_score'], 3)}")

    visualize_results(results)

if __name__ == "__main__":
    main()
