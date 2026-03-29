import glob
import os
import pickle
import json
import numpy as np

from advanced.pipeline_layoutlm import process_invoice_layoutlm
from advanced.anomaly import AnomalyDetector

MODEL_DIR = "saved_models"
MODEL_PATH = f"{MODEL_DIR}/anomaly_model.pkl"
STATS_PATH = f"{MODEL_DIR}/embedding_stats.json"


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)

    invoice_paths = glob.glob("sample_invoices/*.pdf")

    if len(invoice_paths) < 5:
        raise ValueError("Need at least 5 reference invoices")

    print(f"Training reference model on {len(invoice_paths)} invoices")

    embeddings = []

    for path in invoice_paths:
        emb = process_invoice_layoutlm(path)
        embeddings.append(emb)

    embeddings = np.array(embeddings)

    # ---- Train anomaly detector ----
    detector = AnomalyDetector()
    detector.train([dict(enumerate(e)) for e in embeddings])

    # ---- Compute embedding statistics ----
    centroid = embeddings.mean(axis=0)

    distances = np.linalg.norm(embeddings - centroid, axis=1)

    stats = {
        "centroid": centroid.tolist(),
        "mean_distance": float(distances.mean()),
        "std_distance": float(distances.std()),
        "avg_distance": float(distances.mean()),
        "max_distance": float(distances.max())
    }

    # ---- Save model ----
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(detector, f)

    # ---- Save stats ----
    with open(STATS_PATH, "w") as f:
        json.dump(stats, f, indent=2)

    print(f"Model saved to {MODEL_PATH}")
    print(f"Embedding stats saved to {STATS_PATH}")


if __name__ == "__main__":
    main()
