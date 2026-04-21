from __future__ import annotations

from datetime import datetime
from pathlib import Path
import sys
from typing import Any

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import LeaveOneOut, cross_val_predict, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy.orm import Session

from models.invoice import Invoice
from models.review import InvoiceReview
from services.layoutlm_model_registry import (
    AI_PIPELINE_DIR,
    save_supervised_model_bundle,
)

if str(AI_PIPELINE_DIR) not in sys.path:
    sys.path.append(str(AI_PIPELINE_DIR))

LABEL_MAPPING = {"rejected": 0, "approved": 1}
VALID_DECISIONS = tuple(LABEL_MAPPING.keys())


def _reviewed_invoice_rows(db: Session, user_id: int) -> list[tuple[Invoice, InvoiceReview]]:
    rows = (
        db.query(Invoice, InvoiceReview)
        .join(InvoiceReview, InvoiceReview.invoice_id == Invoice.invoice_id)
        .filter(
            Invoice.user_id == user_id,
            InvoiceReview.decision.in_(VALID_DECISIONS),
        )
        .order_by(InvoiceReview.updated_at.desc())
        .all()
    )
    return [(invoice, review) for invoice, review in rows]


def get_layoutlm_dataset_summary(db: Session, user_id: int) -> dict[str, Any]:
    rows = _reviewed_invoice_rows(db, user_id)
    approved = 0
    rejected = 0
    ready_approved = 0
    ready_rejected = 0
    missing_files = 0

    for invoice, review in rows:
        file_exists = Path(invoice.file_path).exists()
        if review.decision == "approved":
            approved += 1
            if file_exists:
                ready_approved += 1
        elif review.decision == "rejected":
            rejected += 1
            if file_exists:
                ready_rejected += 1
        if not file_exists:
            missing_files += 1

    ready = len(rows) - missing_files
    return {
        "total_labeled": len(rows),
        "ready_for_training": ready,
        "approved_count": approved,
        "rejected_count": rejected,
        "ready_approved": ready_approved,
        "ready_rejected": ready_rejected,
        "missing_file_count": missing_files,
        "label_mapping": LABEL_MAPPING,
        "can_train": ready_approved >= 1 and ready_rejected >= 1,
    }


def _extract_embeddings(rows: list[tuple[Invoice, InvoiceReview]]) -> tuple[np.ndarray, np.ndarray, list[dict[str, Any]]]:
    from advanced.pipeline_layoutlm import process_invoice_layoutlm

    embeddings: list[np.ndarray] = []
    labels: list[int] = []
    manifest_rows: list[dict[str, Any]] = []

    for invoice, review in rows:
        path = Path(invoice.file_path)
        if not path.exists():
            continue

        embedding = np.asarray(process_invoice_layoutlm(str(path)), dtype=np.float32)
        embeddings.append(embedding)
        labels.append(LABEL_MAPPING[review.decision])
        manifest_rows.append(
            {
                "invoice_id": invoice.invoice_id,
                "file_path": str(path),
                "decision": review.decision,
                "label": LABEL_MAPPING[review.decision],
                "reviewed_at": review.reviewed_at.isoformat() if review.reviewed_at else None,
                "updated_at": review.updated_at.isoformat() if review.updated_at else None,
            }
        )

    if not embeddings:
        return np.empty((0, 768), dtype=np.float32), np.empty((0,), dtype=np.int64), []

    return np.vstack(embeddings), np.asarray(labels, dtype=np.int64), manifest_rows


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision_approved": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall_approved": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1_approved": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
    }


def train_layoutlm_supervised_model(
    *,
    db: Session,
    user_id: int,
    iterations: int = 200,
    epochs: int | None = None,
    min_samples: int = 2,
    test_size: float = 0.2,
) -> dict[str, Any]:
    rows = _reviewed_invoice_rows(db, user_id)
    X, y, manifest_rows = _extract_embeddings(rows)

    if len(y) < min_samples:
        raise ValueError(f"Need at least {min_samples} labeled invoices. Found {len(y)}.")
    if len(set(y.tolist())) < 2:
        raise ValueError("Need at least one approved and one rejected invoice.")

    iterations = max(1, min(int(iterations), 5000))
    requested_epochs = int(epochs) if epochs is not None else None
    epoch_multiplier = max(1, requested_epochs or 1)
    max_iter = max(1, min(iterations * epoch_multiplier, 5000))

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

    class_counts = {label: int((y == label).sum()) for label in set(y.tolist())}
    can_split = len(y) >= 10 and min(class_counts.values()) >= 2

    if can_split:
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=test_size,
            random_state=42,
            stratify=y,
        )
        classifier.fit(X_train, y_train)
        y_pred = classifier.predict(X_test)
        metrics = {**_metrics(y_test, y_pred), "evaluation_mode": "stratified_holdout"}
    elif len(y) >= 4 and min(class_counts.values()) >= 2:
        # Leave-one-out CV for small datasets — honest estimate without splitting issues
        y_pred_loo = cross_val_predict(classifier, X, y, cv=LeaveOneOut())
        classifier.fit(X, y)
        metrics = {**_metrics(y, y_pred_loo), "evaluation_mode": "leave_one_out"}
    else:
        classifier.fit(X, y)
        metrics = {"evaluation_mode": "too_small"}

    centroid = X.mean(axis=0)
    distances = np.linalg.norm(X - centroid, axis=1)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    model_id = f"layoutlm_supervised_{timestamp}"
    approved_count = int((y == LABEL_MAPPING["approved"]).sum())
    rejected_count = int((y == LABEL_MAPPING["rejected"]).sum())

    metadata = {
        "id": model_id,
        "name": f"LayoutLMv3 supervised {timestamp}",
        "model_type": "layoutlmv3_supervised_sklearn",
        "algorithm": "StandardScaler + LogisticRegression",
        "layout_model": "microsoft/layoutlmv3-base",
        "label_mapping": LABEL_MAPPING,
        "positive_label": "approved",
        "negative_label": "rejected",
        "trained_sample_count": int(len(y)),
        "approved_count": approved_count,
        "rejected_count": rejected_count,
        "iterations": iterations,
        "epochs": requested_epochs,
        "max_iter": max_iter,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "metrics": metrics,
        "is_baseline": False,
    }

    bundle = {
        "feature_dim": int(X.shape[1]),
        "centroid": centroid.astype(float).tolist(),
        "mean_distance": float(distances.mean()),
        "std_distance": float(distances.std() or 1.0),
        "classes": [int(c) for c in classifier.named_steps["classifier"].classes_],
    }

    return save_supervised_model_bundle(
        user_id=user_id,
        model_id=model_id,
        model=classifier,
        bundle=bundle,
        metadata=metadata,
        manifest_rows=manifest_rows,
    )
