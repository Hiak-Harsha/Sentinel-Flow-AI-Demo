"""Academic Supervised Model Service: Serves verified ML model evaluations, benchmarks, and inference."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from app.feature_schema import FEATURE_SCHEMA_VERSION, LIVE_FEATURE_NAMES, extract_live_feature_vector

logger = logging.getLogger("sentinel_flow.services.academic_model")


class AcademicModelService:
    """Provides model metadata, benchmark evaluation comparisons, and calibrated predictions."""

    def __init__(self, artifact_dir: Path) -> None:
        self.artifact_dir = artifact_dir
        self.prod_path = artifact_dir / "production_model.joblib"
        self.legacy_path = artifact_dir / "rf_unsw_nb15.joblib"
        self.model_path = self.prod_path if self.prod_path.exists() else self.legacy_path
        self.eval_path = artifact_dir / "evaluation.json"
        self.meta_path = artifact_dir / "model_metadata.json"
        self.comp_path = artifact_dir / "model_comparison.json"
        self.bundle: dict[str, Any] | None = None
        self.load()

    def load(self) -> None:
        target = self.prod_path if self.prod_path.exists() else self.legacy_path
        if target.exists():
            try:
                self.bundle = joblib.load(target)
                logger.info("AcademicModelService loaded model bundle from %s", target)
            except Exception as e:
                logger.error("AcademicModelService failed loading %s: %s", target, e)
                self.bundle = None

    def get_status(self) -> dict[str, Any]:
        """Return model metadata, test evaluation metrics, and candidate comparison."""
        eval_data = {}
        if self.eval_path.exists():
            try:
                eval_data = json.loads(self.eval_path.read_text(encoding="utf-8"))
            except Exception:
                pass

        meta_data = {}
        if self.meta_path.exists():
            try:
                meta_data = json.loads(self.meta_path.read_text(encoding="utf-8"))
            except Exception:
                pass

        comp_data = []
        if self.comp_path.exists():
            try:
                comp_data = json.loads(self.comp_path.read_text(encoding="utf-8"))
            except Exception:
                pass

        is_ready = self.bundle is not None and bool(eval_data)
        importances = []
        if self.bundle and "feature_importance" in self.bundle:
            importances = self.bundle["feature_importance"]
        elif meta_data.get("top_features"):
            importances = meta_data["top_features"]

        return {
            "ready": is_ready,
            "name": meta_data.get("name", "sentinel-live-classifier") if is_ready else None,
            "version": meta_data.get("version", "2.0.0") if is_ready else None,
            "algorithm": meta_data.get("algorithm", "Calibrated RandomForestClassifier") if is_ready else None,
            "dataset": meta_data.get("trained_on", "Sentinel-Live-Lab-Dataset") if is_ready else None,
            "feature_schema_version": meta_data.get("feature_schema_version", FEATURE_SCHEMA_VERSION),
            "training_rows": meta_data.get("training_rows", eval_data.get("dataset", {}).get("total_samples", 0)),
            "testing_rows": meta_data.get("testing_rows", eval_data.get("dataset", {}).get("total_samples", 0)),
            "features": meta_data.get("feature_names", LIVE_FEATURE_NAMES),
            "metrics": eval_data.get("metrics") if eval_data else None,
            "candidate_comparison": comp_data if comp_data else [],
            "feature_importance": importances,
            "latency": eval_data.get("latency"),
            "confidence_intervals": eval_data.get("confidence_intervals_95"),
            "unseen_generalization": eval_data.get("unseen_attack_generalization"),
        }

    def predict(self, feature_values: dict[str, float | int]) -> dict[str, Any]:
        """Perform calibrated prediction on input feature values."""
        if not self.bundle:
            raise ValueError("Supervised academic model bundle is not loaded or ready.")

        pipeline = self.bundle.get("pipeline") or self.bundle.get("model")
        if not pipeline:
            raise ValueError("Model bundle missing pipeline/model.")

        features = self.bundle.get("feature_names", LIVE_FEATURE_NAMES)
        row = {f: float(feature_values.get(f, 0.0)) for f in features}
        df = pd.DataFrame([row])

        pred = int(pipeline.predict(df)[0])
        probs = pipeline.predict_proba(df)[0]
        class_pos = {int(label): i for i, label in enumerate(pipeline.classes_)}
        sus_idx = class_pos.get(1, 1 if len(probs) > 1 else 0)
        norm_idx = class_pos.get(0, 0)

        sus_prob = float(probs[sus_idx])
        norm_prob = float(probs[norm_idx])
        conf = sus_prob if pred == 1 else norm_prob

        return {
            "label": "SUSPICIOUS" if pred == 1 else "NORMAL",
            "predicted_class": pred,
            "confidence": round(conf * 100, 2),
            "probabilities": {
                "normal": round(norm_prob * 100, 2),
                "suspicious": round(sus_prob * 100, 2),
            },
        }

    def get_benchmark(self) -> list[dict[str, Any]]:
        return self.get_status().get("candidate_comparison", [])
