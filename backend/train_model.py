"""Train and evaluate the Sentinel Flow classifier from genuine UNSW-NB15 CSVs.

The script deliberately fails if source data is absent or invalid. It never
creates synthetic training records or silently substitutes a different dataset.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.pipeline import Pipeline

from app.config import ARTIFACT_DIR, MODEL_PATH, ensure_runtime_directories
from app.feature_schema import DATASET_NAME, DATASET_URL, FLOW_FEATURES


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def locate_file(explicit: str | None, kind: str) -> Path:
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if path.is_file():
            return path
        raise FileNotFoundError(f"{kind.title()} CSV not found: {path}")

    raw_dir = Path(__file__).resolve().parent / "data" / "raw"
    candidates = {
        "training": ["UNSW_NB15_training-set.csv", "UNSW-NB15_training-set.csv"],
        "testing": ["UNSW_NB15_testing-set.csv", "UNSW-NB15_testing-set.csv"],
    }[kind]
    for filename in candidates:
        path = raw_dir / filename
        if path.is_file():
            return path
    expected = " or ".join(str(raw_dir / candidate) for candidate in candidates)
    raise FileNotFoundError(
        f"No {kind} CSV found. Place the official UNSW-NB15 split at {expected}, "
        "or pass its path explicitly."
    )


def clean_frame(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path, low_memory=False)
    required = set(FLOW_FEATURES + ["label"])
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"{path.name} is not a compatible UNSW-NB15 CSV; missing {missing}")

    selected = frame[FLOW_FEATURES + ["label"]].copy()
    for feature in FLOW_FEATURES:
        selected[feature] = pd.to_numeric(selected[feature], errors="coerce")
    selected["label"] = pd.to_numeric(selected["label"], errors="coerce")
    selected = selected.replace([np.inf, -np.inf], np.nan).dropna(subset=["label"])
    selected["label"] = selected["label"].astype(int)
    if not set(selected["label"].unique()).issubset({0, 1}):
        raise ValueError(f"{path.name} label column must be binary 0/1.")
    if selected["label"].nunique() != 2:
        raise ValueError(f"{path.name} must contain both normal and suspicious rows.")
    return selected


def stratified_limit(frame: pd.DataFrame, maximum: int | None, seed: int) -> pd.DataFrame:
    if maximum is None or maximum <= 0 or len(frame) <= maximum:
        return frame.reset_index(drop=True)
    ratios = frame["label"].value_counts(normalize=True).sort_index()
    target_counts = {label: max(1, int(round(maximum * ratio))) for label, ratio in ratios.items()}
    difference = maximum - sum(target_counts.values())
    # Put any rounding remainder into the class with the most records.
    major_label = int(frame["label"].value_counts().idxmax())
    target_counts[major_label] += difference
    sampled = [
        group.sample(n=min(target_counts[int(label)], len(group)), random_state=seed)
        for label, group in frame.groupby("label", sort=True)
    ]
    return pd.concat(sampled, ignore_index=True).sample(frac=1, random_state=seed).reset_index(drop=True)


def metrics_payload(y_true: pd.Series, y_pred: np.ndarray) -> dict[str, Any]:
    matrix = confusion_matrix(y_true, y_pred, labels=[0, 1])
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)) * 100, 2),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)) * 100, 2),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)) * 100, 2),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)) * 100, 2),
        "confusion_matrix": {
            "true_normal_pred_normal": int(matrix[0, 0]),
            "true_normal_pred_suspicious": int(matrix[0, 1]),
            "true_suspicious_pred_normal": int(matrix[1, 0]),
            "true_suspicious_pred_suspicious": int(matrix[1, 1]),
        },
        "positive_class": "suspicious / attack (label 1)",
        "evaluation_note": "Computed on the held-out UNSW-NB15 testing CSV sample; values are not hand-entered.",
    }


def select_seed(
    features: pd.DataFrame,
    actual: pd.Series,
    predicted: np.ndarray,
    probabilities: np.ndarray,
    wanted_class: int,
) -> dict[str, Any]:
    candidates = np.where((actual.to_numpy() == wanted_class) & (predicted == wanted_class))[0]
    if len(candidates) == 0:
        raise RuntimeError(f"No correctly classified held-out row available for class {wanted_class}.")
    confidence = probabilities[candidates, wanted_class]
    # Pick a high-confidence, *correctly classified* test row. It remains a real held-out record.
    selected_index = int(candidates[int(np.argmax(confidence))])
    row = features.iloc[selected_index]
    return {
        "features": {name: float(row[name]) for name in FLOW_FEATURES},
        "dataset_true_label": "SUSPICIOUS" if wanted_class else "NORMAL",
        "origin": "Genuine held-out UNSW-NB15 testing flow selected during model training",
        "selection": "correctly classified held-out row with the highest model probability for its true class",
    }


def benign_reference(frame: pd.DataFrame) -> dict[str, dict[str, float]]:
    benign = frame.loc[frame["label"] == 0, FLOW_FEATURES]
    reference: dict[str, dict[str, float]] = {}
    for feature in FLOW_FEATURES:
        series = benign[feature].dropna()
        q1, q3 = series.quantile([0.25, 0.75])
        reference[feature] = {
            "median": float(series.median()),
            "iqr": float(q3 - q1),
            "p25": float(q1),
            "p75": float(q3),
        }
    return reference


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-file", help="Path to UNSW_NB15_training-set.csv")
    parser.add_argument("--test-file", help="Path to UNSW_NB15_testing-set.csv")
    parser.add_argument(
        "--max-train-rows",
        type=int,
        default=60000,
        help="Deterministic stratified limit for faster classroom setup; 0 uses every source row.",
    )
    parser.add_argument(
        "--max-test-rows",
        type=int,
        default=30000,
        help="Deterministic stratified held-out evaluation limit; 0 uses every source row.",
    )
    parser.add_argument(
        "--source-url",
        default=DATASET_URL,
        help="Dataset provenance URL recorded with the artifact.",
    )
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()

    train_path = locate_file(args.train_file, "training")
    test_path = locate_file(args.test_file, "testing")
    train = stratified_limit(clean_frame(train_path), args.max_train_rows, args.random_state)
    test = stratified_limit(clean_frame(test_path), args.max_test_rows, args.random_state)

    x_train, y_train = train[FLOW_FEATURES], train["label"]
    x_test, y_test = test[FLOW_FEATURES], test["label"]
    pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=250,
                    max_depth=20,
                    min_samples_leaf=2,
                    class_weight="balanced_subsample",
                    n_jobs=-1,
                    random_state=args.random_state,
                ),
            ),
        ]
    )
    pipeline.fit(x_train, y_train)
    predicted = pipeline.predict(x_test)
    probabilities = pipeline.predict_proba(x_test)
    evaluation = metrics_payload(y_test, predicted)
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    metadata = {
        "dataset": DATASET_NAME,
        "source_url": args.source_url,
        "algorithm": "RandomForestClassifier (supervised binary classification)",
        "feature_names": FLOW_FEATURES,
        "training_rows": int(len(train)),
        "testing_rows": int(len(test)),
        "training_source_rows": int(len(clean_frame(train_path))),
        "testing_source_rows": int(len(clean_frame(test_path))),
        "training_sha256": sha256_file(train_path),
        "testing_sha256": sha256_file(test_path),
        "trained_at": now,
        "random_state": args.random_state,
        "sampled_for_runtime": bool(args.max_train_rows or args.max_test_rows),
        "safety": "The model is for a controlled classroom demonstration, not operational threat blocking.",
    }
    bundle = {
        "pipeline": pipeline,
        "feature_names": FLOW_FEATURES,
        "metrics": evaluation,
        "metadata": metadata,
        "benign_reference": benign_reference(train),
        "demo_seeds": {
            "normal": select_seed(x_test, y_test, predicted, probabilities, 0),
            "abnormal": select_seed(x_test, y_test, predicted, probabilities, 1),
        },
    }

    ensure_runtime_directories()
    joblib.dump(bundle, MODEL_PATH)
    (ARTIFACT_DIR / "model_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    (ARTIFACT_DIR / "evaluation.json").write_text(json.dumps(evaluation, indent=2), encoding="utf-8")

    print(f"Model written to {MODEL_PATH}")
    print(json.dumps({"metrics": evaluation, "metadata": metadata}, indent=2))


if __name__ == "__main__":
    main()
