"""SQLAlchemy declarative base and common column mixins for Sentinel Flow."""

from __future__ import annotations

import secrets
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON, TypeDecorator


def generate_ulid() -> str:
    """Generate a 32-character monotonically time-sortable unique identifier.

    Format: 12 hex characters for milliseconds epoch + 20 random hex characters.
    Sorts lexicographically and chronologically across all databases.
    """
    ts_ms = int(time.time() * 1000)
    rand_part = secrets.token_hex(10)
    return f"{ts_ms:012x}_{rand_part}"


class CompatibleJSON(TypeDecorator):
    """Database-agnostic JSON type that uses JSONB on PostgreSQL and JSON on SQLite."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())


class Base(DeclarativeBase):
    """Base declarative class for all Sentinel Flow database models."""

    type_annotation_map = {
        dict[str, Any]: CompatibleJSON,
        list[Any]: CompatibleJSON,
    }


class TimestampMixin:
    """Provides created_at timestamp in UTC."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
