"""Defensive Mitigations Service for Sentinel Flow v2 Operator Console.

Provides operator-controlled active defensive countermeasures:
1. Rate Limiting: Bounds requests per second for suspicious identities.
2. Identity Isolation: Blocks / quarantines all traffic from an attacker identity.
3. Mitigation Reset: Restores normal traffic privileges upon triage.
4. Circuit Breaker Integration: Works with run manager emergency stop.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("sentinel_flow.services.mitigation")


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class MitigationService:
    def __init__(self) -> None:
        # identity_id -> {"action": "rate_limit" | "isolate", "rate_limit_rps": float, "applied_by": str, "applied_at": str}
        self._active_mitigations: dict[str, dict[str, Any]] = {}
        # identity_id -> deque of request timestamps for sliding-window rate limiting
        self._request_windows: dict[str, deque[float]] = {}
        self._mitigation_history: list[dict[str, Any]] = []

    def rate_limit_identity(
        self,
        identity_id: str,
        rate_limit_rps: float = 2.0,
        applied_by: str = "Operator",
    ) -> dict[str, Any]:
        """Apply sliding-window rate limiting to a specific identity."""
        rps = max(0.5, float(rate_limit_rps))
        rule = {
            "identity_id": identity_id,
            "action": "rate_limit",
            "rate_limit_rps": rps,
            "status": "ACTIVE",
            "applied_by": applied_by,
            "applied_at": _timestamp(),
        }
        self._active_mitigations[identity_id] = rule
        self._mitigation_history.append({**rule, "event": "rate_limit_applied"})
        if identity_id not in self._request_windows:
            self._request_windows[identity_id] = deque()
        logger.info("Operator %s applied rate-limit (%s rps) to %s", applied_by, rps, identity_id)
        return rule

    def isolate_identity(
        self,
        identity_id: str,
        applied_by: str = "Operator",
    ) -> dict[str, Any]:
        """Completely isolate / quarantine an identity from interacting with lab targets."""
        rule = {
            "identity_id": identity_id,
            "action": "isolate",
            "status": "ACTIVE",
            "applied_by": applied_by,
            "applied_at": _timestamp(),
        }
        self._active_mitigations[identity_id] = rule
        self._mitigation_history.append({**rule, "event": "identity_isolated"})
        logger.warning("Operator %s isolated identity %s", applied_by, identity_id)
        return rule

    def reset_identity_mitigation(
        self,
        identity_id: str,
        reset_by: str = "Operator",
    ) -> dict[str, Any]:
        """Clear active defensive mitigations for an identity."""
        prev = self._active_mitigations.pop(identity_id, None)
        self._request_windows.pop(identity_id, None)
        event = {
            "identity_id": identity_id,
            "action": "none",
            "status": "CLEARED",
            "previous_action": prev.get("action") if prev else None,
            "reset_by": reset_by,
            "reset_at": _timestamp(),
        }
        self._mitigation_history.append(event)
        logger.info("Operator %s reset mitigations for identity %s", reset_by, identity_id)
        return event

    def get_mitigation(self, identity_id: str) -> dict[str, Any] | None:
        return self._active_mitigations.get(identity_id)

    def list_mitigations(self) -> list[dict[str, Any]]:
        return list(self._active_mitigations.values())

    def get_history(self) -> list[dict[str, Any]]:
        return list(reversed(self._mitigation_history[-100:]))

    def check_request_allowed(self, identity_id: str) -> tuple[bool, str, int]:
        """Check if an incoming request from identity_id is allowed under active mitigations.
        
        Returns:
            (allowed: bool, reason: str, status_code: int)
        """
        rule = self._active_mitigations.get(identity_id)
        if not rule:
            return True, "Allowed", 200

        action = rule.get("action")
        if action == "isolate":
            return False, f"Access forbidden: Identity '{identity_id}' is isolated by operator mitigation.", 403

        if action == "rate_limit":
            rps = rule.get("rate_limit_rps", 2.0)
            now = time.time()
            window = self._request_windows.setdefault(identity_id, deque())
            
            # Prune events older than 1.0 second
            cutoff = now - 1.0
            while window and window[0] < cutoff:
                window.popleft()

            if len(window) >= rps:
                return False, f"Rate limit exceeded for '{identity_id}': capped at {rps} req/s by operator mitigation.", 429

            window.append(now)
            return True, "Allowed within rate limit", 200

        return True, "Allowed", 200


_global_mitigation_service: MitigationService | None = None


def get_mitigation_service() -> MitigationService:
    global _global_mitigation_service
    if _global_mitigation_service is None:
        _global_mitigation_service = MitigationService()
    return _global_mitigation_service


def set_mitigation_service(service: MitigationService) -> None:
    global _global_mitigation_service
    _global_mitigation_service = service
