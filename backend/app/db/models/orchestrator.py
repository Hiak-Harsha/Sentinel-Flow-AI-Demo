"""SQLAlchemy database models for attack runs, effects, consents, authorizations, and cryptographic evidence."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CompatibleJSON, TimestampMixin, generate_ulid


class AttackRunModel(Base, TimestampMixin):
    """Execution audit record for red-team attack scenarios."""

    __tablename__ = "attack_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    run_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    scenario: Mapped[str] = mapped_column(String(64), nullable=False)
    target_origin: Mapped[str] = mapped_column(String(256), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requests_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    errors: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    peak_rps: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    launched_by: Mapped[str] = mapped_column(String(64), default="operator", nullable=False)
    summary_json: Mapped[dict[str, Any] | None] = mapped_column(CompatibleJSON, nullable=True)

    effects: Mapped[list[AttackEffectModel]] = relationship(
        "AttackEffectModel",
        back_populates="run",
        cascade="all, delete-orphan",
    )


class AttackEffectModel(Base, TimestampMixin):
    """Per-request latency, status code, and impact telemetry during scenario execution."""

    __tablename__ = "attack_effects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    run_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("attack_runs.run_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    path: Mapped[str] = mapped_column(String(256), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, default=200, nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    is_error: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    effect_type: Mapped[str] = mapped_column(String(64), default="probe", nullable=False)

    run: Mapped[AttackRunModel] = relationship("AttackRunModel", back_populates="effects")


class ConsentModel(Base, TimestampMixin):
    """Operator target ownership confirmation record."""

    __tablename__ = "consents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    consent_token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    target_origin: Mapped[str] = mapped_column(String(256), nullable=False)
    operator_name: Mapped[str] = mapped_column(String(64), nullable=False)
    confirmed_ownership: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    purpose: Mapped[str] = mapped_column(String(128), default="Security Demonstration", nullable=False)
    max_quota: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class AuthorizationModel(Base, TimestampMixin):
    """Allowlist pre-authorization certificate for lab targets."""

    __tablename__ = "authorizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    origin: Mapped[str] = mapped_column(String(256), unique=True, index=True, nullable=False)
    operator_name: Mapped[str] = mapped_column(String(64), nullable=False)
    purpose: Mapped[str] = mapped_column(String(128), nullable=False)
    confirmed_ownership: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    max_quota: Mapped[int] = mapped_column(Integer, default=50, nullable=False)


class EvidenceEventModel(Base, TimestampMixin):
    """Cryptographically chained, tamper-evident audit record."""

    __tablename__ = "evidence_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), default="default_session", nullable=False, index=True)
    schema_version: Mapped[str] = mapped_column(String(16), default="1.0.0", nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    correlation_id: Mapped[str] = mapped_column(String(64), nullable=False)
    source: Mapped[str] = mapped_column(String(64), default="lab-sensor", nullable=False)
    actor_principal: Mapped[str] = mapped_column(String(64), nullable=False)
    target_service: Mapped[str] = mapped_column(String(128), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prev_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    integrity_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(CompatibleJSON, nullable=True)

    __table_args__ = (
        Index("idx_evidence_session_time", "session_id", "created_at"),
    )
