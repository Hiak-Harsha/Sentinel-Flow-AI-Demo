"""Server-side and composite device fingerprint computation."""

from __future__ import annotations

import hashlib
import logging
from typing import Any
from fastapi import Request

logger = logging.getLogger("sentinel_flow.identity.fingerprint")


def compute_server_fingerprint(
    *,
    user_agent: str,
    accept_language: str = "",
    client_ip: str = "",
    sec_ch_ua: str = "",
    sec_ch_ua_platform: str = "",
) -> str:
    """Compute an immutable 16-character hex hash based on client HTTP attributes."""
    canonical_str = "|".join([
        client_ip.strip(),
        user_agent.strip(),
        accept_language.strip()[:10],
        sec_ch_ua.strip(),
        sec_ch_ua_platform.strip(),
    ])
    digest = hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()
    return digest[:16]


def extract_fingerprint_from_request(request: Request) -> str:
    """Extract or calculate device fingerprint from an incoming HTTP request."""
    # If client passed high-entropy client-side fingerprint (e.g. from canvas/webgl), use that
    client_fp = request.headers.get("x-device-fingerprint")
    if client_fp and len(client_fp.strip()) >= 8:
        return client_fp.strip()[:32]

    # Otherwise compute server-side fingerprint
    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")
    lang = request.headers.get("accept-language", "")
    sec_ua = request.headers.get("sec-ch-ua", "")
    platform = request.headers.get("sec-ch-ua-platform", "")

    return compute_server_fingerprint(
        user_agent=ua,
        accept_language=lang,
        client_ip=ip,
        sec_ch_ua=sec_ua,
        sec_ch_ua_platform=platform,
    )
