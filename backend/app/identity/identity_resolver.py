"""Identity resolver — binds alias, session token, and device fingerprint into an identity triple.

Surfaces behavioural anomalies such as mid-session fingerprint change (ATO)
and fingerprint reuse across multiple accounts (credential stuffing).
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from app.identity.session_manager import ParticipantSession, SessionManager

logger = logging.getLogger("sentinel_flow.identity.identity_resolver")


@dataclass
class IdentityTriple:
    """Bounded identity triple: alias + session token + fingerprint."""

    identity_id: str
    alias: str
    token: str
    primary_fingerprint: str
    role: str = "participant"
    observed_fingerprints: set[str] = field(default_factory=set)
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)


class IdentityResolver:
    """Binds aliases to fingerprints and session tokens, detecting identity mismatches."""

    def __init__(self, session_manager: SessionManager) -> None:
        self.session_manager = session_manager
        # identity_id -> IdentityTriple
        self._triples: dict[str, IdentityTriple] = {}
        # fingerprint -> deque of (timestamp, identity_id) for churn tracking
        self._fp_to_identities: dict[str, deque[tuple[float, str]]] = defaultdict(deque)

    def bind_identity(
        self,
        *,
        identity_id: str,
        alias: str,
        fingerprint_hash: str,
        role: str = "participant",
    ) -> tuple[IdentityTriple, ParticipantSession]:
        """Create new identity binding with validated session token."""
        session = self.session_manager.create_session(
            identity_id=identity_id,
            alias=alias,
            fingerprint_hash=fingerprint_hash,
            role=role,
        )

        triple = IdentityTriple(
            identity_id=identity_id,
            alias=alias,
            token=session.token,
            primary_fingerprint=fingerprint_hash,
            role=role,
            observed_fingerprints={fingerprint_hash},
        )
        self._triples[identity_id] = triple
        self._fp_to_identities[fingerprint_hash].append((time.time(), identity_id))

        return triple, session

    def inspect_request(
        self,
        *,
        identity_id: str,
        token: str | None,
        current_fingerprint: str,
    ) -> dict[str, Any]:
        """Validate token and check for fingerprint divergence / multi-account churn."""
        now = time.time()
        is_token_valid = False
        ato_flag = False
        multi_account_count = 1

        # 1. Check token validity if present
        if token:
            session = self.session_manager.validate_token(token)
            if session:
                is_token_valid = True
                if session.identity_id != identity_id:
                    ato_flag = True

        # 2. Check fingerprint consistency for this identity
        triple = self._triples.get(identity_id)
        if triple:
            triple.last_seen = now
            if current_fingerprint not in triple.observed_fingerprints:
                logger.warning(
                    "Identity %s observed with new fingerprint: %s (previously: %s)",
                    identity_id,
                    current_fingerprint[:8],
                    list(triple.observed_fingerprints),
                )
                triple.observed_fingerprints.add(current_fingerprint)
                ato_flag = True

        # 3. Check account churn for this fingerprint in the last 5 minutes
        cutoff = now - 300.0
        fp_q = self._fp_to_identities[current_fingerprint]
        # Clean expired entries
        while fp_q and fp_q[0][0] < cutoff:
            fp_q.popleft()
        fp_q.append((now, identity_id))

        recent_accounts = set(uid for _, uid in fp_q)
        multi_account_count = len(recent_accounts)

        return {
            "identity_id": identity_id,
            "is_token_valid": is_token_valid,
            "ato_flag": ato_flag,
            "multi_account_count": multi_account_count,
            "current_fingerprint": current_fingerprint,
        }

    def get_triple(self, identity_id: str) -> IdentityTriple | None:
        return self._triples.get(identity_id)

    def list_identities(self) -> list[dict[str, Any]]:
        return [
            {
                "identity_id": t.identity_id,
                "alias": t.alias,
                "primary_fingerprint": t.primary_fingerprint,
                "fingerprint_count": len(t.observed_fingerprints),
                "first_seen": t.first_seen,
                "last_seen": t.last_seen,
            }
            for t in self._triples.values()
        ]
