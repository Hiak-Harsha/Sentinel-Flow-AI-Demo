"""Live behavioural anomaly detector for Sentinel Flow.

Uses Isolation Forest combined with statistical baseline deviation tracking.
Evaluates live telemetry (request rate, inter-arrival time, burstiness, bytes)
against an empirical baseline without relying on hardcoded attack signatures.
"""

from __future__ import annotations

import math
import numpy as np
from typing import Any
from sklearn.ensemble import IsolationForest


class LiveAnomalyDetector:
    def __init__(self, contamination: float = 0.05) -> None:
        self.contamination = contamination
        self.is_trained = False
        self.model: IsolationForest | None = None
        self.baseline_stats: dict[str, Any] = {
            "request_rate": {"mean": 3.5, "median": 3.2, "p95": 6.8, "std": 1.2},
            "inter_arrival_ms": {"mean": 285.0, "median": 270.0, "p95": 450.0, "std": 80.0},
            "bytes_out": {"mean": 1420.0, "median": 1280.0, "p95": 2800.0, "std": 350.0},
            "burstiness": {"mean": 0.15, "median": 0.12, "p95": 0.35, "std": 0.08},
        }
        self.threshold = 0.65
        self.device_consecutive: dict[str, int] = {}
        self.persistence_requirement = 2
        self.device_states: dict[str, str] = {}
        self._init_default_model()

    def _init_default_model(self) -> None:
        """Seed the Isolation Forest on a synthetic benign baseline distribution."""
        np.random.seed(42)
        n_samples = 300
        # Normal baseline features: [request_rate, inter_arrival_ms, bytes_out, burstiness]
        rates = np.random.normal(3.5, 1.0, n_samples).clip(0.5, 10.0)
        arrivals = np.random.normal(285.0, 75.0, n_samples).clip(100.0, 800.0)
        bytes_out = np.random.normal(1400.0, 300.0, n_samples).clip(400.0, 3500.0)
        burstiness = np.random.beta(2, 8, n_samples) * 0.5

        X_normal = np.column_stack([rates, arrivals, bytes_out, burstiness])
        self.model = IsolationForest(
            n_estimators=100,
            contamination=self.contamination,
            random_state=42
        )
        self.model.fit(X_normal)
        self.is_trained = True

    def fit_baseline(self, observed_samples: list[dict[str, float]]) -> None:
        """Fit or calibrate the anomaly detector on actual observed session baseline telemetry."""
        if len(observed_samples) < 5:
            return  # Need minimum observations to calibrate

        rates = [s.get("request_rate", 3.0) for s in observed_samples]
        arrivals = [s.get("inter_arrival_ms", 300.0) for s in observed_samples]
        bytes_out = [s.get("bytes_out", 1200.0) for s in observed_samples]
        bursts = [s.get("burstiness", 0.1) for s in observed_samples]

        self.baseline_stats = {
            "request_rate": {
                "mean": round(float(np.mean(rates)), 2),
                "median": round(float(np.median(rates)), 2),
                "p95": round(float(np.percentile(rates, 95)), 2),
                "std": max(round(float(np.std(rates)), 2), 0.5),
            },
            "inter_arrival_ms": {
                "mean": round(float(np.mean(arrivals)), 1),
                "median": round(float(np.median(arrivals)), 1),
                "p95": round(float(np.percentile(arrivals, 95)), 1),
                "std": max(round(float(np.std(arrivals)), 1), 10.0),
            },
            "bytes_out": {
                "mean": round(float(np.mean(bytes_out)), 1),
                "median": round(float(np.median(bytes_out)), 1),
                "p95": round(float(np.percentile(bytes_out, 95)), 1),
                "std": max(round(float(np.std(bytes_out)), 1), 50.0),
            },
            "burstiness": {
                "mean": round(float(np.mean(bursts)), 3),
                "median": round(float(np.median(bursts)), 3),
                "p95": round(float(np.percentile(bursts, 95)), 3),
                "std": max(round(float(np.std(bursts)), 3), 0.05),
            },
        }

        X = np.column_stack([rates, arrivals, bytes_out, bursts])
        self.model = IsolationForest(
            n_estimators=100,
            contamination=self.contamination,
            random_state=42
        )
        self.model.fit(X)
        self.is_trained = True

    def score_observation(self, metrics: dict[str, float], device_id: str = "default") -> dict[str, Any]:
        """Compute an anomaly score in [0.0, 1.0] and evaluate detection state transitions."""
        rate = float(metrics.get("request_rate", 0.0))
        arrival = float(metrics.get("inter_arrival_ms", 300.0))
        bytes_out = float(metrics.get("bytes_out", 1200.0))
        burst = float(metrics.get("burstiness", 0.1))

        # 1. Isolation Forest decision function
        vector = np.array([[rate, arrival, bytes_out, burst]])
        if self.model:
            # decision_function returns negative for outliers, positive for inliers
            raw_score = float(self.model.decision_function(vector)[0])
            # Map into [0, 1] anomaly score where 1 is highly anomalous
            iso_score = 1.0 / (1.0 + math.exp(raw_score * 8.0))
        else:
            iso_score = 0.5

        # 2. Statistical Z-score deviation from empirical baseline
        b_rate = self.baseline_stats["request_rate"]
        b_arrival = self.baseline_stats["inter_arrival_ms"]
        b_burst = self.baseline_stats["burstiness"]

        rate_z = max(0.0, (rate - b_rate["mean"]) / b_rate["std"])
        arrival_z = max(0.0, (b_arrival["mean"] - arrival) / b_arrival["std"])  # rapid arrival is anomalous
        burst_z = max(0.0, (burst - b_burst["mean"]) / b_burst["std"])

        stat_score = 1.0 - math.exp(-0.35 * (rate_z + 0.6 * arrival_z + 0.5 * burst_z))
        stat_score = min(max(stat_score, 0.0), 1.0)

        # Composite score
        combined_score = round(0.5 * iso_score + 0.5 * stat_score, 3)

        # State Machine Transitions (Section 56 & 57)
        # NORMAL -> WATCH -> ANOMALOUS -> CONFIRMED_ANOMALY -> RECOVERING -> NORMAL
        is_above_threshold = combined_score >= self.threshold
        last_state = self.device_states.get(device_id, "NORMAL")
        consecutive = self.device_consecutive.get(device_id, 0)

        if is_above_threshold:
            consecutive += 1
            if consecutive >= self.persistence_requirement:
                new_state = "CONFIRMED_ANOMALY"
            elif consecutive == 1 and last_state == "NORMAL":
                new_state = "WATCH"
            else:
                new_state = "ANOMALOUS"
        else:
            if last_state in ("ANOMALOUS", "CONFIRMED_ANOMALY"):
                new_state = "RECOVERING"
            elif last_state in ("RECOVERING", "WATCH"):
                new_state = "NORMAL"
            else:
                new_state = "NORMAL"
            consecutive = 0

        self.device_states[device_id] = new_state
        self.device_consecutive[device_id] = consecutive

        # Feature deviations for explainability
        rate_diff_pct = round(((rate - b_rate["median"]) / max(b_rate["median"], 0.1)) * 100, 1)
        arrival_diff_pct = round(((arrival - b_arrival["median"]) / max(b_arrival["median"], 1.0)) * 100, 1)

        explanations = [
            {
                "feature": "Request Rate",
                "observed": f"{rate:.1f} req/s",
                "baseline": f"{b_rate['median']:.1f} req/s",
                "deviation": f"{'+' if rate_diff_pct > 0 else ''}{rate_diff_pct}%",
                "is_anomalous": rate > b_rate["p95"],
            },
            {
                "feature": "Inter-Arrival Time",
                "observed": f"{int(arrival)} ms",
                "baseline": f"{int(b_arrival['median'])} ms",
                "deviation": f"{'+' if arrival_diff_pct > 0 else ''}{arrival_diff_pct}%",
                "is_anomalous": arrival < (b_arrival["median"] * 0.4),
            },
            {
                "feature": "Burstiness Index",
                "observed": f"{burst:.2f}",
                "baseline": f"{b_burst['median']:.2f}",
                "deviation": "Elevated" if burst > b_burst["p95"] else "Normal",
                "is_anomalous": burst > b_burst["p95"],
            },
        ]

        return {
            "anomaly_score": combined_score,
            "threshold": self.threshold,
            "state": new_state,
            "is_anomaly": new_state in ("ANOMALOUS", "CONFIRMED_ANOMALY"),
            "explanations": explanations,
            "algorithm": "Isolation Forest (100 Trees) + Statistical Baseline Deviations",
            "baseline_stats": self.baseline_stats,
        }
