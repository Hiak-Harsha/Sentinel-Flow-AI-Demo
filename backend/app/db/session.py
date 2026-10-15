"""SQLAlchemy 2.0 async engine and session management for Sentinel Flow.

Supports PostgreSQL (asyncpg) in production / Docker Compose and SQLite (aiosqlite)
for zero-install local development.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import DATABASE_PATH, settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_db_url() -> str:
    """Resolve database URL from settings, defaulting to local aiosqlite path."""
    url = getattr(settings, "db_url", None)
    if not url:
        db_path = DATABASE_PATH.resolve().as_posix()
        url = f"sqlite+aiosqlite:///{db_path}"
    return url


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        url = get_db_url()
        connect_args: dict[str, Any] = {}
        if url.startswith("sqlite"):
            from sqlalchemy.pool import NullPool
            from sqlalchemy import event

            connect_args["check_same_thread"] = False
            connect_args["timeout"] = 30.0
            _engine = create_async_engine(
                url,
                connect_args=connect_args,
                poolclass=NullPool,
                echo=False,
                future=True,
            )

            @event.listens_for(_engine.sync_engine, "connect")
            def _set_sqlite_pragma(dbapi_connection, connection_record):
                cursor = dbapi_connection.cursor()
                try:
                    cursor.execute("PRAGMA busy_timeout = 30000;")
                    cursor.execute("PRAGMA foreign_keys = ON;")
                finally:
                    cursor.close()
        else:
            _engine = create_async_engine(
                url,
                pool_size=20,
                max_overflow=10,
                pool_pre_ping=True,
                echo=False,
                future=True,
            )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        engine = get_engine()
        _session_factory = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
    return _session_factory


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Async context manager providing a scoped database transaction session."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Initialize database schema, tables, and foreign keys."""
    from app.db.base import Base
    import app.db.models  # Ensure all model classes are imported and registered with Base

    engine = get_engine()
    if get_db_url().startswith("sqlite"):
        async with engine.connect() as conn:
            await conn.execution_options(isolation_level="AUTOCOMMIT")
            try:
                await conn.execute(text("PRAGMA journal_mode = WAL;"))
            except Exception:
                pass
            await conn.execute(text("PRAGMA busy_timeout = 30000;"))
            await conn.execute(text("PRAGMA foreign_keys = ON;"))

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Close and dispose of all database connections in pool."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
