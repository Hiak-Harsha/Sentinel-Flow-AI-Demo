"""Streaming window feature pipeline for Sentinel Flow v2.

Ingests server-measured TrafficRecords directly from TrafficLogger, maintains per-identity
rolling sliding windows (5s, 30s, 5min), and computes statistical & behavioural feature vectors.
"""

from __future__ import annotations

import logging
import math
import time
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Callable

from app.pipeline.feature_store import FeatureStore, IdentityFeatureVector
from app.proxy.traffic_logger import TrafficLogger, TrafficRecord

logger = logging.getLogger("sentinel_flow.pipeline.feature_pipeline")


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _calculate_entropy(items: list[str]) -> float:
    """Calculate Shannon entropy (in bits) over a collection of discrete items."""
    if not items:
        return 0.0
    total = len(items)
    counts = Counter(items)
    entropy = 0.0
    for count in counts.values():
        p = count / total
        if p > 0:
            entropy -= p * math.log2(p)
    return round(entropy, 4)


class FeaturePipeline:
    """Streaming window processor that calculates behavioural feature vectors."""

    def __init__(
        self,
        traffic_logger: TrafficLogger,
        feature_store: FeatureStore | None = None,
    ) -> None:
        self.traffic_logger = traffic_logger
        self.store = feature_store or FeatureStore()

        # Sliding window queues per identity: stores (timestamp_epoch, TrafficRecord)
        self._windows_5m: dict[str, deque[TrafficRecord]] = defaultdict(deque)

        # Global index for account churn: fingerprint_hash -> deque of (timestamp, identity_id)
        self._fingerprint_identities: dict[str, deque[tuple[float, str]]] = defaultdict(deque)

        # Listeners for feature vector updates (e.g. detection engine)
        self._listeners: list[Callable[[IdentityFeatureVector], None]] = []

        # Connect as listener to traffic logger
        self.traffic_logger.add_listener(self.on_traffic_record)

    def add_listener(self, callback: Callable[[IdentityFeatureVector], None]) -> None:
        """Register a callback invoked whenever a new feature vector is calculated."""
        self._listeners.append(callback)

    def on_traffic_record(self, record: TrafficRecord) -> None:
        """Callback invoked whenever the reverse proxy logs a request."""
        now = record.timestamp_epoch
        identity_id = record.identity_id

        # 1. Append record to 5-minute queue
        q = self._windows_5m[identity_id]
        q.append(record)

        # 2. Track fingerprint to identity mapping
        fp = record.fingerprint_hash or f"ip_{record.user_agent[:16]}"
        self._fingerprint_identities[fp].append((now, identity_id))

        # 3. Prune old events (> 300s)
        self._prune_identity(identity_id, now)

        # 4. Compute features for this identity
        vector = self.compute_features_for_identity(identity_id, now=now)
        self.store.put_identity_features(vector)

        # 5. Notify downstream listeners (detection engine)
        for listener in self._listeners:
            try:
                listener(vector)
            except Exception:
                logger.exception("Feature listener error")

    def _prune_identity(self, identity_id: str, now: float) -> None:
        """Discard records older than 300 seconds (5 minutes)."""
        cutoff = now - 300.0
        q = self._windows_5m[identity_id]
        while q and q[0].timestamp_epoch < cutoff:
            q.popleft()

    def _prune_fingerprints(self, now: float) -> None:
        """Discard fingerprint records older than 300 seconds."""
        cutoff = now - 300.0
        for fp, q in list(self._fingerprint_identities.items()):
            while q and q[0][0] < cutoff:
                q.popleft()
            if not q:
                del self._fingerprint_identities[fp]

    def compute_features_for_identity(
        self, identity_id: str, now: float | None = None
    ) -> IdentityFeatureVector:
        """Calculate the full behavioural feature vector over 5s, 30s, and 5m windows."""
        if now is None:
            now = time.time()

        self._prune_identity(identity_id, now)
        records_5m = list(self._windows_5m[identity_id])

        # Filter windows
        cutoff_5s = now - 5.0
        cutoff_30s = now - 30.0

        records_5s = [r for r in records_5m if r.timestamp_epoch >= cutoff_5s]
        records_30s = [r for r in records_5m if r.timestamp_epoch >= cutoff_30s]

        # Counts & Rates
        count_5s = len(records_5s)
        count_30s = len(records_30s)
        count_5m = len(records_5m)

        rate_5s = round(count_5s / 5.0, 2)
        rate_30s = round(count_30s / 30.0, 2)
        rate_5m = round(count_5m / 300.0, 2)

        # Byte Volumes
        bytes_in_5s = sum(r.request_size_bytes for r in records_5s)
        bytes_out_5s = sum(r.response_size_bytes for r in records_5s)
        bytes_in_30s = sum(r.request_size_bytes for r in records_30s)
        bytes_out_30s = sum(r.response_size_bytes for r in records_30s)

        # Endpoint Entropy
        paths_30s = [r.path for r in records_30s]
        paths_5m = [r.path for r in records_5m]
        entropy_30s = _calculate_entropy(paths_30s)
        entropy_5m = _calculate_entropy(paths_5m)

        # Error Ratios (HTTP 4xx and 5xx)
        errors_30s = sum(1 for r in records_30s if r.status_code >= 400)
        error_ratio_30s = round(errors_30s / count_30s, 4) if count_30s > 0 else 0.0

        errors_5m = sum(1 for r in records_5m if r.status_code >= 400)
        error_ratio_5m = round(errors_5m / count_5m, 4) if count_5m > 0 else 0.0

        # Inter-request intervals in 30s window (ms)
        intervals_ms: list[float] = []
        if len(records_30s) >= 2:
            sorted_times = sorted(r.timestamp_epoch for r in records_30s)
            intervals_ms = [
                (t2 - t1) * 1000.0 for t1, t2 in zip(sorted_times[:-1], sorted_times[1:])
            ]

        if intervals_ms:
            mean_interval = round(sum(intervals_ms) / len(intervals_ms), 2)
            variance = sum((x - mean_interval) ** 2 for x in intervals_ms) / len(intervals_ms)
            std_interval = round(math.sqrt(variance), 2)
        else:
            mean_interval = 0.0
            std_interval = 0.0

        # Churn Metrics (5m window)
        distinct_fps = set(
            r.fingerprint_hash for r in records_5m if r.fingerprint_hash
        )
        fp_churn = max(1, len(distinct_fps))

        # Cohort size & Account churn (5m window)
        current_fp = records_5m[-1].fingerprint_hash if records_5m and records_5m[-1].fingerprint_hash else None
        if current_fp and current_fp in self._fingerprint_identities:
            cutoff_5m = now - 300.0
            cutoff_30s = now - 30.0
            shared_identities = set(
                user_id
                for ts, user_id in self._fingerprint_identities[current_fp]
                if ts >= cutoff_5m
            )
            cohort_size = max(1, len(shared_identities))

            # Decouple co-presence from attack: only count other identities that ALSO
            # exhibit failed requests / auth errors (error_ratio_30s >= 0.3)
            suspicious_identities = {identity_id}
            for user_id in shared_identities:
                if user_id == identity_id:
                    continue
                other_recs = [
                    r for r in self._windows_5m.get(user_id, [])
                    if r.timestamp_epoch >= cutoff_30s
                ]
                if other_recs:
                    other_err = sum(1 for r in other_recs if r.status_code >= 400) / len(other_recs)
                    if other_err >= 0.3:
                        suspicious_identities.add(user_id)
            account_churn = len(suspicious_identities)
        else:
            cohort_size = 1
            account_churn = 1

        vector = IdentityFeatureVector(
            identity_id=identity_id,
            timestamp_epoch=now,
            timestamp_iso=_iso_now(),
            request_rate_5s=rate_5s,
            request_rate_30s=rate_30s,
            request_rate_5m=rate_5m,
            byte_volume_in_5s=bytes_in_5s,
            byte_volume_out_5s=bytes_out_5s,
            byte_volume_in_30s=bytes_in_30s,
            byte_volume_out_30s=bytes_out_30s,
            endpoint_entropy_30s=entropy_30s,
            endpoint_entropy_5m=entropy_5m,
            error_ratio_30s=error_ratio_30s,
            error_ratio_5m=error_ratio_5m,
            inter_request_interval_mean_30s=mean_interval,
            inter_request_interval_std_30s=std_interval,
            fingerprint_churn_5m=fp_churn,
            account_churn_5m=account_churn,
            cohort_size_5m=cohort_size,
            request_count_5s=count_5s,
            request_count_30s=count_30s,
            request_count_5m=count_5m,
        )
        return vector

    def compute_network_snapshot(self) -> dict[str, Any]:
        """Compute aggregate network telemetry across all active identities."""
        now = time.time()
        cutoff_5s = now - 5.0
        recent_records = [
            r for r in self.traffic_logger.recent(limit=500)
            if r.timestamp_epoch >= cutoff_5s
        ]

        active_identities = set(r.identity_id for r in recent_records)
        req_count = len(recent_records)
        bytes_in = sum(r.request_size_bytes for r in recent_records)
        bytes_out = sum(r.response_size_bytes for r in recent_records)
        errors = sum(1 for r in recent_records if r.status_code >= 400)

        snap = {
            "requests_per_sec": round(req_count / 5.0, 1),
            "bytes_in_per_sec": round(bytes_in / 5.0, 1),
            "bytes_out_per_sec": round(bytes_out / 5.0, 1),
            "active_devices": len(active_identities),
            "error_rate": round(errors / req_count, 4) if req_count > 0 else 0.0,
            "total_requests": self.traffic_logger.total_count,
            "timestamp": now,
        }
        self.store.update_network_snapshot(snap)
        return snap
