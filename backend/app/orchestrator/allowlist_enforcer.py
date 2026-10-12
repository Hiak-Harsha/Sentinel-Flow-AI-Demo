"""Allowlist enforcer for the attack orchestrator.

Ensures that every scenario driver (ZAP, Load, Credential stuffing) is structurally
incapable of targeting an origin not on the operator allowlist.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from app.proxy.allowlist import AllowlistViolation, TargetAllowlist

logger = logging.getLogger("sentinel_flow.orchestrator.allowlist_enforcer")


class SecurityError(Exception):
    """Raised when an attack operation attempts to target an unauthorized host."""


class OrchestratorAllowlistEnforcer:
    """Enforces target boundary at the orchestrator layer."""

    def __init__(self, allowlist: TargetAllowlist) -> None:
        self.allowlist = allowlist

    def validate_target(self, target_url: str) -> str:
        """Validate target against allowlist. Raises SecurityError if forbidden.

        Returns normalized origin string (e.g. 'http://localhost:3000').
        """
        if not target_url:
            raise SecurityError("Target URL cannot be empty.")

        parsed = urlparse(target_url.strip())
        if not parsed.scheme or not parsed.netloc:
            raise SecurityError(
                f"Invalid target URL {target_url!r} — must specify scheme and host (e.g. http://localhost:3000)"
            )

        origin = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
        try:
            self.allowlist.validate(origin)
        except AllowlistViolation as e:
            logger.critical("SAFETY VIOLATION ATTEMPT: %s", e)
            raise SecurityError(f"Target host forbidden: {e}") from e

        return origin
