"""SQLAlchemy database models for detection assessments, alerts, and alert transition events."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CompatibleJSON, TimestampMixin, generate_ulid


class AssessmentModel(Base, TimestampMixin):
    """Multi-layer anomaly score and explanation per evaluation window."""

    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    identity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    model_version: Mapped[str] = mapped_column(String(32), default="v1.0", nullable=False)
    threat_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    threat_level: Mapped[str] = mapped_column(String(20), default="LOW", nullable=False)
    rule_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ml_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    flow_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    fused_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    matched_rules: Mapped[list[Any] | None] = mapped_column(CompatibleJSON, nullable=True)
    explanation_json: Mapped[dict[str, Any] | None] = mapped_column(CompatibleJSON, nullable=True)

    __table_args__ = (
        Index("ix_assessments_identity_ts", "identity_id", "ts"),
    )


class AlertModel(Base, TimestampMixin):
    """Security alert state machine record."""

    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    alert_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    identity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    rule_id: Mapped[str] = mapped_column(String(64), default="ANOMALY", nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="HIGH", nullable=False)
    threat_score: Mapped[float] = mapped_column(Float, default=0.8, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32),
        default="open",
        nullable=False,
        index=True,
    )  # open, acknowledged, investigating, resolved, false_positive
    evidence_json: Mapped[list[Any] | dict[str, Any] | None] = mapped_column(CompatibleJSON, nullable=True)
    analyst: Mapped[str | None] = mapped_column(String(64), nullable=True)
    analyst_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    events: Mapped[list[AlertEventModel]] = relationship(
        "AlertEventModel",
        back_populates="alert",
        cascade="all, delete-orphan",
    )


class AlertEventModel(Base, TimestampMixin):
    """State transition history and analyst investigation audit trail."""

    __tablename__ = "alert_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    alert_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("alerts.alert_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    from_status: Mapped[str] = mapped_column(String(32), nullable=False)
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)
    analyst: Mapped[str] = mapped_column(String(64), default="analyst", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    alert: Mapped[AlertModel] = relationship("AlertModel", back_populates="events")
