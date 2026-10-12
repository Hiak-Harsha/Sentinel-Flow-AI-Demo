"""In-memory feature store for streaming behavioural telemetry.

Holds the latest computed feature vectors, baseline distributions, and historical
sliding snapshots per identity and across the global network.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("sentinel_flow.pipeline.feature_store")


@dataclass
class IdentityFeatureVector:
    """Calculated behavioural feature vector for a specific identity."""

    identity_id: str
    timestamp_epoch: float
    timestamp_iso: str

    # Request Rates (requests per second)
    request_rate_5s: float = 0.0
    request_rate_30s: float = 0.0
    request_rate_5m: float = 0.0

    # Volume (bytes)
    byte_volume_in_5s: int = 0
    byte_volume_out_5s: int = 0
    byte_volume_in_30s: int = 0
    byte_volume_out_30s: int = 0

    # Behavioral metrics
    endpoint_entropy_30s: float = 0.0
    endpoint_entropy_5m: float = 0.0
    error_ratio_30s: float = 0.0
    error_ratio_5m: float = 0.0

    # Interval statistics (ms)
    inter_request_interval_mean_30s: float = 0.0
    inter_request_interval_std_30s: float = 0.0

    # Churn metrics
    fingerprint_churn_5m: int = 1
    account_churn_5m: int = 1
    cohort_size_5m: int = 1

    # Raw counts in windows
    request_count_5s: int = 0
    request_count_30s: int = 0
    request_count_5m: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class FeatureStore:
    """Thread-safe store for computed features and sliding history."""

    def __init__(self, max_history: int = 1000) -> None:
        self._identities: dict[str, IdentityFeatureVector] = {}
        self._history: deque[dict[str, Any]] = deque(maxlen=max_history)
        self._network_snapshot: dict[str, Any] = {
            "requests_per_sec": 0.0,
            "bytes_in_per_sec": 0.0,
            "bytes_out_per_sec": 0.0,
            "active_devices": 0,
            "error_rate": 0.0,
            "total_requests": 0,
            "timestamp": time.time(),
        }

    def put_identity_features(self, vector: IdentityFeatureVector) -> None:
        """Update or insert feature vector for an identity."""
        self._identities[vector.identity_id] = vector
        self._history.append({
            "identity_id": vector.identity_id,
            "timestamp": vector.timestamp_epoch,
            "features": vector.to_dict(),
        })

    def get_identity_features(self, identity_id: str) -> IdentityFeatureVector | None:
        """Get latest computed feature vector for an identity."""
        return self._identities.get(identity_id)

    def get_all_identity_features(self) -> dict[str, dict[str, Any]]:
        """Return dict of all active identity feature vectors."""
        return {k: v.to_dict() for k, v in self._identities.items()}

    def update_network_snapshot(self, snapshot: dict[str, Any]) -> None:
        """Update aggregate network telemetry metrics."""
        self._network_snapshot = snapshot

    def get_network_snapshot(self) -> dict[str, Any]:
        """Return aggregate network telemetry snapshot."""
        return dict(self._network_snapshot)

    def get_history(self, identity_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        """Return historical snapshots, optionally filtered by identity."""
        if identity_id:
            matching = [h for h in self._history if h["identity_id"] == identity_id]
            return list(matching)[-limit:]
        return list(self._history)[-limit:]
