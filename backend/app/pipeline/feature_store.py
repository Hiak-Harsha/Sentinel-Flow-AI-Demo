"""Feature store for streaming behavioural telemetry with database persistence."""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.repositories.event_repo import EventRepository

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

    # Specific Security Evidence Counters
    auth_failures_30s: int = 0
    distinct_ports_10s: int = 0
    canary_hits_30s: int = 0
    p95_latency_30s: float = 0.0
    target_error_ratio_30s: float = 0.0

    # Churn metrics
    fingerprint_churn_5m: int = 1
    account_churn_5m: int = 1
    cohort_size_5m: int = 1

    # Raw counts in windows
    request_count_5s: int = 0
    request_count_30s: int = 0
    request_count_5m: int = 0

    # Phase 3 Real-Time Streaming Feature Extensions (Schema v2.0.0)
    feature_schema_version: str = "2.0.0"
    inter_request_interval_cv_30s: float = 0.0
    fano_factor_30s: float = 0.0
    unique_path_count_30s: int = 0
    status_2xx_count_30s: int = 0
    status_3xx_count_30s: int = 0
    status_4xx_count_30s: int = 0
    status_5xx_count_30s: int = 0
    method_get_ratio_30s: float = 0.0
    method_post_ratio_30s: float = 0.0
    cross_identity_concurrent_paths_30s: int = 0
    cross_identity_credential_reuse_count_30s: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class FeatureStore:
    """Thread-safe store for computed features and sliding history backed by database."""

    def __init__(self, max_history: int = 1000, repo: EventRepository | None = None) -> None:
        self.repo = repo or EventRepository()
        self._identities: dict[str, IdentityFeatureVector] = {}
        self._history: deque[dict[str, Any]] = deque(maxlen=max_history)
        self._last_persist: dict[str, float] = {}
        self._network_snapshot: dict[str, Any] = {
            "requests_per_sec": 0.0,
            "bytes_in_per_sec": 0.0,
            "bytes_out_per_sec": 0.0,
            "active_devices": 0,
            "error_rate": 0.0,
            "total_requests": 0,
            "timestamp": time.time(),
        }

    def _persist_async(self, coro) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            try:
                asyncio.run(coro)
            except Exception as e:
                logger.debug("Failed running sync persistence fallback in FeatureStore: %s", e)

    async def load_from_db(self) -> None:
        """Hydrate feature windows from database on startup."""
        try:
            windows = await self.repo.get_feature_windows(limit=200)
            for w in reversed(windows):
                self._history.append({
                    "identity_id": w.identity_id,
                    "timestamp": w.window_start.timestamp(),
                    "features": w.feature_vector_json,
                })
            logger.info("Restored %d feature windows from database", len(windows))
        except Exception:
            logger.exception("Failed loading feature windows from database")

    def put_identity_features(self, vector: IdentityFeatureVector, force_persist: bool = False) -> None:
        """Update or insert feature vector for an identity with debounced DB persistence."""
        self._identities[vector.identity_id] = vector
        self._history.append({
            "identity_id": vector.identity_id,
            "timestamp": vector.timestamp_epoch,
            "features": vector.to_dict(),
        })

        now = time.monotonic()
        last_save = self._last_persist.get(vector.identity_id, 0.0)
        if force_persist or (now - last_save >= 1.0):
            self._last_persist[vector.identity_id] = now
            self._persist_async(
                self.repo.save_feature_window(
                    identity_id=vector.identity_id,
                    feature_vector=vector.to_dict(),
                    window_size_seconds=30,
                )
            )

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
