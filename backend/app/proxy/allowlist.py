"""Hard target-host allowlist enforced at the HTTP-client layer.

This is the single safety chokepoint for ALL outbound traffic from Sentinel Flow
to any external host.  It is structurally impossible for the reverse proxy or the
attack orchestrator to send a request to a host that is not on this list.

The allowlist is loaded once from a signed operator config file at startup and is
immutable for the lifetime of the process.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger("sentinel_flow.proxy.allowlist")


class AllowlistViolation(Exception):
    """Raised when a request targets a host outside the operator-configured allowlist."""


class TargetAllowlist:
    """Immutable set of allowed target origins, enforced on every outbound request."""

    def __init__(self, allowed_origins: list[str]) -> None:
        if not allowed_origins:
            raise ValueError(
                "TARGET_ALLOWLIST must contain at least one origin. "
                "Configure it in runtime/target_config.json before starting Sentinel Flow."
            )

        # Normalise to (scheme, netloc) tuples for unambiguous matching.
        self._allowed: frozenset[tuple[str, str]] = frozenset()
        parsed_set: set[tuple[str, str]] = set()
        for origin in allowed_origins:
            parsed = urlparse(origin.strip().rstrip("/"))
            if not parsed.scheme or not parsed.netloc:
                raise ValueError(
                    f"Invalid allowlist entry {origin!r} — must include scheme and host "
                    "(e.g. 'http://localhost:3000')."
                )
            parsed_set.add((parsed.scheme.lower(), parsed.netloc.lower()))
        self._allowed = frozenset(parsed_set)

        logger.info(
            "Target allowlist initialised with %d origin(s): %s",
            len(self._allowed),
            ", ".join(f"{s}://{n}" for s, n in sorted(self._allowed)),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def validate(self, url: str) -> None:
        """Raise ``AllowlistViolation`` if *url* is not covered by the allowlist.

        This MUST be called before every outbound ``httpx`` request, both in the
        reverse proxy path and in the attack-orchestrator path.
        """
        parsed = urlparse(url)
        key = (parsed.scheme.lower(), parsed.netloc.lower())
        if key not in self._allowed:
            raise AllowlistViolation(
                f"Blocked: target {parsed.scheme}://{parsed.netloc} is not in the "
                f"operator allowlist.  Allowed origins: "
                f"{', '.join(f'{s}://{n}' for s, n in sorted(self._allowed))}"
            )

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
            "confirmed_ownership": true
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

    return TargetAllowlist(origins)
