"""SQLAlchemy database model for streaming feature windows."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CompatibleJSON, TimestampMixin, generate_ulid


class FeatureWindowModel(Base, TimestampMixin):
    """Calculated sliding window feature vectors per identity."""

    __tablename__ = "feature_windows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_ulid)
    identity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    window_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    window_size_seconds: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    schema_version: Mapped[str] = mapped_column(String(16), default="1.0", nullable=False)
    feature_vector_json: Mapped[dict[str, Any]] = mapped_column(CompatibleJSON, nullable=False)

    __table_args__ = (
        Index("ix_feature_windows_identity_start", "identity_id", "window_start"),
    )
