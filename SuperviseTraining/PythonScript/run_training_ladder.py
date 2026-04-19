#!/usr/bin/env python3
"""
Run the five pseudo-label supervised training experiments.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SUPERVISE_ROOT = SCRIPT_DIR.parent

LABEL_FILES = [
    "labels_v1_random.csv",
    "labels_v2_weak_rules.csv",
    "labels_v3_medium_rules.csv",
    "labels_v4_strong_rules.csv",
    "labels_v5_clean_rules.csv",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", type=int, default=1)
    parser.add_argument("--max-train-samples", type=int, default=None)
    parser.add_argument("--max-test-samples", type=int, default=None)
    parser.add_argument("--python", default=sys.executable)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    generator = SCRIPT_DIR / "generate_pseudo_labels.py"
    trainer = SCRIPT_DIR / "train_layoutlm_sklearn_from_labels.py"

    subprocess.run([args.python, str(generator), "--scenario", "all"], check=True)

    for label_file in LABEL_FILES:
        command = [
            args.python,
            str(trainer),
            "--labels",
            str(SUPERVISE_ROOT / "labels" / label_file),
            "--user-id",
            str(args.user_id),
        ]
        if args.max_train_samples:
            command.extend(["--max-train-samples", str(args.max_train_samples)])
        if args.max_test_samples:
            command.extend(["--max-test-samples", str(args.max_test_samples)])
        subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
