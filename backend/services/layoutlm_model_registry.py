import hashlib
import json
from pathlib import Path
import re
from typing import Any

import joblib

PROJECT_ROOT = Path(__file__).resolve().parents[2]
AI_PIPELINE_DIR = PROJECT_ROOT / "ai_pipeline"
SUPERVISED_MODEL_ROOT = AI_PIPELINE_DIR / "saved_models" / "layoutlm_supervised"
SUPERVISED_DATASET_ROOT = AI_PIPELINE_DIR / "datasets" / "layoutlm_supervised"

BASELINE_MODEL_ID = "baseline_unsupervised"
LATEST_MODEL_ID = "latest_supervised"
BEST_MODEL_ID = "best_supervised"
DEMO_MODEL_PREFIX = "demo_layoutlm_supervised_"
DEMO_MODEL_NAMES = {
    "v1_random": "Model 1",
    "v2_weak_rules": "Model 2",
    "v3_medium_rules": "Model 3",
    "v4_strong_rules": "Model 4",
    "v5_clean_rules": "Model 5",
}
DEMO_MODEL_ORDER = {scenario: index for index, scenario in enumerate(DEMO_MODEL_NAMES)}
DEMO_MODEL_DISPLAY_DATES = {
    "v1_random": "2026-01-11T10:00:00Z",
    "v2_weak_rules": "2026-01-27T14:30:00Z",
    "v3_medium_rules": "2026-02-18T09:15:00Z",
    "v4_strong_rules": "2026-03-16T11:45:00Z",
    "v5_clean_rules": "2026-04-09T15:20:00Z",
}


def _user_model_dir(user_id: int) -> Path:
    return SUPERVISED_MODEL_ROOT / f"user_{user_id}"


def _user_dataset_dir(user_id: int) -> Path:
    return SUPERVISED_DATASET_ROOT / f"user_{user_id}"


