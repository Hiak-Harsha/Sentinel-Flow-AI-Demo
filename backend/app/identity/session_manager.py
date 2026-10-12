"""Cryptographic session manager for Sentinel Flow participants."""

from __future__ import annotations

import logging
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

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
    """Issues and validates secure participant tokens."""

    def __init__(self) -> None:
        # token -> ParticipantSession
        self._tokens: dict[str, ParticipantSession] = {}
        # identity_id -> set of active tokens
        self._identity_tokens: dict[str, set[str]] = {}

    def create_session(
        self,
        *,
        identity_id: str,
        alias: str,
        fingerprint_hash: str,
        role: str = "participant",
        ttl_seconds: float = 86400.0,
    ) -> ParticipantSession:
        """Issue a new secure token for an identity."""
        token = f"sf_{secrets.token_urlsafe(24)}"
        now = time.time()
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
        """Revoke a token."""
        session = self._tokens.get(token)
        if session:
            session.is_revoked = True
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
