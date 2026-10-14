"""Database repository for Sessions, Participants, and Devices."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.sessions import DeviceModel, IdentityModel, ParticipantModel, SessionModel
from app.db.session import get_session

logger = logging.getLogger("sentinel_flow.repositories.sessions")


class SessionRepository:
    """Manages database persistence for demonstration sessions and participants."""

    async def get_active_session(self) -> SessionModel | None:
        """Fetch the current active session with its participants preloaded."""
        async with get_session() as session:
            stmt = (
                select(SessionModel)
                .options(selectinload(SessionModel.participants))
                .where(SessionModel.status == "active")
                .order_by(SessionModel.created_at.desc())
                .limit(1)
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def save_session(
        self,
        session_id: str,
        session_code: str,
        join_code: str,
        status: str = "active",
        controlled_target_device_id: str | None = None,
    ) -> SessionModel:
        """Insert or update a session record."""
        async with get_session() as session:
            if status == "active":
                from sqlalchemy import update
                await session.execute(
                    update(SessionModel)
                    .where(SessionModel.status == "active", SessionModel.id != session_id)
                    .values(status="closed", closed_at=datetime.now(timezone.utc))
                )

            stmt = select(SessionModel).where(SessionModel.id == session_id)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()

            if record is None:
                record = SessionModel(
                    id=session_id,
                    session_code=session_code,
                    join_code=join_code,
                    status=status,
                    controlled_target_device_id=controlled_target_device_id,
                )
                session.add(record)
            else:
                record.session_code = session_code
                record.join_code = join_code
                record.status = status
                record.controlled_target_device_id = controlled_target_device_id

            await session.flush()
            return record

    async def close_session(self, session_id: str) -> None:
        """Mark a session as closed."""
        async with get_session() as session:
            stmt = select(SessionModel).where(SessionModel.id == session_id)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()
            if record:
                record.status = "closed"
                record.closed_at = datetime.now(timezone.utc)

    async def add_participant(
        self,
        participant_id: str,
        session_id: str,
        alias: str,
        device_id: str,
        role: str = "participant",
        ip_address: str | None = None,
        client_fingerprint: str | None = None,
    ) -> ParticipantModel:
        """Record participant in database."""
        async with get_session() as session:
            record = ParticipantModel(
                id=participant_id,
                session_id=session_id,
                alias=alias,
                role=role,
                device_id=device_id,
                ip_address=ip_address,
                client_fingerprint=client_fingerprint,
                joined_at=datetime.now(timezone.utc),
                last_seen_at=datetime.now(timezone.utc),
            )
            session.add(record)
            await session.flush()
            return record

    async def update_participant_last_seen(self, participant_id: str) -> None:
        """Touch participant last_seen timestamp."""
        async with get_session() as session:
            stmt = select(ParticipantModel).where(ParticipantModel.id == participant_id)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()
            if record:
                record.last_seen_at = datetime.now(timezone.utc)

    async def get_all_participants(self, session_id: str) -> list[ParticipantModel]:
        """Fetch all participants registered for a session."""
        async with get_session() as session:
            stmt = (
                select(ParticipantModel)
                .where(ParticipantModel.session_id == session_id)
                .order_by(ParticipantModel.joined_at.asc())
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def get_past_sessions(self, limit: int = 20) -> list[SessionModel]:
        """Fetch past closed sessions for history."""
        async with get_session() as session:
            stmt = (
                select(SessionModel)
                .options(selectinload(SessionModel.participants))
                .where(SessionModel.status == "closed")
                .order_by(SessionModel.created_at.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())
