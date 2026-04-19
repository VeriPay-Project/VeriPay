#!/usr/bin/env python3
"""
Generate synthetic/pseudo approve-reject labels for SuperviseTraining.

These labels are for supervised-training workflow demos and smoke tests.
They are not human-review labels and should not be treated as production
ground truth.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
from dataclasses import dataclass
from pathlib import Path
from statistics import quantiles
from typing import Iterable


SCENARIOS = {
    "v1_random": {
        "filename": "labels_v1_random.csv",
        "train_fraction": 0.25,
        "noise": 1.0,
        "iterations": 100,
        "epochs": 1,
    },
    "v2_weak_rules": {
        "filename": "labels_v2_weak_rules.csv",
        "train_fraction": 0.40,
        "noise": 0.35,
        "iterations": 150,
        "epochs": 1,
    },
    "v3_medium_rules": {
        "filename": "labels_v3_medium_rules.csv",
        "train_fraction": 0.60,
        "noise": 0.20,
        "iterations": 200,
        "epochs": 1,
    },
    "v4_strong_rules": {
        "filename": "labels_v4_strong_rules.csv",
        "train_fraction": 0.80,
        "noise": 0.10,
        "iterations": 250,
        "epochs": 2,
    },
    "v5_clean_rules": {
        "filename": "labels_v5_clean_rules.csv",
        "train_fraction": 1.00,
        "noise": 0.02,
        "iterations": 350,
        "epochs": 2,
    },
}

FIELDNAMES = [
    "file_id",
    "split",
    "image_path",
    "box_path",
    "entities_path",
    "decision",
    "label",
    "label_source",
    "pseudo_risk_score",
    "pseudo_rule_version",
    "total_amount",
    "ocr_box_count",
    "text_length",
    "missing_fields",
    "noise_applied",
    "recommended_iterations",
    "recommended_epochs",
]


@dataclass(frozen=True)
class Sample:
    file_id: str
    split: str
    image_path: Path
    box_path: Path
    entities_path: Path
    entities: dict[str, str]
    ocr_text: str
    ocr_box_count: int
    text_length: int
    total_amount: float | None
    missing_fields: list[str]
    pseudo_risk_score: float


def _normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _stable_jitter(file_id: str) -> float:
    digest = hashlib.sha256(file_id.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _parse_total(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"-?\d+(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?", value)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def _read_entities(path: Path) -> dict[str, str]:
    data = json.loads(path.read_text())
    return {str(key): "" if value is None else str(value).strip() for key, value in data.items()}


def _read_box_text(path: Path) -> tuple[str, int]:
    words: list[str] = []
    count = 0
    for raw_line in path.read_text(errors="ignore").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split(",", 8)
        if len(parts) < 9:
            continue
        count += 1
        words.append(parts[8].strip())
    text = " ".join(word for word in words if word)
    return text, count


def _compute_risk(file_id: str, entities: dict[str, str], ocr_text: str, box_count: int) -> tuple[float, list[str], float | None]:
    required = ["company", "date", "address", "total"]
    missing = [field for field in required if not entities.get(field)]
    total_amount = _parse_total(entities.get("total"))

    normalized_ocr = _normalize_text(ocr_text)
    company_present = bool(entities.get("company")) and _normalize_text(entities["company"])[:12] in normalized_ocr
    total_present = bool(entities.get("total")) and _normalize_text(entities["total"]) in normalized_ocr
    date_value = entities.get("date", "")
    date_valid = bool(re.search(r"\d{1,4}[/-]\d{1,2}[/-]\d{1,4}", date_value))
    address_length = len(entities.get("address", ""))
    text_length = len(ocr_text)

    missing_score = len(missing) / len(required)
    ocr_score = 1.0 if box_count < 18 or text_length < 120 else 0.0
    mismatch_score = 0.0
    if not company_present:
        mismatch_score += 0.5
    if not total_present:
        mismatch_score += 0.5
    date_score = 0.0 if date_valid else 1.0
    address_score = 1.0 if address_length < 20 else 0.0
    amount_score = 0.0
    if total_amount is None:
        amount_score = 1.0
    elif total_amount <= 0 or total_amount >= 300:
        amount_score = 1.0
    elif total_amount >= 150:
        amount_score = 0.6

    jitter = (_stable_jitter(file_id) - 0.5) * 0.08
    risk = (
        missing_score * 0.25
        + ocr_score * 0.15
        + mismatch_score * 0.20
        + date_score * 0.10
        + address_score * 0.10
        + amount_score * 0.20
        + jitter
    )
    return max(0.0, min(1.0, risk)), missing, total_amount


def _collect_samples(root: Path) -> list[Sample]:
    samples: list[Sample] = []
    for split in ("train", "test"):
        image_dir = root / split / "img"
        for image_path in sorted(image_dir.glob("*.jpg")):
            file_id = image_path.stem
            box_path = root / split / "box" / f"{file_id}.txt"
            entities_path = root / split / "entities" / f"{file_id}.txt"
            if not box_path.exists() or not entities_path.exists():
                continue

            entities = _read_entities(entities_path)
            ocr_text, box_count = _read_box_text(box_path)
            risk, missing_fields, total_amount = _compute_risk(file_id, entities, ocr_text, box_count)

            samples.append(
                Sample(
                    file_id=file_id,
                    split=split,
                    image_path=image_path,
                    box_path=box_path,
                    entities_path=entities_path,
                    entities=entities,
                    ocr_text=ocr_text,
                    ocr_box_count=box_count,
                    text_length=len(ocr_text),
                    total_amount=total_amount,
                    missing_fields=missing_fields,
                    pseudo_risk_score=risk,
                )
            )
    return samples


def _risk_threshold(samples: Iterable[Sample], rejected_ratio: float) -> float:
    risks = sorted(sample.pseudo_risk_score for sample in samples)
    if not risks:
        return 0.5
    index = max(0, min(len(risks) - 1, int(len(risks) * (1.0 - rejected_ratio))))
    return risks[index]


def _clean_label(sample: Sample, threshold: float) -> int:
    return 0 if sample.pseudo_risk_score >= threshold else 1


def _select_train_subset(samples: list[Sample], fraction: float, rng: random.Random) -> list[Sample]:
    if fraction >= 1.0:
        return list(samples)
    selected: list[Sample] = []
    for label_group in (0, 1):
        group = list(samples[label_group::2])
        rng.shuffle(group)
        keep = max(1, int(round(len(group) * fraction)))
        selected.extend(group[:keep])
    selected.sort(key=lambda sample: sample.file_id)
    return selected


def _write_scenario(
    *,
    root: Path,
    output_dir: Path,
    scenario: str,
    samples: list[Sample],
    seed: int,
    rejected_ratio: float,
) -> Path:
    config = SCENARIOS[scenario]
    rng = random.Random(seed + list(SCENARIOS).index(scenario) * 1009)

    train_samples = [sample for sample in samples if sample.split == "train"]
    test_samples = [sample for sample in samples if sample.split == "test"]
    threshold = _risk_threshold(samples, rejected_ratio)

    train_subset = _select_train_subset(train_samples, config["train_fraction"], rng)
    rows = train_subset + test_samples

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / config["filename"]

    with output_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()

        for sample in rows:
            clean_label = _clean_label(sample, threshold)
            noise_applied = False
            label_source = "pseudo_rule_clean"

            if sample.split == "train":
                if scenario == "v1_random":
                    label = rng.choice([0, 1])
                    noise_applied = label != clean_label
                    label_source = "synthetic_random"
                else:
                    label = clean_label
                    if rng.random() < config["noise"]:
                        label = 1 - label
                        noise_applied = True
                    label_source = "pseudo_rule_noisy" if noise_applied else "pseudo_rule_clean"
            else:
                label = clean_label

            writer.writerow(
                {
                    "file_id": sample.file_id,
                    "split": sample.split,
                    "image_path": sample.image_path.relative_to(root).as_posix(),
                    "box_path": sample.box_path.relative_to(root).as_posix(),
                    "entities_path": sample.entities_path.relative_to(root).as_posix(),
                    "decision": "approved" if label == 1 else "rejected",
                    "label": label,
                    "label_source": label_source,
                    "pseudo_risk_score": f"{sample.pseudo_risk_score:.4f}",
                    "pseudo_rule_version": scenario,
                    "total_amount": "" if sample.total_amount is None else f"{sample.total_amount:.2f}",
                    "ocr_box_count": sample.ocr_box_count,
                    "text_length": sample.text_length,
                    "missing_fields": "|".join(sample.missing_fields),
                    "noise_applied": str(noise_applied).lower(),
                    "recommended_iterations": config["iterations"],
                    "recommended_epochs": config["epochs"],
                }
            )

    return output_path


def _summarize(path: Path) -> str:
    with path.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    train = [row for row in rows if row["split"] == "train"]
    test = [row for row in rows if row["split"] == "test"]
    approved = sum(1 for row in rows if row["label"] == "1")
    rejected = sum(1 for row in rows if row["label"] == "0")
    noisy = sum(1 for row in rows if row["noise_applied"] == "true")
    return (
        f"{path.name}: rows={len(rows)} train={len(train)} test={len(test)} "
        f"approved={approved} rejected={rejected} noisy_train_labels={noisy}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--scenario", choices=["all", *SCENARIOS.keys()], default="all")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--rejected-ratio", type=float, default=0.35)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(args.root).resolve()
    output_dir = Path(args.output_dir).resolve() if args.output_dir else root / "labels"
    samples = _collect_samples(root)
    if not samples:
        raise SystemExit(f"No samples found under {root}")

    scenarios = list(SCENARIOS) if args.scenario == "all" else [args.scenario]
    for scenario in scenarios:
        output_path = _write_scenario(
            root=root,
            output_dir=output_dir,
            scenario=scenario,
            samples=samples,
            seed=args.seed,
            rejected_ratio=args.rejected_ratio,
        )
        print(_summarize(output_path))


if __name__ == "__main__":
    main()
