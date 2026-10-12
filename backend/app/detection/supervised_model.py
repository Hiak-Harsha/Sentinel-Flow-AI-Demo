"""Supervised model scoring using trained UNSW-NB15 Random Forest classifier."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from app.config import MODEL_PATH
from app.pipeline.feature_store import IdentityFeatureVector

logger = logging.getLogger("sentinel_flow.detection.supervised_model")


class SupervisedClassifier:
    """Evaluates live streaming behavioural vectors against UNSW-NB15 trained model."""

    def __init__(self, model_path: Path = MODEL_PATH) -> None:
        self.model_path = model_path
        self.bundle: dict[str, Any] | None = None
        self._load_bundle()

    def _load_bundle(self) -> None:
        if self.model_path.exists():
            try:
                self.bundle = joblib.load(self.model_path)
                logger.info("Loaded supervised UNSW-NB15 model bundle from %s", self.model_path)
            except Exception as e:
                logger.error("Failed to load model bundle: %s", e)
                self.bundle = None

    @property
    def is_ready(self) -> bool:
        return self.bundle is not None and ("pipeline" in self.bundle or "model" in self.bundle)

    def _get_model(self) -> Any:
        if self.bundle:
            return self.bundle.get("pipeline") or self.bundle.get("model")
        return None

    def map_features(self, vector: IdentityFeatureVector) -> dict[str, float]:
        """Translate high-level behavioural vector into UNSW-NB15 flow feature schema."""
        dur = max(0.1, (vector.inter_request_interval_mean_30s / 1000.0) if vector.inter_request_interval_mean_30s > 0 else 5.0)
        sbytes = float(vector.byte_volume_in_30s)
        dbytes = float(vector.byte_volume_out_30s)
        spkts = float(vector.request_count_30s)
        dpkts = float(vector.request_count_30s)
        rate = float(vector.request_rate_5s)
        sload = (sbytes * 8.0) / dur
        dload = (dbytes * 8.0) / dur

        return {
            "dur": round(dur, 4),
            "spkts": spkts,
            "dpkts": dpkts,
            "sbytes": sbytes,
            "dbytes": dbytes,
            "rate": rate,
            "sload": round(sload, 2),
            "dload": round(dload, 2),
        }

    def predict_vector(self, vector: IdentityFeatureVector) -> dict[str, Any]:
        """Perform real supervised inference on an IdentityFeatureVector."""
        if not self.is_ready:
            return {
                "available": False,
                "label": 0,
                "confidence": 0.0,
                "attack_probability": 0.0,
            }

        model = self._get_model()
        assert model is not None
        feature_names = self.bundle.get(
            "feature_names",
            ["dur", "spkts", "dpkts", "sbytes", "dbytes", "rate", "sload", "dload"],
        )

        flow_features = self.map_features(vector)
        df = pd.DataFrame([[flow_features.get(f, 0.0) for f in feature_names]], columns=feature_names)

        try:
            probabilities = model.predict_proba(df)[0]
            # binary classification: 0 = Normal, 1 = Attack/Intrusion
            class_pos = {int(label): i for i, label in enumerate(model.classes_)}
            attack_idx = class_pos.get(1, 1 if len(probabilities) > 1 else 0)
            normal_idx = class_pos.get(0, 0)

            attack_prob = float(probabilities[attack_idx])
            normal_prob = float(probabilities[normal_idx])
            pred_label = int(model.predict(df)[0])
            confidence = round(max(normal_prob, attack_prob), 4)

            return {
                "available": True,
                "label": pred_label,
                "confidence": confidence,
                "attack_probability": round(attack_prob, 4),
                "mapped_features": flow_features,
            }
        except Exception as err:
            logger.warning("Supervised prediction error: %s", err)
            return {
                "available": False,
                "label": 0,
                "confidence": 0.0,
                "attack_probability": 0.0,
            }
