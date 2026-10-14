"""Online unsupervised behavioural anomaly detector with empirical baseline fitting and OOD checks."""

from __future__ import annotations

import logging
import math
import time
from datetime import datetime, timezone
from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest

from app.pipeline.feature_store import IdentityFeatureVector

logger = logging.getLogger("sentinel_flow.detection.unsupervised")

# Primary numeric features evaluated for empirical baseline
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
        self.calibrated_at: str | None = None
        self.means: dict[str, float] = {k: 0.0 for k in FEATURE_KEYS}
        self.stds: dict[str, float] = {k: 1.0 for k in FEATURE_KEYS}
        self.medians: dict[str, float] = {k: 0.0 for k in FEATURE_KEYS}
        self.p95s: dict[str, float] = {k: 1.0 for k in FEATURE_KEYS}
        self.isolation_forest: IsolationForest | None = None

        # Conservative default browsing baselines before empirical calibration
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

    def fit_baseline(self, vectors: list[IdentityFeatureVector] | list[dict[str, Any]]) -> dict[str, Any]:
        """Calibrate baseline model on real observed samples."""
        if not vectors:
            logger.warning("Empty sample list provided to fit_baseline.")
            return self.get_stats()

        matrix: list[list[float]] = []
        for v in vectors:
            if isinstance(v, IdentityFeatureVector):
                matrix.append(self._vector_to_array(v))
            elif isinstance(v, dict):
                feat_dict = v.get("features", v)
                matrix.append([float(feat_dict.get(k, 0.0)) for k in FEATURE_KEYS])

        data = np.array(matrix, dtype=float)
        self.sample_count = len(data)

        # Compute empirical moments
        for idx, k in enumerate(FEATURE_KEYS):
            col = data[:, idx]
            self.means[k] = float(np.mean(col))
            self.stds[k] = max(0.001, float(np.std(col)))
            self.medians[k] = float(np.median(col))
            self.p95s[k] = float(np.percentile(col, 95))

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
        self.calibrated_at = datetime.now(timezone.utc).isoformat()
        logger.info("Empirical baseline fitted on %d real samples.", self.sample_count)
        return self.get_stats()

    def score_vector(self, vector: IdentityFeatureVector) -> dict[str, Any]:
        """Compute anomaly score [0.0, 1.0], dimension z-scores, and OOD indicators."""
        vec_dict = vector.to_dict()
        z_scores: dict[str, float] = {}
        contributions: list[dict[str, Any]] = []

        total_weighted_z = 0.0
        ood_flags = 0

        for k in FEATURE_KEYS:
            val = float(vec_dict.get(k, 0.0))
            if self.is_calibrated:
                mean = self.means[k]
                std = self.stds[k]
            else:
                mean, std = self._default_baselines.get(k, (0.0, 1.0))

            z = (val - mean) / std if std > 0 else 0.0
            z_scores[k] = round(z, 2)

            pos_z = max(0.0, z)
            total_weighted_z += pos_z ** 1.5

            if pos_z >= 3.5:
                ood_flags += 1

            if pos_z > 2.0:
                contributions.append({
                    "feature": k,
                    "value": round(val, 2),
                    "baseline": round(mean, 2),
                    "z_score": round(pos_z, 2),
                    "contribution": "high" if pos_z >= 3.5 else "medium",
                })

        norm_score = 1.0 / (1.0 + math.exp(-0.35 * (total_weighted_z - 4.0)))
        norm_score = round(max(0.0, min(1.0, norm_score)), 4)

        if vector.request_count_30s == 0:
            norm_score = 0.0
            contributions = []

        if self.isolation_forest is not None and vector.request_count_30s > 0:
            arr = np.array([self._vector_to_array(vector)])
            raw_if_score = float(self.isolation_forest.score_samples(arr)[0])
            if_anomaly_score = max(0.0, min(1.0, 0.5 - raw_if_score))
            norm_score = round(0.6 * norm_score + 0.4 * if_anomaly_score, 4)

        is_anomaly = norm_score >= 0.70

        return {
            "anomaly_score": norm_score,
            "is_anomaly": is_anomaly,
            "is_calibrated": self.is_calibrated,
            "sample_count": self.sample_count,
            "is_out_of_distribution": ood_flags > 0,
            "contributions": contributions,
            "z_scores": z_scores,
        }

    def get_stats(self) -> dict[str, Any]:
        """Return rich empirical baseline statistics for dashboard analytics."""
        req_median = self.medians.get("request_rate_5s", 0.5) if self.is_calibrated else 0.5
        req_p95 = self.p95s.get("request_rate_5s", 1.2) if self.is_calibrated else 1.2
        iat_median = self.medians.get("inter_request_interval_mean_30s", 2500.0) if self.is_calibrated else 2500.0

        return {
            "calibrated": self.is_calibrated,
            "sample_count": self.sample_count,
            "calibrated_at": self.calibrated_at,
            "request_rate": {
                "median": str(round(req_median, 1)),
                "p95": str(round(req_p95, 1)),
            },
            "inter_arrival_ms": {
                "median": str(int(iat_median)),
                "threshold_alert_ms": "100",
            },
            "burstiness_index": {
                "baseline_ratio": "1.0",
                "burst_threshold_ratio": "3.0",
            },
            "error_ratio": {
                "median": "0.00",
                "tolerance_p95": str(round(self.p95s.get("error_ratio_30s", 0.05) if self.is_calibrated else 0.05, 2)),
            },
            "means": {k: round(v, 2) for k, v in self.means.items()},
            "stds": {k: round(v, 2) for k, v in self.stds.items()},
        }
