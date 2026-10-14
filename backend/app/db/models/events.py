"""SQLAlchemy database models for raw request/telemetry events and rollups."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CompatibleJSON, TimestampMixin, generate_ulid


class EventModel(Base, TimestampMixin):
    """Normalized HTTP request, webhook, and sensor telemetry event."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    identity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    method: Mapped[str] = mapped_column(String(10), default="GET", nullable=False)
    path_template: Mapped[str] = mapped_column(String(256), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, default=200, nullable=False)
    bytes_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bytes_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="reverse_proxy", nullable=False)
    provenance: Mapped[str] = mapped_column(String(20), default="live", nullable=False)
    attack_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(CompatibleJSON, nullable=True)

    __table_args__ = (
        Index("ix_events_identity_ts", "identity_id", "ts"),
        Index("ix_events_ts_desc", "ts"),
    )


class TelemetryRollupModel(Base, TimestampMixin):
    """Aggregated time-window statistics for historical queries without scanning raw tables."""

    __tablename__ = "telemetry_rollups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    window_type: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # 1m or 1h
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    total_requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    p95_latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    unique_identities: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_bytes_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_bytes_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        Index("ix_rollups_type_window", "window_type", "window_start"),
    )
