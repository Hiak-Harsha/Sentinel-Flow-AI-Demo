"""Database repository for cryptographic identities and devices."""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.sessions import DeviceModel, IdentityModel
from app.db.session import get_session

logger = logging.getLogger("sentinel_flow.repositories.identities")


class IdentityRepository:
    """Manages database persistence for authenticated identities and hardware profiles."""

    async def upsert_identity(
        self,
        identity_id: str,
        alias: str,
        role: str = "participant",
        token: str | None = None,
        device_id: str | None = None,
        expires_at: datetime | None = None,
    ) -> IdentityModel:
        """Create or update an identity record with hashed token."""
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest() if token else None

        async with get_session() as session:
            stmt = select(IdentityModel).where(IdentityModel.id == identity_id)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()

            if record is None:
                record = IdentityModel(
                    id=identity_id,
                    alias=alias,
                    role=role,
                    token_hash=token_hash,
                    device_id=device_id,
                    expires_at=expires_at,
                )
                session.add(record)
            else:
                record.alias = alias
                record.role = role
                if token_hash:
                    record.token_hash = token_hash
                if device_id:
                    record.device_id = device_id
                if expires_at:
                    record.expires_at = expires_at

            await session.flush()
            return record

    async def get_identity(self, identity_id: str) -> IdentityModel | None:
        """Fetch identity by ID."""
        async with get_session() as session:
            stmt = select(IdentityModel).where(IdentityModel.id == identity_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def revoke_identity(self, identity_id: str) -> bool:
        """Revoke an identity."""
        async with get_session() as session:
            stmt = select(IdentityModel).where(IdentityModel.id == identity_id)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()
            if record:
                record.revoked_at = datetime.now(timezone.utc)
                return True
            return False

    async def list_active_identities(self) -> list[IdentityModel]:
        """Fetch all unrevoked identities."""
        now = datetime.now(timezone.utc)
        async with get_session() as session:
            stmt = select(IdentityModel).where(
                IdentityModel.revoked_at.is_(None)
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def record_device(
        self,
        device_id: str,
        fingerprint: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> DeviceModel:
        """Upsert device hardware profile."""
        now = datetime.now(timezone.utc)
        async with get_session() as session:
            stmt = select(DeviceModel).where(DeviceModel.id == device_id)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()

            if record is None:
                record = DeviceModel(
                    id=device_id,
                    device_fingerprint=fingerprint,
                    user_agent=user_agent,
                    ip_address=ip_address,
                    first_seen_at=now,
                    last_seen_at=now,
                )
                session.add(record)
            else:
                record.last_seen_at = now
                if user_agent:
                    record.user_agent = user_agent
                if ip_address:
                    record.ip_address = ip_address

            await session.flush()
            return record
