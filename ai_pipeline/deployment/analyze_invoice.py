import sys
import pickle
import json
import numpy as np

from advanced.pipeline_layoutlm import process_invoice_layoutlm
from interpretation.explanation import compute_z_score, generate_explanations
from interpretation.risk_policy import interpret_risk

MODEL_PATH = "saved_models/anomaly_model.pkl"
STATS_PATH = "saved_models/embedding_stats.json"


def main():
    if len(sys.argv) != 2:
        print("Usage: python -m deployment.analyze_invoice <invoice.pdf>")
        sys.exit(1)

    invoice_path = sys.argv[1]

    # ---- Load trained model ----
    with open(MODEL_PATH, "rb") as f:
        detector = pickle.load(f)

    # ---- Load embedding statistics ----
    with open(STATS_PATH, "r") as f:
        stats = json.load(f)

    # ---- Extract embedding ----
    embedding = process_invoice_layoutlm(invoice_path)

    # ---- Anomaly scoring ----
    raw_score = detector.score(dict(enumerate(embedding)))
    normalized_score = 1 / (1 + np.exp(-raw_score))

    # ---- Compute distance (same meaning as old explain_embedding) ----
    centroid = np.array(stats["centroid"])
    distance = np.linalg.norm(embedding - centroid)

    # ---- Compute z-score (new, stronger signal) ----
    distance_z = compute_z_score(
        distance,
        stats["mean_distance"],
        stats["std_distance"]
    )

    # ---- Risk interpretation (OLD logic + NEW logic combined) ----
    # Base risk from anomaly score
    risk, review_required = interpret_risk(normalized_score)

    # Policy override: extreme structural deviation escalates risk
    if distance_z >= 2.5:
        risk = "HIGH"
        review_required = True

    # ---- Explanation (replaces old explain_embedding text) ----
    explanations = generate_explanations(distance_z, normalized_score)

    # ---- Output ----
    print("\nAI Invoice Review Result")
    print("------------------------")
    print(f"Invoice: {invoice_path}")
    print(f"Anomaly score: {round(normalized_score, 3)}")
    print(f"Risk level: {risk}")
    print(f"Review required: {review_required}")
    print(f"Embedding distance: {round(distance, 2)}")
    print(f"Distance z-score: {round(distance_z, 2)}")
    print("Explanation:")
    for e in explanations:
        print(f" - {e}")


if __name__ == "__main__":
    main()