def ensure_layoutlm_supervised_dirs(user_id: int) -> tuple[Path, Path]:
    model_dir = _user_model_dir(user_id)
    dataset_dir = _user_dataset_dir(user_id)
    model_dir.mkdir(parents=True, exist_ok=True)
    dataset_dir.mkdir(parents=True, exist_ok=True)
    return model_dir, dataset_dir


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def _metadata_files(user_id: int) -> list[Path]:
    model_dir = _user_model_dir(user_id)
    if not model_dir.exists():
        return []
    return sorted(
        model_dir.glob("*.metadata.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )


def _user_id_from_model_dir(path: Path) -> int | None:
    match = re.fullmatch(r"user_(\d+)", path.parent.name)
    return int(match.group(1)) if match else None


def _all_demo_metadata_files() -> list[Path]:
    if not SUPERVISED_MODEL_ROOT.exists():
        return []
    return sorted(
        SUPERVISED_MODEL_ROOT.glob(f"user_*/{DEMO_MODEL_PREFIX}*.metadata.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )


def _visible_metadata_files(user_id: int) -> list[Path]:
    files: dict[Path, None] = {}
    for path in _metadata_files(user_id) + _all_demo_metadata_files():
        files[path] = None
    return sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)


def _preferred_demo_path(existing: Path | None, candidate: Path) -> Path:
    if existing is None:
        return candidate

    existing_metadata = _read_json(existing)
    candidate_metadata = _read_json(candidate)
    existing_count = int(existing_metadata.get("trained_sample_count") or 0)
    candidate_count = int(candidate_metadata.get("trained_sample_count") or 0)
    if candidate_count != existing_count:
        return candidate if candidate_count > existing_count else existing

    return candidate if _created_at_sort_key(candidate_metadata) > _created_at_sort_key(existing_metadata) else existing


def _catalog_metadata_files(user_id: int) -> list[Path]:
    regular_files: list[Path] = []
    demo_by_scenario: dict[str, Path] = {}

    for path in _visible_metadata_files(user_id):
        metadata = _read_json(path)
        scenario = str(metadata.get("pseudo_rule_version") or "")
        if str(metadata.get("id", "")).startswith(DEMO_MODEL_PREFIX) and scenario in DEMO_MODEL_NAMES:
            demo_by_scenario[scenario] = _preferred_demo_path(demo_by_scenario.get(scenario), path)
        else:
            regular_files.append(path)

    regular_files = sorted(
        regular_files,
        key=lambda p: _created_at_sort_key(_read_json(p)),
        reverse=False,
    )
    demo_files = sorted(
        demo_by_scenario.values(),
        key=lambda p: DEMO_MODEL_ORDER.get(str(_read_json(p).get("pseudo_rule_version") or ""), 999),
    )
    return demo_files + regular_files


def _complete_metadata(metadata_file: Path) -> dict[str, Any]:
    metadata = _read_json(metadata_file)
    owner_user_id = _user_id_from_model_dir(metadata_file)
    scenario = str(metadata.get("pseudo_rule_version") or "")
    display_name = DEMO_MODEL_NAMES.get(scenario, metadata.get("name"))
    display_created_at = DEMO_MODEL_DISPLAY_DATES.get(scenario, metadata.get("created_at"))
    return {
        **metadata,
        "name": display_name,
        "technical_name": metadata.get("name"),
        "actual_created_at": metadata.get("created_at"),
        "created_at": display_created_at,
        "owner_user_id": owner_user_id,
        "is_demo": str(metadata.get("id", "")).startswith(DEMO_MODEL_PREFIX),
    }


def _created_at_sort_key(metadata: dict[str, Any]) -> str:
    created_at = metadata.get("created_at")
    return str(created_at) if created_at else ""


def get_latest_supervised_metadata(user_id: int) -> dict[str, Any] | None:
    metadata_items = [_complete_metadata(path) for path in _catalog_metadata_files(user_id)]
    return max(metadata_items, key=_created_at_sort_key) if metadata_items else None


def _metric_accuracy(metadata: dict[str, Any]) -> float | None:
    accuracy = (metadata.get("metrics") or {}).get("accuracy")
    return float(accuracy) if isinstance(accuracy, int | float) else None


def get_best_supervised_metadata(user_id: int) -> dict[str, Any] | None:
    best_metadata: dict[str, Any] | None = None
    best_accuracy: float | None = None

    for metadata_file in _catalog_metadata_files(user_id):
        metadata = _complete_metadata(metadata_file)
        accuracy = _metric_accuracy(metadata)
        if accuracy is None:
            continue
        if best_accuracy is None or accuracy > best_accuracy:
            best_metadata = metadata
            best_accuracy = accuracy

    return best_metadata


def list_layoutlm_models(user_id: int) -> dict[str, Any]:
    latest = get_latest_supervised_metadata(user_id)
    best = get_best_supervised_metadata(user_id)
    latest_id = latest.get("id") if latest else None
    best_id = best.get("id") if best else None

    models: list[dict[str, Any]] = [
        {
            "id": BASELINE_MODEL_ID,
            "name": "Baseline anomaly model",
            "model_type": "layoutlmv3_isolation_forest",
            "is_baseline": True,
            "is_latest": False,
            "is_best": False,
            "is_demo": False,
            "trained_sample_count": None,
            "created_at": None,
            "metrics": None,
        }
    ]

    for model_index, metadata_file in enumerate(_catalog_metadata_files(user_id), start=1):
        metadata = _complete_metadata(metadata_file)
        if (
            not metadata.get("is_demo")
            and metadata.get("model_type") == "layoutlmv3_supervised_sklearn"
        ):
            metadata = {**metadata, "name": f"Model {model_index}"}
        models.append(
            {
                **metadata,
                "is_latest": metadata["id"] == latest_id,
                "is_best": metadata["id"] == best_id,
            }
        )

    return {
        "default_model_id": best_id or latest_id or BASELINE_MODEL_ID,
        "models": models,
    }


def save_supervised_model_bundle(
    *,
    user_id: int,
    model_id: str,
    model: Any,
    bundle: dict[str, Any],
    metadata: dict[str, Any],
    manifest_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    model_dir, dataset_dir = ensure_layoutlm_supervised_dirs(user_id)

    model_path = model_dir / f"{model_id}.joblib"
    metadata_path = model_dir / f"{model_id}.metadata.json"
    manifest_path = dataset_dir / f"{model_id}.manifest.jsonl"
    latest_path = model_dir / "latest.json"

    joblib.dump({**bundle, "model": model, "metadata": metadata}, model_path)
    model_hash = sha256_file(model_path)
    (model_dir / f"{model_id}.joblib.sha256").write_text(model_hash)

    completed_metadata = {
        **metadata,
        "model_path": str(model_path),
        "metadata_path": str(metadata_path),
        "manifest_path": str(manifest_path),
        "sha256": model_hash,
    }
    metadata_path.write_text(json.dumps(completed_metadata, indent=2))

    with manifest_path.open("w") as handle:
        for row in manifest_rows:
            handle.write(json.dumps(row, default=str) + "\n")

    latest_path.write_text(
        json.dumps(
            {
                "id": model_id,
                "model_path": str(model_path),
                "metadata_path": str(metadata_path),
            },
            indent=2,
        )
    )

    return completed_metadata


def load_supervised_model_bundle(user_id: int, model_id: str) -> dict[str, Any]:
    if model_id == LATEST_MODEL_ID:
        latest = get_latest_supervised_metadata(user_id)
        if not latest:
            raise FileNotFoundError("No supervised LayoutLMv3 model has been trained yet.")
        model_id = latest["id"]
    elif model_id == BEST_MODEL_ID:
        best = get_best_supervised_metadata(user_id)
        if not best:
            raise FileNotFoundError("No supervised LayoutLMv3 model has been trained yet.")
        model_id = best["id"]
        user_id = int(best.get("owner_user_id") or user_id)

    metadata_path = _user_model_dir(user_id) / f"{model_id}.metadata.json"
    if not metadata_path.exists():
        for candidate in _visible_metadata_files(user_id):
            metadata = _complete_metadata(candidate)
            if metadata.get("id") == model_id:
                metadata_path = candidate
                break

    if not metadata_path.exists():
        raise FileNotFoundError(f"LayoutLMv3 supervised model not found: {model_id}")

    metadata = _read_json(metadata_path)
    model_path = Path(metadata["model_path"])
    hash_path = model_path.with_suffix(model_path.suffix + ".sha256")

    if not model_path.exists():
        raise FileNotFoundError(f"LayoutLMv3 supervised model file missing: {model_path}")
    if not hash_path.exists():
        raise FileNotFoundError(f"LayoutLMv3 supervised model hash missing: {hash_path}")

    expected_hash = hash_path.read_text().strip()
    actual_hash = sha256_file(model_path)
    if actual_hash != expected_hash:
        raise ValueError(
            f"LayoutLMv3 supervised model integrity check failed for {model_id}."
        )

    bundle = joblib.load(model_path)
    bundle["metadata"] = metadata
    return bundle
