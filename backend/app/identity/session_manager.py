"""Cryptographic session manager with database persistence for Sentinel Flow participants."""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.repositories.identity_repo import IdentityRepository

logger = logging.getLogger("sentinel_flow.identity.session_manager")


@dataclass
class ParticipantSession:
    """Active session record tied to an identity."""

    token: str
    identity_id: str
    alias: str
    fingerprint_hash: str
    role: str = "participant"
    created_at_epoch: float = field(default_factory=time.time)
    expires_at_epoch: float = field(default_factory=lambda: time.time() + 86400.0)  # 24h
    is_revoked: bool = False

    @property
    def is_valid(self) -> bool:
        return not self.is_revoked and time.time() < self.expires_at_epoch


class SessionManager:
    """Issues, validates, and persists secure participant tokens in database."""

    def __init__(self, repo: IdentityRepository | None = None) -> None:
        self.repo = repo or IdentityRepository()
        self._tokens: dict[str, ParticipantSession] = {}
        self._identity_tokens: dict[str, set[str]] = {}

    def _persist_async(self, coro) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            try:
                asyncio.run(coro)
            except Exception as e:
                logger.debug("Failed running sync persistence fallback in SessionManager: %s", e)

    async def load_from_db(self) -> None:
        """Hydrate unrevoked identities from database on startup."""
        try:
            identities = await self.repo.list_active_identities()
            for id_record in identities:
                token = id_record.token_hash or f"token_{id_record.id}"
                session = ParticipantSession(
                    token=token,
                    identity_id=id_record.id,
                    alias=id_record.alias,
                    fingerprint_hash=id_record.device_id or "unknown",
                    role=id_record.role,
                    created_at_epoch=id_record.created_at.timestamp(),
                    expires_at_epoch=id_record.expires_at.timestamp() if id_record.expires_at else time.time() + 86400,
                    is_revoked=bool(id_record.revoked_at),
                )
                self._tokens[token] = session
                if id_record.id not in self._identity_tokens:
                    self._identity_tokens[id_record.id] = set()
                self._identity_tokens[id_record.id].add(token)
            logger.info("Restored %d active identities from database", len(identities))
        except Exception:
            logger.exception("Failed loading identities from database")

    def create_session(
        self,
        *,
        identity_id: str,
        alias: str,
        fingerprint_hash: str,
        role: str = "participant",
        ttl_seconds: float = 86400.0,
    ) -> ParticipantSession:
        """Issue a new secure token for an identity and persist to database."""
        token = f"sf_{secrets.token_urlsafe(24)}"
        now = time.time()
        expires_at = datetime.fromtimestamp(now + ttl_seconds, tz=timezone.utc)

        session = ParticipantSession(
            token=token,
            identity_id=identity_id,
            alias=alias,
            fingerprint_hash=fingerprint_hash,
            role=role,
            created_at_epoch=now,
            expires_at_epoch=now + ttl_seconds,
        )
        self._tokens[token] = session
        if identity_id not in self._identity_tokens:
            self._identity_tokens[identity_id] = set()
        self._identity_tokens[identity_id].add(token)

        self._persist_async(
            self.repo.upsert_identity(
                identity_id=identity_id,
                alias=alias,
                role=role,
                token=token,
                device_id=fingerprint_hash,
                expires_at=expires_at,
            )
        )

        logger.info("Issued session token for %s (alias: %s, role: %s, fp: %s)", identity_id, alias, role, fingerprint_hash[:8])
        return session

    def validate_token(self, token: str) -> ParticipantSession | None:
        """Validate token and return session if active and not expired."""
        if not token:
            return None
        session = self._tokens.get(token)
        if session and session.is_valid:
            return session
        return None

    def revoke_token(self, token: str) -> bool:
        """Revoke a token and persist revocation to database."""
        session = self._tokens.get(token)
        if session:
            session.is_revoked = True
            self._persist_async(self.repo.revoke_identity(session.identity_id))
            logger.info("Revoked session token for %s", session.identity_id)
            return True
        return False

    def list_active_sessions(self) -> list[dict[str, Any]]:
        """Return summary of all active participant sessions."""
        return [
            {
                "identity_id": s.identity_id,
                "alias": s.alias,
                "role": s.role,
                "fingerprint_hash": s.fingerprint_hash,
                "created_at": s.created_at_epoch,
                "expires_at": s.expires_at_epoch,
                "is_valid": s.is_valid,
            }
            for s in self._tokens.values()
            if s.is_valid
        ]
