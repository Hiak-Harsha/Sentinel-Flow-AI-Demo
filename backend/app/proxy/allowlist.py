"""Hard target-host allowlist enforced at the HTTP-client layer.

This is the single safety chokepoint for ALL outbound traffic from Sentinel Flow
to any destination host. It is structurally impossible for the reverse proxy or the
attack orchestrator to send a request to a host that is not on this list.

Furthermore, external Internet egress is strictly forbidden: all allowed targets
MUST reside within loopback or private lab network boundaries (RFC 1918).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from app.config import is_private_or_loopback_host

logger = logging.getLogger("sentinel_flow.proxy.allowlist")


class AllowlistViolation(Exception):
    """Raised when a request targets a host outside the operator-configured allowlist."""


class TargetAllowlist:
    """Immutable set of allowed target origins, enforced on every outbound request."""

    def __init__(
        self,
        allowed_origins: list[str],
        authorization_record: dict | None = None,
    ) -> None:
        if not allowed_origins:
            raise ValueError(
                "TARGET_ALLOWLIST must contain at least one origin. "
                "Configure it in runtime/target_config.json before starting Sentinel Flow."
            )

        self.authorization_record = authorization_record or {}
        self._allowed: frozenset[tuple[str, str]] = frozenset()
        parsed_set: set[tuple[str, str]] = set()

        for origin in allowed_origins:
            parsed = urlparse(origin.strip().rstrip("/"))
            if not parsed.scheme or not parsed.netloc:
                raise ValueError(
                    f"Invalid allowlist entry {origin!r} — must include scheme and host "
                    "(e.g. 'http://localhost:3000')."
                )

            # Strict private network boundary check: prohibit public egress
            host = parsed.netloc.split(":")[0].strip().lower()
            if not is_private_or_loopback_host(host):
                raise AllowlistViolation(
                    f"External egress forbidden: target origin {origin!r} is not on a "
                    "private or loopback network. Sentinel Flow refuses connection to public hosts."
                )

            parsed_set.add((parsed.scheme.lower(), parsed.netloc.lower()))

        self._allowed = frozenset(parsed_set)

        logger.info(
            "Target allowlist initialised with %d private origin(s): %s",
            len(self._allowed),
            ", ".join(f"{s}://{n}" for s, n in sorted(self._allowed)),
        )

    @property
    def allowed_origins(self) -> list[str]:
        """Return list of canonical string origins in the allowlist."""
        return [f"{s}://{n}" for s, n in sorted(self._allowed)]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def validate(self, url: str) -> None:
        """Raise ``AllowlistViolation`` if *url* is not covered by the allowlist.

        This MUST be called before every outbound request, both in the
        reverse proxy path and in the attack-orchestrator path.
        """
        parsed = urlparse(url)
        key = (parsed.scheme.lower(), parsed.netloc.lower())
        if key not in self._allowed:
            raise AllowlistViolation(
                f"Blocked: target {parsed.scheme}://{parsed.netloc} is not in the "
                f"operator allowlist. Allowed private origins: "
                f"{', '.join(f'{s}://{n}' for s, n in sorted(self._allowed))}"
            )

        # Check authorization expiration if present
        expires_at_iso = self.authorization_record.get("expires_at_utc")
        if expires_at_iso:
            try:
                expires_at = datetime.fromisoformat(expires_at_iso.replace("Z", "+00:00"))
                if datetime.now(timezone.utc) > expires_at:
                    raise AllowlistViolation(
                        f"Target authorization expired at {expires_at_iso}. A fresh operator authorization is required."
                    )
            except Exception as e:
                if isinstance(e, AllowlistViolation):
                    raise
                pass

    def is_allowed(self, url: str) -> bool:
        """Non-raising convenience check."""
        try:
            self.validate(url)
            return True
        except AllowlistViolation:
            return False

    @property
    def origins(self) -> list[str]:
        """Return the allowed origins as a sorted list of URL strings."""
        return sorted(f"{s}://{n}" for s, n in self._allowed)


# ------------------------------------------------------------------
# Factory: load from the operator's signed config file
# ------------------------------------------------------------------

def load_allowlist_from_config(config_path: Path) -> TargetAllowlist:
    """Read ``target_config.json`` and return a ``TargetAllowlist``.

    Expected JSON shape::

        {
            "target_origins": ["http://localhost:3000"],
            "operator_name": "Lab Admin",
            "confirmed_ownership": true,
            "authorization_record": { ... }
        }
    """
    if not config_path.exists():
        raise FileNotFoundError(
            f"Target config not found at {config_path}.  "
            "Create runtime/target_config.json with your owned target app's URL."
        )

    raw = json.loads(config_path.read_text(encoding="utf-8"))

    origins = raw.get("target_origins")
    if not origins or not isinstance(origins, list):
        raise ValueError(
            "target_config.json must contain a non-empty 'target_origins' list."
        )

    if not raw.get("confirmed_ownership"):
        raise ValueError(
            "target_config.json must set 'confirmed_ownership': true — "
            "you must confirm you own the target application."
        )

    auth_record = raw.get("authorization_record")
    return TargetAllowlist(origins, authorization_record=auth_record)
