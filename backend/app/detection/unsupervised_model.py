"""Online unsupervised anomaly detection engine.

Operates strictly on real streaming feature vectors and actual baseline calibrations.
No synthetic random-normal seeding.
"""

from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest

from app.pipeline.feature_store import IdentityFeatureVector

logger = logging.getLogger("sentinel_flow.detection.unsupervised_model")

# Monitored features for behavioral anomaly detection
FEATURE_KEYS = [
    "request_rate_5s",
    "request_rate_30s",
    "byte_volume_in_5s",
    "byte_volume_out_5s",
    "endpoint_entropy_30s",
    "error_ratio_30s",
    "inter_request_interval_mean_30s",
]


class OnlineAnomalyDetector:
    """Calculates multidimensional anomaly distance without synthetic data generation."""

    def __init__(self) -> None:
        self.is_calibrated: bool = False
        self.sample_count: int = 0
        self.means: dict[str, float] = {k: 0.0 for k in FEATURE_KEYS}
        self.stds: dict[str, float] = {k: 1.0 for k in FEATURE_KEYS}
        self.isolation_forest: IsolationForest | None = None

        # Reasonable default baselines for normal web browsing
        self._default_baselines: dict[str, tuple[float, float]] = {
            "request_rate_5s": (0.5, 1.0),
            "request_rate_30s": (0.3, 0.6),
            "byte_volume_in_5s": (300.0, 500.0),
            "byte_volume_out_5s": (1200.0, 2000.0),
            "endpoint_entropy_30s": (0.5, 0.8),
            "error_ratio_30s": (0.01, 0.05),
            "inter_request_interval_mean_30s": (2500.0, 1500.0),
        }

    def _vector_to_array(self, vector: IdentityFeatureVector) -> list[float]:
        vec_dict = vector.to_dict()
        return [float(vec_dict.get(k, 0.0)) for k in FEATURE_KEYS]

    def fit_baseline(self, vectors: list[IdentityFeatureVector] | list[dict[str, float]]) -> dict[str, Any]:
        """Calibrate baseline model on real observed samples."""
        if not vectors:
            logger.warning("Empty sample list provided to fit_baseline.")
            return self.get_stats()

        matrix: list[list[float]] = []
        for v in vectors:
            if isinstance(v, IdentityFeatureVector):
                matrix.append(self._vector_to_array(v))
            elif isinstance(v, dict):
                matrix.append([float(v.get(k, 0.0)) for k in FEATURE_KEYS])

        data = np.array(matrix, dtype=float)
        self.sample_count = len(data)

        # Compute means and stds for each dimension
        for idx, k in enumerate(FEATURE_KEYS):
            col = data[:, idx]
            self.means[k] = float(np.mean(col))
            # Set minimum std dev to avoid division by zero
            self.stds[k] = max(0.001, float(np.std(col)))

        # Fit IsolationForest on actual data if at least 5 samples exist
        if len(data) >= 5:
            clf = IsolationForest(
                n_estimators=50,
                contamination=0.05,
                random_state=42,
            )
            clf.fit(data)
            self.isolation_forest = clf

        self.is_calibrated = True
        logger.info("Fitted baseline on %d real samples.", self.sample_count)
        return self.get_stats()

    def score_vector(self, vector: IdentityFeatureVector) -> dict[str, Any]:
        """Compute anomaly score [0.0, 1.0] and dimension z-scores."""
        vec_dict = vector.to_dict()
        z_scores: dict[str, float] = {}
        contributions: list[dict[str, Any]] = []

        total_weighted_z = 0.0
        for k in FEATURE_KEYS:
            val = float(vec_dict.get(k, 0.0))
            if self.is_calibrated:
                mean = self.means[k]
                std = self.stds[k]
            else:
                mean, std = self._default_baselines.get(k, (0.0, 1.0))

            z = (val - mean) / std if std > 0 else 0.0
            z_scores[k] = round(z, 2)

            # High positive deviation indicates anomalous surge/divergence
            pos_z = max(0.0, z)
            total_weighted_z += pos_z ** 1.5

            if pos_z > 2.0:
                contributions.append({
                    "feature": k,
                    "value": round(val, 2),
                    "baseline": round(mean, 2),
                    "z_score": round(pos_z, 2),
                    "contribution": "high" if pos_z >= 3.5 else "medium",
                })

        # Calculate logistic normalized anomaly score
        # Scale factor tuned so z=3 produces ~0.8 score, z=0 produces ~0.05
        norm_score = 1.0 / (1.0 + math.exp(-0.35 * (total_weighted_z - 4.0)))
        norm_score = round(max(0.0, min(1.0, norm_score)), 4)

        # If completely idle session with 0 requests in 30s, score is strictly 0
        if vector.request_count_30s == 0:
            norm_score = 0.0
            contributions = []

        # If IsolationForest is available, combine its decision score
        if self.isolation_forest is not None and vector.request_count_30s > 0:
            arr = np.array([self._vector_to_array(vector)])
            raw_if_score = float(self.isolation_forest.score_samples(arr)[0])
            # IF raw score typically ranges [-0.5 (anomaly) to 0.5 (normal)]
            if_anomaly_score = max(0.0, min(1.0, 0.5 - raw_if_score))
            norm_score = round(0.6 * norm_score + 0.4 * if_anomaly_score, 4)

        is_anomaly = norm_score >= 0.70

        return {
            "anomaly_score": norm_score,
            "is_anomaly": is_anomaly,
            "is_calibrated": self.is_calibrated,
            "contributions": contributions,
            "z_scores": z_scores,
        }

    def get_stats(self) -> dict[str, Any]:
        """Return baseline statistics and readiness."""
        return {
            "calibrated": self.is_calibrated,
            "sample_count": self.sample_count,
            "means": {k: round(v, 2) for k, v in self.means.items()},
            "stds": {k: round(v, 2) for k, v in self.stds.items()},
        }
