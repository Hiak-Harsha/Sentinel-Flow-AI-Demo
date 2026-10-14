"""SQLAlchemy database models for sessions, participants, devices, and identities."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CompatibleJSON, TimestampMixin, generate_ulid


class SessionModel(Base, TimestampMixin):
    """Demonstration / classroom lab session state."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    session_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    join_code: Mapped[str] = mapped_column(String(16), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    controlled_target_device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    participants: Mapped[list[ParticipantModel]] = relationship(
        "ParticipantModel",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class ParticipantModel(Base, TimestampMixin):
    """Connected audience or operator participant."""

    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    alias: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="participant", nullable=False)
    device_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    client_fingerprint: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    session: Mapped[SessionModel] = relationship("SessionModel", back_populates="participants")


class DeviceModel(Base, TimestampMixin):
    """Observed hardware and browser fingerprint profile."""

    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_fingerprint: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class IdentityModel(Base, TimestampMixin):
    """Cryptographic or session-authenticated identity record."""

    __tablename__ = "identities"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    alias: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="participant", nullable=False)
    token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
