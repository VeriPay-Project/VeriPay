import glob
import os
from baseline.pipeline import process_invoice
from advanced.anomaly import AnomalyDetector
from baseline.explain import compute_feature_stats, explain_anomaly
from utils.normalize import normalize_scores
from utils.visualize import visualize_results


def main():
    invoice_paths = glob.glob("sample_invoices/*.pdf")

    if len(invoice_paths) < 2:
        raise ValueError("Add at least 2 PDF invoices to sample_invoices/")

    detector = AnomalyDetector()
    feature_list = []

    print(f"Found {len(invoice_paths)} invoices")

    # ---- Feature extraction ----
    for path in invoice_paths:
        feature_list.append(process_invoice(path))

    # ---- Train AI ----
    detector.train(feature_list)

    # ---- Explainability baseline ----
    stats = compute_feature_stats(feature_list)

    # ---- Scoring ----
    results = []
    for path in invoice_paths:
        features = process_invoice(path)
        score = detector.score(features)
        reasons = explain_anomaly(features, stats)

        results.append({
            "invoice": os.path.basename(path),
            "score": score,
            "reasons": reasons
        })

    # ---- Normalize ----
    normalize_scores(results)

    # ---- Sort & print ----
    results.sort(key=lambda x: x["normalized_score"], reverse=True)

    print("\nAI Anomaly Detection Results")
    print("----------------------------")

    for r in results:
        print(f"\n{r['invoice']}")
        print(f"  normalized_score: {round(r['normalized_score'], 3)}")
        if r["reasons"]:
            print("  reasons:")
            for reason in r["reasons"]:
                print(f"   - {reason}")
        else:
            print("  reasons: none")

    # ---- Visualize ----
    visualize_results(results)

if __name__ == "__main__":
    main()
