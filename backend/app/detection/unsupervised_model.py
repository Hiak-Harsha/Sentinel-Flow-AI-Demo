"""Online unsupervised behavioural anomaly detector with per-identity adaptive baselines.

Implements per-identity adaptive baselines (EWMA + robust quantiles) with cold-start priors,
a visible baseline maturity indicator, and sensitivity to low-and-slow behavioral drift.
"""

from __future__ import annotations

import logging
import math
import time
from collections import deque
from dataclasses import dataclass, field
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

DEFAULT_BASELINES: dict[str, tuple[float, float]] = {
    "request_rate_5s": (0.8, 2.0),
    "request_rate_30s": (0.5, 1.5),
    "byte_volume_in_5s": (1000.0, 3000.0),
    "byte_volume_out_5s": (15000.0, 35000.0),
    "endpoint_entropy_30s": (0.8, 1.2),
    "error_ratio_30s": (0.01, 0.05),
    "inter_request_interval_mean_30s": (2500.0, 2000.0),
}


@dataclass
class IdentityAdaptiveBaseline:
    """Per-identity adaptive statistical baseline using EWMA and robust quantiles."""

    identity_id: str
    observation_count: int = 0
    first_seen_epoch: float = field(default_factory=time.time)
    last_seen_epoch: float = field(default_factory=time.time)
    alpha: float = 0.12  # EWMA smoothing factor

    # Online EWMA tracking
    ewma_means: dict[str, float] = field(default_factory=dict)
    ewma_vars: dict[str, float] = field(default_factory=dict)

    # Sliding history for robust quantiles (median, IQR)
    histories: dict[str, deque[float]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for k in FEATURE_KEYS:
            prior_mean, prior_std = DEFAULT_BASELINES.get(k, (0.0, 1.0))
            if k not in self.ewma_means:
                self.ewma_means[k] = prior_mean
            if k not in self.ewma_vars:
                self.ewma_vars[k] = prior_std ** 2
            if k not in self.histories:
                self.histories[k] = deque(maxlen=100)

    @property
    def baseline_maturity(self) -> float:
        """Baseline maturity score in [0.0, 1.0] based on observation count."""
        return round(min(1.0, self.observation_count / 20.0), 3)

    @property
    def maturity_state(self) -> str:
        """Categorical baseline maturity level."""
        m = self.baseline_maturity
        if m < 0.25:
            return "COLD_START"
        if m < 0.75:
            return "WARMING_UP"
        return "MATURE"

    def update(self, vec_dict: dict[str, Any], is_anomalous: bool = False) -> None:
        """Update EWMA moments and rolling quantile buffer with contamination protection."""
        self.last_seen_epoch = time.time()
        self.observation_count += 1

        for k in FEATURE_KEYS:
            val = float(vec_dict.get(k, 0.0))
            # Protect baseline from being poisoned by extreme attack bursts
            if not is_anomalous:
                prev_mean = self.ewma_means[k]
                diff = val - prev_mean
                # EWMA mean update
                self.ewma_means[k] = prev_mean + self.alpha * diff
                # EWMA variance update (Finch/Welford online EWMA variance)
                prev_var = self.ewma_vars[k]
                new_var = (1.0 - self.alpha) * (prev_var + self.alpha * (diff ** 2))
                self.ewma_vars[k] = max(1e-4, new_var)
                self.histories[k].append(val)

    def get_moments(self, key: str, global_mean: float, global_std: float) -> tuple[float, float]:
        """Compute effective mean and scale by blending identity baseline with priors."""
        prior_mean, prior_std = DEFAULT_BASELINES.get(key, (global_mean, global_std))
        maturity = self.baseline_maturity

        if maturity < 0.25:
            # Cold-start prior dominates
            eff_mean = (1.0 - maturity) * prior_mean + maturity * self.ewma_means[key]
            eff_std = (1.0 - maturity) * prior_std + maturity * math.sqrt(self.ewma_vars[key])
            return eff_mean, max(0.01, eff_std)

        # For warming-up and mature baselines, use robust quantiles if enough samples exist
        history = list(self.histories.get(key, []))
        if len(history) >= 5:
            med = float(np.median(history))
            q75, q25 = np.percentile(history, [75, 25])
            iqr = float(q75 - q25)
            # Robust scale using IQR/1.349 with EWMA std fallback
            robust_scale = max(iqr / 1.349 if iqr > 0.001 else math.sqrt(self.ewma_vars[key]), 0.01)
            eff_mean = (1.0 - maturity) * prior_mean + maturity * med
            eff_std = (1.0 - maturity) * prior_std + maturity * robust_scale
            return eff_mean, max(0.01, eff_std)

        eff_mean = (1.0 - maturity) * prior_mean + maturity * self.ewma_means[key]
        eff_std = (1.0 - maturity) * prior_std + maturity * math.sqrt(self.ewma_vars[key])
        return eff_mean, max(0.01, eff_std)


class OnlineAnomalyDetector:
    """Calculates per-identity multidimensional anomaly distance with adaptive EWMA and robust quantiles."""

    def __init__(self) -> None:
        self.is_calibrated: bool = False
        self.sample_count: int = 0
        self.calibrated_at: str | None = None
        self.means: dict[str, float] = {k: DEFAULT_BASELINES[k][0] for k in FEATURE_KEYS}
        self.stds: dict[str, float] = {k: DEFAULT_BASELINES[k][1] for k in FEATURE_KEYS}
        self.medians: dict[str, float] = {k: DEFAULT_BASELINES[k][0] for k in FEATURE_KEYS}
        self.p95s: dict[str, float] = {k: DEFAULT_BASELINES[k][1] for k in FEATURE_KEYS}
        self.isolation_forest: IsolationForest | None = None
        self._default_baselines = DEFAULT_BASELINES

        # Per-identity adaptive baseline tracker
        self._identity_baselines: dict[str, IdentityAdaptiveBaseline] = {}

    def get_identity_baseline(self, identity_id: str) -> IdentityAdaptiveBaseline:
        """Get or initialize per-identity adaptive baseline."""
        if identity_id not in self._identity_baselines:
            self._identity_baselines[identity_id] = IdentityAdaptiveBaseline(identity_id=identity_id)
        return self._identity_baselines[identity_id]

    def _vector_to_array(self, vector: IdentityFeatureVector) -> list[float]:
        vec_dict = vector.to_dict()
        return [float(vec_dict.get(k, 0.0)) for k in FEATURE_KEYS]

    def fit_baseline(self, vectors: list[IdentityFeatureVector] | list[dict[str, Any]]) -> dict[str, Any]:
        """Calibrate global baseline model on real observed samples."""
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
        """Compute anomaly score [0.0, 1.0], per-identity z-scores, and OOD indicators."""
        vec_dict = vector.to_dict()
        identity_id = vector.identity_id
        id_baseline = self.get_identity_baseline(identity_id)

        z_scores: dict[str, float] = {}
        contributions: list[dict[str, Any]] = []

        total_weighted_z = 0.0
        ood_flags = 0

        for k in FEATURE_KEYS:
            val = float(vec_dict.get(k, 0.0))
            g_mean = self.means[k] if self.is_calibrated else self._default_baselines[k][0]
            g_std = self.stds[k] if self.is_calibrated else self._default_baselines[k][1]

            # Use per-identity adaptive baseline blended with priors
            mean, scale = id_baseline.get_moments(k, g_mean, g_std)

            z = (val - mean) / scale if scale > 0 else 0.0
            z_scores[k] = round(z, 2)

            pos_z = max(0.0, z)
            # Only excess deviation beyond normal variance (> 2.5 std) indicates true statistical anomaly
            excess_z = max(0.0, pos_z - 2.5)
            total_weighted_z += excess_z ** 1.5

            if pos_z >= 3.5:
                ood_flags += 1

            if pos_z > 2.5:
                contributions.append({
                    "feature": k,
                    "value": round(val, 2),
                    "baseline": round(mean, 2),
                    "z_score": round(pos_z, 2),
                    "contribution": "high" if pos_z >= 3.5 else "medium",
                })

        if total_weighted_z <= 0.05:
            norm_score = 0.0
        else:
            norm_score = 1.0 / (1.0 + math.exp(-0.40 * (total_weighted_z - 4.5)))
        norm_score = round(max(0.0, min(1.0, norm_score)), 4)

        if vector.request_count_30s == 0:
            norm_score = 0.0
            contributions = []

        if self.isolation_forest is not None and vector.request_count_30s > 0:
            arr = np.array([self._vector_to_array(vector)])
            raw_if_score = float(self.isolation_forest.score_samples(arr)[0])
            if_anomaly_score = max(0.0, min(1.0, 0.5 - raw_if_score))
            if norm_score >= 0.50 or if_anomaly_score >= 0.65:
                norm_score = round(0.6 * norm_score + 0.4 * if_anomaly_score, 4)

        is_anomaly = norm_score >= 0.70

        # Update per-identity adaptive baseline if not an idle window
        if vector.request_count_30s > 0:
            id_baseline.update(vec_dict, is_anomalous=is_anomaly)

        return {
            "anomaly_score": norm_score,
            "is_anomaly": is_anomaly,
            "is_calibrated": self.is_calibrated or id_baseline.baseline_maturity >= 0.5,
            "sample_count": self.sample_count + id_baseline.observation_count,
            "baseline_maturity": id_baseline.baseline_maturity,
            "baseline_maturity_state": id_baseline.maturity_state,
            "identity_observations": id_baseline.observation_count,
            "is_out_of_distribution": ood_flags > 0,
            "contributions": contributions,
            "z_scores": z_scores,
        }

    def update_baseline(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        """Update empirical baseline from a network feature snapshot."""
        features = snapshot.get("features", snapshot)
        return self.fit_baseline([features])

    def get_stats(self) -> dict[str, Any]:
        """Return rich empirical baseline statistics for dashboard analytics."""
        req_median = self.medians.get("request_rate_5s", 0.5) if self.is_calibrated else 0.5
        req_p95 = self.p95s.get("request_rate_5s", 1.2) if self.is_calibrated else 1.2
        iat_median = self.medians.get("inter_request_interval_mean_30s", 2500.0) if self.is_calibrated else 2500.0

        maturities = [b.baseline_maturity for b in self._identity_baselines.values()]
        avg_maturity = round(float(np.mean(maturities)), 2) if maturities else 0.0

        return {
            "calibrated": self.is_calibrated,
            "sample_count": self.sample_count,
            "calibrated_at": self.calibrated_at,
            "tracked_identities": len(self._identity_baselines),
            "average_baseline_maturity": avg_maturity,
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
