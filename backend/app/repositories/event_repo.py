"""Database repository for raw request/telemetry events, feature windows, and rollups."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.events import EventModel, TelemetryRollupModel
from app.db.models.features import FeatureWindowModel
from app.db.session import get_session

logger = logging.getLogger("sentinel_flow.repositories.events")


class EventRepository:
    """Manages database persistence, time-series querying, and rollups for telemetry events."""

    async def log_event(
        self,
        identity_id: str,
        path_template: str,
        method: str = "GET",
        status_code: int = 200,
        bytes_in: int = 0,
        bytes_out: int = 0,
        latency_ms: float = 0.0,
        source: str = "reverse_proxy",
        provenance: str = "live",
        session_id: str | None = None,
        attack_run_id: str | None = None,
        metadata_json: dict[str, Any] | None = None,
        ts: datetime | None = None,
    ) -> EventModel:
        """Store a normalized telemetry event."""
        event = EventModel(
            identity_id=identity_id,
            session_id=session_id,
            method=method,
            path_template=path_template,
            status_code=status_code,
            bytes_in=bytes_in,
            bytes_out=bytes_out,
            latency_ms=latency_ms,
            source=source,
            provenance=provenance,
            attack_run_id=attack_run_id,
            metadata_json=metadata_json,
            ts=ts or datetime.now(timezone.utc),
        )
        async with get_session() as session:
            session.add(event)
            await session.flush()
            return event

    async def get_recent_events(
        self,
        limit: int = 50,
        session_id: str | None = None,
        identity_id: str | None = None,
    ) -> list[EventModel]:
        """Fetch latest raw telemetry events in descending order."""
        async with get_session() as session:
            stmt = select(EventModel)
            if session_id:
                stmt = stmt.where(EventModel.session_id == session_id)
            if identity_id:
                stmt = stmt.where(EventModel.identity_id == identity_id)
            stmt = stmt.order_by(EventModel.ts.desc()).limit(limit)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def save_feature_window(
        self,
        identity_id: str,
        feature_vector: dict[str, Any],
        window_size_seconds: int = 30,
        schema_version: str = "1.0",
        window_start: datetime | None = None,
    ) -> FeatureWindowModel:
        """Store a calculated feature window."""
        record = FeatureWindowModel(
            identity_id=identity_id,
            window_start=window_start or datetime.now(timezone.utc),
            window_size_seconds=window_size_seconds,
            schema_version=schema_version,
            feature_vector_json=feature_vector,
        )
        async with get_session() as session:
            session.add(record)
            await session.flush()
            return record

    async def get_feature_windows(
        self,
        identity_id: str | None = None,
        limit: int = 100,
    ) -> list[FeatureWindowModel]:
        """Fetch sliding feature windows."""
        async with get_session() as session:
            stmt = select(FeatureWindowModel)
            if identity_id:
                stmt = stmt.where(FeatureWindowModel.identity_id == identity_id)
            stmt = stmt.order_by(FeatureWindowModel.window_start.desc()).limit(limit)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def prune_events_older_than(self, days: int = 7) -> int:
        """Delete raw telemetry events older than retention cutoff (default 7 days)."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        async with get_session() as session:
            stmt = delete(EventModel).where(EventModel.ts < cutoff)
            result = await session.execute(stmt)
            count = result.rowcount
            logger.info("Pruned %d events older than %s (retention: %d days)", count, cutoff.isoformat(), days)
            return count

    async def generate_rollup(self, window_type: str = "1m", since: datetime | None = None) -> TelemetryRollupModel | None:
        """Compute and store an aggregated statistics rollup over a time window."""
        now = datetime.now(timezone.utc)
        duration = timedelta(minutes=1) if window_type == "1m" else timedelta(hours=1)
        start_time = since or (now - duration)

        async with get_session() as session:
            stmt = select(
                func.count(EventModel.id).label("total_requests"),
                func.sum(case((EventModel.status_code >= 400, 1), else_=0)).label("error_count"),
                func.coalesce(func.avg(EventModel.latency_ms), 0.0).label("avg_latency_ms"),
                func.coalesce(func.sum(EventModel.bytes_in), 0).label("total_bytes_in"),
                func.coalesce(func.sum(EventModel.bytes_out), 0).label("total_bytes_out"),
                func.count(func.distinct(EventModel.identity_id)).label("unique_identities"),
            ).where(EventModel.ts >= start_time, EventModel.ts < now)

            res = await session.execute(stmt)
            row = res.one_or_none()
            if not row or (row.total_requests or 0) == 0:
                return None

            rollup = TelemetryRollupModel(
                window_type=window_type,
                window_start=start_time,
                total_requests=row.total_requests or 0,
                error_count=row.error_count or 0,
                avg_latency_ms=float(row.avg_latency_ms or 0.0),
                p95_latency_ms=float(row.avg_latency_ms or 0.0) * 1.5,
                unique_identities=row.unique_identities or 0,
                total_bytes_in=int(row.total_bytes_in or 0),
                total_bytes_out=int(row.total_bytes_out or 0),
            )
            session.add(rollup)
            await session.flush()
            return rollup

    async def get_rollups(self, window_type: str = "1m", limit: int = 60) -> list[TelemetryRollupModel]:
        """Fetch pre-aggregated rollups for analytics and dashboards."""
        async with get_session() as session:
            stmt = (
                select(TelemetryRollupModel)
                .where(TelemetryRollupModel.window_type == window_type)
                .order_by(TelemetryRollupModel.window_start.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            return list(reversed(result.scalars().all()))
