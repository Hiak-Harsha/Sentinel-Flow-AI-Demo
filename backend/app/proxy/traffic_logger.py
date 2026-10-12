"""Structured traffic logger for every proxied request/response.

Every request that passes through the reverse proxy is logged here with:
- Sentinel Flow identity ID
- Timestamp (epoch + ISO)
- HTTP method, path, query string
- Response status code
- Request size, response size (measured server-side)
- Latency (ms)
- Device fingerprint hash (when available)
- Attack run_id tag (when an orchestrated attack is active)

This is the *sole* source of raw traffic events fed to the feature pipeline.
No client-supplied metrics are ever accepted.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Callable

logger = logging.getLogger("sentinel_flow.proxy.traffic_logger")


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(slots=True)
class TrafficRecord:
    """One proxied request/response pair — fully server-measured."""

    identity_id: str
    timestamp_epoch: float
    timestamp_iso: str
    method: str
    path: str
    query_string: str
    status_code: int
    request_size_bytes: int
    response_size_bytes: int
    latency_ms: float
    fingerprint_hash: str | None = None
    attack_run_id: str | None = None
    target_origin: str = ""
    user_agent: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class TrafficLogger:
    """In-memory ring buffer of traffic records, with listener callbacks.

    Listeners are synchronous callables invoked on each new record — they are
    used by the feature pipeline to consume events without polling.
    """

    def __init__(self, max_records: int = 50_000) -> None:
        self._records: deque[TrafficRecord] = deque(maxlen=max_records)
        self._listeners: list[Callable[[TrafficRecord], None]] = []
        self._total_count: int = 0

    # ------------------------------------------------------------------
    # Recording
    # ------------------------------------------------------------------

    def log(
        self,
        *,
        identity_id: str,
        method: str,
        path: str,
        query_string: str = "",
        status_code: int,
        request_size_bytes: int,
        response_size_bytes: int,
        latency_ms: float,
        fingerprint_hash: str | None = None,
        attack_run_id: str | None = None,
        target_origin: str = "",
        user_agent: str = "",
    ) -> TrafficRecord:
        """Create and store a traffic record.  Notifies all listeners."""
        now = time.time()
        record = TrafficRecord(
            identity_id=identity_id,
            timestamp_epoch=now,
            timestamp_iso=_iso_now(),
            method=method,
            path=path,
            query_string=query_string,
            status_code=status_code,
            request_size_bytes=request_size_bytes,
            response_size_bytes=response_size_bytes,
            latency_ms=latency_ms,
            fingerprint_hash=fingerprint_hash,
            attack_run_id=attack_run_id,
            target_origin=target_origin,
            user_agent=user_agent,
        )
        self._records.append(record)
        self._total_count += 1

        for listener in self._listeners:
            try:
                listener(record)
            except Exception:
                logger.exception("Traffic listener error")

        return record

    # ------------------------------------------------------------------
    # Listener management
    # ------------------------------------------------------------------

    def add_listener(self, callback: Callable[[TrafficRecord], None]) -> None:
        """Register a synchronous callback invoked on every new record."""
        self._listeners.append(callback)

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def recent(self, limit: int = 100) -> list[TrafficRecord]:
        """Return the most recent *limit* records, newest first."""
        items = list(self._records)
        return list(reversed(items[-limit:]))

    def records_for_identity(
        self, identity_id: str, since_epoch: float = 0.0
    ) -> list[TrafficRecord]:
        """Return records for a specific identity since a given epoch time."""
        return [
            r
            for r in self._records
            if r.identity_id == identity_id and r.timestamp_epoch >= since_epoch
        ]

    @property
    def total_count(self) -> int:
        return self._total_count

    def snapshot(self) -> dict[str, Any]:
        """High-level stats for the dashboard."""
        now = time.time()
        window = 5.0
        recent = [r for r in self._records if (now - r.timestamp_epoch) <= window]
        identities = set(r.identity_id for r in recent)
        return {
            "total_logged": self._total_count,
            "buffer_size": len(self._records),
            "active_identities_5s": len(identities),
            "requests_per_sec_5s": round(len(recent) / window, 1),
        }
