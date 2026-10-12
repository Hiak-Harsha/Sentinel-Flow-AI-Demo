"""Operator consent gate and audit log.

Ensures no attack scenario can be launched without explicit, logged confirmation
that the operator owns the target environment.
"""

from __future__ import annotations

import logging
import secrets
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer, SecurityError

logger = logging.getLogger("sentinel_flow.orchestrator.consent_gate")


@dataclass
class ConsentRecord:
    consent_token: str
    target_origin: str
    operator_name: str
    confirmed_ownership: bool
    granted_at_epoch: float = field(default_factory=time.time)
    granted_at_iso: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    )


class ConsentGate:
    """Manages explicit operator consent verification and audit records."""

    def __init__(self, enforcer: OrchestratorAllowlistEnforcer) -> None:
        self.enforcer = enforcer
        self._consent_tokens: dict[str, ConsentRecord] = {}
        self._audit_log: list[ConsentRecord] = []

    def grant_consent(
        self,
        *,
        target_origin: str,
        operator_name: str,
        confirmed_ownership: bool,
    ) -> ConsentRecord:
        """Issue a consent token after verifying allowlist and ownership confirmation."""
        # 1. Enforce allowlist on target
        valid_origin = self.enforcer.validate_target(target_origin)

        # 2. Check ownership confirmation
        if not confirmed_ownership:
            raise SecurityError(
                "Consent denied: operator must confirm ownership of the target application."
            )

        clean_operator = operator_name.strip() if operator_name else "Operator"
        token = f"cst_{secrets.token_urlsafe(16)}"
        record = ConsentRecord(
            consent_token=token,
            target_origin=valid_origin,
            operator_name=clean_operator,
            confirmed_ownership=confirmed_ownership,
        )

        self._consent_tokens[token] = record
        self._audit_log.append(record)

        logger.info(
            "CONSENT GRANTED: Operator '%s' confirmed ownership of '%s' (token: %s)",
            clean_operator,
            valid_origin,
            token[:10],
        )
        return record

    def verify_consent(self, consent_token: str, target_origin: str) -> bool:
        """Verify whether an active consent record exists for the given target."""
        record = self._consent_tokens.get(consent_token)
        if not record:
            return False

        # Token valid for 2 hours
        if time.time() - record.granted_at_epoch > 7200.0:
            return False

        valid_origin = self.enforcer.validate_target(target_origin)
        return record.target_origin.lower() == valid_origin.lower()

    def get_audit_log(self) -> list[dict[str, Any]]:
        return [asdict(r) for r in self._audit_log]
