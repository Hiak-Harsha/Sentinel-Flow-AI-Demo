"""Session bridge — maps Sentinel Flow identities to target application sessions.

Allows participants to authenticate into Sentinel Flow once, while the bridge
manages session tokens, cookies, and identity mappings for the downstream target app.
Maintains an isolated cookie jar and credential cache per identity.
"""

from __future__ import annotations

import http.cookies
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("sentinel_flow.proxy.session_bridge")


@dataclass
class TargetSession:
    """Session credentials and state held for a Sentinel Flow identity."""

    identity_id: str
    cookies: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    )
    last_active_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    )


class SessionBridge:
    """Manages per-identity target session state, cookie translation, and header injection."""

    def __init__(self) -> None:
        self._sessions: dict[str, TargetSession] = {}

    def get_or_create_session(self, identity_id: str) -> TargetSession:
        """Retrieve or create session for the given identity."""
        if identity_id not in self._sessions:
            self._sessions[identity_id] = TargetSession(
                identity_id=identity_id,
                headers={"X-Sentinel-Identity": identity_id},
            )
            logger.info("Created new target session bridge for identity %s", identity_id)
        session = self._sessions[identity_id]
        session.last_active_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return session

    def get_cookies_for_identity(self, identity_id: str) -> dict[str, str]:
        """Return target cookies that should be attached to an outbound request."""
        session = self._sessions.get(identity_id)
        return dict(session.cookies) if session else {}

    def get_headers_for_identity(self, identity_id: str) -> dict[str, str]:
        """Return headers that should be injected into outbound target requests."""
        session = self._sessions.get(identity_id)
        if not session:
            return {"X-Sentinel-Identity": identity_id}
        headers = dict(session.headers)
        headers["X-Sentinel-Identity"] = identity_id
        return headers

    def update_cookies_from_response(
        self, identity_id: str, set_cookie_headers: list[str]
    ) -> None:
        """Parse Set-Cookie headers from target app response and store them in the session."""
        if not set_cookie_headers:
            return

        session = self.get_or_create_session(identity_id)
        for raw_cookie in set_cookie_headers:
            try:
                cookie = http.cookies.SimpleCookie()
                cookie.load(raw_cookie)
                for key, morsel in cookie.items():
                    if morsel.value:
                        session.cookies[key] = morsel.value
                    elif key in session.cookies and morsel.get("max-age") == "0":
                        # Expired/cleared cookie
                        del session.cookies[key]
            except Exception as e:
                logger.warning(
                    "Failed to parse Set-Cookie header %r for %s: %s",
                    raw_cookie,
                    identity_id,
                    e,
                )

    def attach_credentials(
        self,
        identity_id: str,
        *,
        cookies: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        """Explicitly set cookies or headers for an identity's target session."""
        session = self.get_or_create_session(identity_id)
        if cookies:
            session.cookies.update(cookies)
        if headers:
            session.headers.update(headers)
        logger.info("Updated target credentials for identity %s", identity_id)

    def clear_session(self, identity_id: str) -> None:
        """Remove target session for identity upon logout or reset."""
        if identity_id in self._sessions:
            del self._sessions[identity_id]
            logger.info("Cleared target session for identity %s", identity_id)

    def list_sessions(self) -> list[dict[str, Any]]:
        """Return summary of all active bridged sessions."""
        return [
            {
                "identity_id": s.identity_id,
                "cookie_count": len(s.cookies),
                "created_at": s.created_at,
                "last_active_at": s.last_active_at,
            }
            for s in self._sessions.values()
        ]
