"""SQLAlchemy database models for ML model registry and feature drift reports."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CompatibleJSON, TimestampMixin, generate_ulid


class ModelRegistryModel(Base, TimestampMixin):
    """Registered ML models, checkpoints, metrics, and deployment stages."""

    __tablename__ = "model_registry"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    stage: Mapped[str] = mapped_column(
        String(20),
        default="staging",
        nullable=False,
        index=True,
    )  # development, staging, production, archived
    algorithm: Mapped[str] = mapped_column(String(64), default="RandomForestClassifier", nullable=False)
    metrics_json: Mapped[dict[str, Any]] = mapped_column(CompatibleJSON, nullable=False)
    artifact_uri: Mapped[str] = mapped_column(String(256), nullable=False)
    trained_on: Mapped[str] = mapped_column(String(128), default="UNSW-NB15", nullable=False)
    trained_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_model_registry_name_version", "name", "version", unique=True),
    )


class DriftReportModel(Base, TimestampMixin):
    """Statistical drift evaluations comparing inference feature distributions against training baselines."""

    __tablename__ = "drift_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    model_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    model_version: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    evaluation_window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    evaluation_window_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    drift_detected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    drift_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    feature_metrics_json: Mapped[dict[str, Any]] = mapped_column(CompatibleJSON, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_drift_model_ver_time", "model_name", "model_version", "created_at"),
    )
