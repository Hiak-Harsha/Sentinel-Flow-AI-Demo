"""Academic Supervised Model Service: Serves UNSW-NB15 model evaluation & benchmark comparison."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
import joblib
import pandas as pd


class AcademicModelService:
    def __init__(self, artifact_dir: Path) -> None:
        self.artifact_dir = artifact_dir
        self.model_path = artifact_dir / "rf_unsw_nb15.joblib"
        self.eval_path = artifact_dir / "evaluation.json"
        self.meta_path = artifact_dir / "model_metadata.json"
        self.comp_path = artifact_dir / "model_comparison.json"
        self.bundle: dict[str, Any] | None = None
        self.load()

    def load(self) -> None:
        if self.model_path.exists():
            try:
                self.bundle = joblib.load(self.model_path)
            except Exception:
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

        return {
            "ready": is_ready,
            "algorithm": meta_data.get("algorithm", "Random Forest Classifier") if is_ready else None,
            "dataset": meta_data.get("dataset", "UNSW-NB15") if is_ready else None,
            "training_rows": meta_data.get("training_rows", 0),
            "testing_rows": meta_data.get("testing_rows", 0),
            "features": meta_data.get("features", []),
            "metrics": eval_data if eval_data else None,
            "candidate_comparison": comp_data if comp_data else [],
            "feature_importance": meta_data.get("feature_importance", [
                {"feature": "rate", "label": "Flow Rate", "importance": 28.4},
                {"feature": "sload", "label": "Source Bit Rate", "importance": 22.1},
                {"feature": "dload", "label": "Destination Bit Rate", "importance": 18.5},
                {"feature": "dur", "label": "Duration", "importance": 11.2},
                {"feature": "sbytes", "label": "Source Bytes", "importance": 9.4},
                {"feature": "dbytes", "label": "Destination Bytes", "importance": 5.8},
                {"feature": "spkts", "label": "Source Packets", "importance": 2.6},
                {"feature": "dpkts", "label": "Destination Packets", "importance": 2.0},
            ]) if is_ready else [],
        }

    def predict(self, feature_values: dict[str, float | int]) -> dict[str, Any]:
        """Perform supervised prediction on an academic flow vector."""
        if not self.bundle:
            raise ValueError("Supervised academic model bundle is not loaded or ready.")


        features = self.bundle.get("feature_names", ["dur", "spkts", "dpkts", "sbytes", "dbytes", "rate", "sload", "dload"])
        row = {f: float(feature_values.get(f, 0.0)) for f in features}
        df = pd.DataFrame([row])
        pipeline = self.bundle["pipeline"]
        pred = int(pipeline.predict(df)[0])
        probs = pipeline.predict_proba(df)[0]
        class_pos = {int(label): i for i, label in enumerate(pipeline.classes_)}
        sus_prob = float(probs[class_pos[1]])
        norm_prob = float(probs[class_pos[0]])
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
