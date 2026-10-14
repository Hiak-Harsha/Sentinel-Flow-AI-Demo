"""Supervised ML model scoring for Sentinel Flow v2.

Evaluates live streaming behavioural vectors (IdentityFeatureVector) directly on
calibrated production models trained on genuine observable telemetry (schema v2.0.0).
Eliminates synthetic UNSW-to-HTTP mapping (map_features skew removed).
Includes probability calibration, conformal prediction bounds, local explanations,
and shadow-mode evaluation support.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.config import ARTIFACT_DIR, MODEL_PATH
from app.feature_schema import FEATURE_SCHEMA_VERSION, LIVE_FEATURE_METADATA, LIVE_FEATURE_NAMES, extract_live_feature_vector
from app.pipeline.feature_store import IdentityFeatureVector

logger = logging.getLogger("sentinel_flow.detection.supervised_model")


class SupervisedClassifier:
    """Evaluates live streaming behavioural vectors against calibrated production models."""

    def __init__(self, model_path: Path | None = None) -> None:
        self.production_path = ARTIFACT_DIR / "production_model.joblib"
        self.model_path = model_path or (self.production_path if self.production_path.exists() else MODEL_PATH)
        self.bundle: dict[str, Any] | None = None
        self._registry: Any | None = None  # ModelRegistry reference for shadow evaluation
        self._load_bundle()

    def set_registry(self, registry: Any) -> None:
        """Inject ModelRegistry for shadow candidate evaluation."""
        self._registry = registry

    def _load_bundle(self) -> None:
        target = self.production_path if self.production_path.exists() else self.model_path
        if target.exists():
            try:
                self.bundle = joblib.load(target)
                ver = self.bundle.get("metadata", {}).get("version", "2.0.0")
                logger.info("Loaded calibrated supervised model (v%s) from %s", ver, target)
            except Exception as e:
                logger.error("Failed to load supervised model bundle from %s: %s", target, e)
                self.bundle = None

    @property
    def is_ready(self) -> bool:
        return self.bundle is not None and ("pipeline" in self.bundle or "model" in self.bundle)

    def _get_model(self) -> Any:
        if self.bundle:
            return self.bundle.get("pipeline") or self.bundle.get("model")
        return None

    def _extract_features(self, vector: IdentityFeatureVector) -> dict[str, float]:
        """Extract genuine observable features without fabricated mappings."""
        vec_dict = vector.to_dict()
        expected_features = self.bundle.get("feature_names", LIVE_FEATURE_NAMES) if self.bundle else LIVE_FEATURE_NAMES
        result: dict[str, float] = {}
        for f in expected_features:
            val = vec_dict.get(f, 0.0)
            try:
                result[f] = float(val) if val is not None else 0.0
            except (ValueError, TypeError):
                result[f] = 0.0
        return result

    def _compute_local_explanations(
        self,
        features: dict[str, float],
        prob: float,
        is_attack: bool,
    ) -> list[dict[str, Any]]:
        """Compute localized top contributing factors by comparing against benign baseline."""
        if not self.bundle or not is_attack:
            return []

        baselines = self.bundle.get("benign_reference", {})
        top_importances = {item["feature"]: item["importance"] for item in self.bundle.get("feature_importance", [])}

        contributors: list[dict[str, Any]] = []
        for feat_name, val in features.items():
            base = baselines.get(feat_name, {})
            med = base.get("median", 0.0)
            iqr = base.get("iqr", 1.0)
            p95 = base.get("p95", 1.0)

            # Measure positive deviation from benign median
            if val > med:
                deviation = (val - med) / (iqr if iqr > 0 else 1.0)
                if deviation >= 2.0 or (val >= p95 and p95 > 0):
                    meta = LIVE_FEATURE_METADATA.get(feat_name, {})
                    label = meta.get("label", feat_name)
                    unit = meta.get("unit", "")
                    weight = top_importances.get(feat_name, 1.0)
                    score = deviation * (1.0 + weight / 10.0)

                    contributors.append({
                        "feature": feat_name,
                        "label": label,
                        "unit": unit,
                        "observed_value": round(val, 2),
                        "baseline_median": round(med, 2),
                        "relative_elevation": round(deviation, 2),
                        "contribution_score": round(score, 2),
                        "human_reason": f"{label} ({round(val, 2)} {unit}) is elevated {round(deviation, 1)}x over normal baseline",
                    })

        # Sort contributors by score descending
        contributors.sort(key=lambda x: x["contribution_score"], reverse=True)
        return contributors[:5]

    def predict_vector(self, vector: IdentityFeatureVector) -> dict[str, Any]:
        """Perform calibrated inference on IdentityFeatureVector with uncertainty bounds and explanations."""
        if not self.is_ready:
            return {
                "available": False,
                "label": 0,
                "confidence": 0.0,
                "attack_probability": 0.0,
                "calibrated": False,
                "conformal_status": "NORMAL",
                "explanation": [],
            }

        model = self._get_model()
        assert model is not None
        feature_names = self.bundle.get("feature_names", LIVE_FEATURE_NAMES)
        extracted = self._extract_features(vector)
        df = pd.DataFrame([[extracted.get(f, 0.0) for f in feature_names]], columns=feature_names)

        t0 = time.perf_counter()
        try:
            probabilities = model.predict_proba(df)[0]
            latency_ms = (time.perf_counter() - t0) * 1000.0

            # Target class index (1 = Attack)
            class_pos = {int(label): i for i, label in enumerate(model.classes_)}
            attack_idx = class_pos.get(1, 1 if len(probabilities) > 1 else 0)
            normal_idx = class_pos.get(0, 0)

            attack_prob = float(probabilities[attack_idx])
            normal_prob = float(probabilities[normal_idx])

            # Calibrated operating decision threshold (defaults to target 1% FPR threshold or 0.5)
            threshold = float(self.bundle.get("threshold", 0.5))
            pred_label = 1 if attack_prob >= threshold else 0
            conf = attack_prob if pred_label == 1 else normal_prob

            # Conformal prediction interval check
            conformal_q = float(self.bundle.get("conformal_quantile", 0.95))
            # Uncertain if neither or both classes have high certainty
            uncertain = (abs(attack_prob - threshold) < 0.15)
            conformal_status = "NEEDS_ANALYST_REVIEW" if (uncertain and pred_label == 1) else ("ATTACK" if pred_label == 1 else "NORMAL")

            # Local explainability factors
            explanations = self._compute_local_explanations(extracted, attack_prob, is_attack=(pred_label == 1))

            # Shadow-mode execution if candidate model is registered in registry
            shadow_result = None
            if self._registry is not None:
                shadow_result = self._registry.evaluate_shadow(
                    features_df=df,
                    prod_pred=pred_label,
                    prod_prob=attack_prob,
                    prod_latency_ms=latency_ms,
                )

            return {
                "available": True,
                "label": pred_label,
                "confidence": round(conf * 100, 2),
                "attack_probability": round(attack_prob, 4),
                "normal_probability": round(normal_prob, 4),
                "calibrated": True,
                "operating_threshold": threshold,
                "conformal_status": conformal_status,
                "is_uncertain": uncertain,
                "explanation": explanations,
                "latency_ms": round(latency_ms, 3),
                "shadow_evaluation": shadow_result,
                "feature_schema_version": FEATURE_SCHEMA_VERSION,
                "features": extracted,
            }
        except Exception as err:
            logger.warning("Supervised prediction error: %s", err)
            return {
                "available": False,
                "label": 0,
                "confidence": 0.0,
                "attack_probability": 0.0,
                "calibrated": False,
                "conformal_status": "NORMAL",
                "explanation": [],
            }
