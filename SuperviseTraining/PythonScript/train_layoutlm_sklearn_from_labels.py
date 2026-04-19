#!/usr/bin/env python3
"""
Train frozen LayoutLMv3 embeddings + sklearn classifier from a labels CSV.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


REPO_ROOT = Path(__file__).resolve().parents[2]
SUPERVISE_ROOT = REPO_ROOT / "SuperviseTraining"
BACKEND_DIR = REPO_ROOT / "backend"
AI_PIPELINE_DIR = REPO_ROOT / "ai_pipeline"

for import_path in (str(BACKEND_DIR), str(AI_PIPELINE_DIR)):
    if import_path not in sys.path:
        sys.path.insert(0, import_path)

from services.layoutlm_model_registry import save_supervised_model_bundle  # noqa: E402


def _read_rows(labels_path: Path) -> list[dict[str, str]]:
    with labels_path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def _stratified_limit(rows: list[dict[str, str]], limit: int | None) -> list[dict[str, str]]:
    if limit is None or limit <= 0 or len(rows) <= limit:
        return rows
    by_label = {
        "0": [row for row in rows if row["label"] == "0"],
        "1": [row for row in rows if row["label"] == "1"],
    }
    half = max(1, limit // 2)
    selected = by_label["0"][:half] + by_label["1"][: limit - half]
    return sorted(selected, key=lambda row: row["file_id"])


def _embedding_cache_path(cache_dir: Path, file_id: str) -> Path:
    return cache_dir / f"{file_id}.npy"


def _load_embedding(row: dict[str, str], cache_dir: Path) -> np.ndarray:
    from advanced.pipeline_layoutlm import process_invoice_layoutlm

    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = _embedding_cache_path(cache_dir, row["file_id"])
    if cache_path.exists():
        return np.load(cache_path)

    image_path = SUPERVISE_ROOT / row["image_path"]
    embedding = np.asarray(process_invoice_layoutlm(str(image_path)), dtype=np.float32)
    np.save(cache_path, embedding)
    return embedding


def _matrix(rows: list[dict[str, str]], cache_dir: Path) -> tuple[np.ndarray, np.ndarray]:
    embeddings = [_load_embedding(row, cache_dir) for row in rows]
    labels = [int(row["label"]) for row in rows]
    return np.vstack(embeddings), np.asarray(labels, dtype=np.int64)


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision_approved": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall_approved": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1_approved": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
    }


def _manifest_rows(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    manifest = []
    for row in rows:
        manifest.append(
            {
                "file_id": row["file_id"],
                "split": row["split"],
                "image_path": row["image_path"],
                "box_path": row.get("box_path"),
                "entities_path": row.get("entities_path"),
                "decision": row["decision"],
                "label": int(row["label"]),
                "label_source": row.get("label_source"),
                "pseudo_risk_score": row.get("pseudo_risk_score"),
                "pseudo_rule_version": row.get("pseudo_rule_version"),
            }
        )
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--labels", required=True)
    parser.add_argument("--user-id", type=int, default=1)
    parser.add_argument("--iterations", type=int, default=None)
    parser.add_argument("--epochs", type=int, default=None)
    parser.add_argument("--max-train-samples", type=int, default=None)
    parser.add_argument("--max-test-samples", type=int, default=None)
    parser.add_argument("--model-prefix", default="demo_layoutlm_supervised")
    parser.add_argument("--cache-dir", default=str(SUPERVISE_ROOT / "embedding_cache"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    labels_path = Path(args.labels).resolve()
    rows = _read_rows(labels_path)

    train_rows = [row for row in rows if row["split"] == "train"]
    test_rows = [row for row in rows if row["split"] == "test"]
    train_rows = _stratified_limit(train_rows, args.max_train_samples)
    test_rows = _stratified_limit(test_rows, args.max_test_samples)

    if len(train_rows) < 2 or len({row["label"] for row in train_rows}) < 2:
        raise SystemExit("Need at least one approved and one rejected training sample.")
    if len(test_rows) < 2 or len({row["label"] for row in test_rows}) < 2:
        raise SystemExit("Need at least one approved and one rejected test sample.")

    first_row = train_rows[0]
    iterations = args.iterations or int(first_row.get("recommended_iterations") or 200)
    epochs = args.epochs or int(first_row.get("recommended_epochs") or 1)
    max_iter = max(50, min(iterations * epochs, 5000))
    cache_dir = Path(args.cache_dir).resolve()

    X_train, y_train = _matrix(train_rows, cache_dir)
    X_test, y_test = _matrix(test_rows, cache_dir)

    classifier = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "classifier",
                LogisticRegression(
                    max_iter=max_iter,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ]
    )
    classifier.fit(X_train, y_train)
    y_pred = classifier.predict(X_test)

    metrics = {
        **_metrics(y_test, y_pred),
        "evaluation_mode": "fixed_supervise_training_test_split",
        "train_count": len(train_rows),
        "test_count": len(test_rows),
    }

    all_train_embeddings = X_train
    centroid = all_train_embeddings.mean(axis=0)
    distances = np.linalg.norm(all_train_embeddings - centroid, axis=1)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    scenario = labels_path.stem.replace("labels_", "")
    model_id = f"{args.model_prefix}_{scenario}_{timestamp}"
    label_sources = sorted({row.get("label_source", "") for row in train_rows})
    approved_count = int((y_train == 1).sum())
    rejected_count = int((y_train == 0).sum())

    metadata = {
        "id": model_id,
        "name": f"Demo LayoutLMv3 {scenario}",
        "model_type": "layoutlmv3_supervised_sklearn",
        "algorithm": "StandardScaler + LogisticRegression",
        "layout_model": "microsoft/layoutlmv3-base",
        "label_mapping": {"rejected": 0, "approved": 1},
        "positive_label": "approved",
        "negative_label": "rejected",
        "label_source": ",".join(label_sources),
        "pseudo_rule_version": scenario,
        "production_ready": False,
        "trained_sample_count": len(train_rows),
        "approved_count": approved_count,
        "rejected_count": rejected_count,
        "iterations": iterations,
        "epochs": epochs,
        "max_iter": max_iter,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "metrics": metrics,
        "is_baseline": False,
    }

    bundle = {
        "feature_dim": int(X_train.shape[1]),
        "centroid": centroid.astype(float).tolist(),
        "mean_distance": float(distances.mean()),
        "std_distance": float(distances.std() or 1.0),
        "classes": [int(c) for c in classifier.named_steps["classifier"].classes_],
    }

    saved = save_supervised_model_bundle(
        user_id=args.user_id,
        model_id=model_id,
        model=classifier,
        bundle=bundle,
        metadata=metadata,
        manifest_rows=_manifest_rows(train_rows + test_rows),
    )

    print(json.dumps({"status": "trained", "model": saved, "metrics": metrics}, indent=2))


if __name__ == "__main__":
    main()
