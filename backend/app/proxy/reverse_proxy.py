"""ASGI Reverse Proxy layer for Sentinel Flow v2.

Proxies traffic from participants/attackers to the allowed target application while:
1. Enforcing target host allowlist at the HTTP client boundary.
2. Server-side measuring exact request/response byte sizes, status, and latency.
3. Transparently maintaining session tokens and cookies via the Session Bridge.
4. Logging every transaction to the TrafficLogger (the sole ground truth for feature pipeline).
"""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from app.proxy.allowlist import AllowlistViolation, TargetAllowlist
from app.proxy.session_bridge import SessionBridge
from app.proxy.traffic_logger import TrafficLogger

logger = logging.getLogger("sentinel_flow.proxy.reverse_proxy")

# Headers that must not be forwarded across the proxy boundaries
HOP_BY_HOP_HEADERS = frozenset([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",  # Recalculated by httpx
])


class ReverseProxyHandler:
    """Manages outbound HTTP client, allowlist verification, session bridging, and telemetry recording."""

    def __init__(
        self,
        allowlist: TargetAllowlist,
        traffic_logger: TrafficLogger,
        session_bridge: SessionBridge,
        default_target: str,
        timeout: float = 30.0,
    ) -> None:
        self.allowlist = allowlist
        self.traffic_logger = traffic_logger
        self.session_bridge = session_bridge
        self.default_target = default_target.rstrip("/")
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout, connect=10.0),
                follow_redirects=False,
                verify=True,
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _resolve_identity(self, request: Request) -> str:
        """Extract and validate identity ID from session tokens; fall back to anonymous guest if unauthenticated."""
        token = (
            request.headers.get("X-Identity-Token")
            or request.headers.get("Authorization", "").replace("Bearer ", "").strip()
            or request.cookies.get("sentinel_session")
        )
        if token:
            try:
                from app.identity.routes import get_session_manager
                sm = get_session_manager()
                sess = sm.validate_token(token)
                if sess:
                    return sess.identity_id
            except Exception:
                pass

        # Check attack run ID for scenario runner attribution
        attack_run_id = request.headers.get("X-Attack-Run-ID")
        if attack_run_id:
            return f"attacker_bot_{attack_run_id[:8]}"

        # Explicit header compatibility for test suite
        explicit_hdr = request.headers.get("X-Sentinel-Identity") or request.headers.get("X-Participant-Device")
        if explicit_hdr:
            return explicit_hdr.strip()

        # Fallback to guest IP
        return f"guest_{request.client.host if request.client else 'local'}"

    def _resolve_target_origin(self, request: Request) -> str:
        """Determine downstream target origin, strictly enforcing allowlist."""
        custom_origin = request.headers.get("X-Target-Origin")
        target = custom_origin.strip().rstrip("/") if custom_origin else self.default_target
        # Validate against allowlist: raises AllowlistViolation if forbidden
        self.allowlist.validate(target)
        return target

    async def proxy_request(self, request: Request, path: str) -> Response:
        """Proxy an incoming FastAPI request to the target destination."""
        identity_id = self._resolve_identity(request)
        user_agent = request.headers.get("user-agent", "")
        fingerprint = request.headers.get("x-device-fingerprint")
        attack_run_id = request.headers.get("x-attack-run-id")

        try:
            target_origin = self._resolve_target_origin(request)
        except AllowlistViolation as err:
            logger.warning("Allowlist blocked proxy request for %s: %s", identity_id, err)
            # Log security violation attempt
            self.traffic_logger.log(
                identity_id=identity_id,
                method=request.method,
                path=f"/{path}",
                query_string=str(request.query_params),
                status_code=status.HTTP_403_FORBIDDEN,
                request_size_bytes=0,
                response_size_bytes=len(str(err)),
                latency_ms=0.0,
                user_agent=user_agent,
                fingerprint_hash=fingerprint,
                attack_run_id=attack_run_id,
                target_origin="BLOCKED",
            )
            return Response(
                content=f'{{"error": "Forbidden: Target host not in operator allowlist", "details": "{err}"}}',
                status_code=status.HTTP_403_FORBIDDEN,
                media_type="application/json",
            )

        # Build target URL
        target_path = f"/{path.lstrip('/')}"
        query_string = request.url.query
        target_url = f"{target_origin}{target_path}"
        if query_string:
            target_url = f"{target_url}?{query_string}"

        # Prepare outbound headers
        forward_headers = {
            k: v
            for k, v in request.headers.items()
            if k.lower() not in HOP_BY_HOP_HEADERS
        }

        # Inject session bridge credentials and headers
        bridge_headers = self.session_bridge.get_headers_for_identity(identity_id)
        forward_headers.update(bridge_headers)

        bridge_cookies = self.session_bridge.get_cookies_for_identity(identity_id)

        # Read request body
        body = await request.body()
        req_size = len(body)

        client = await self.get_client()
        start_time = time.perf_counter()

        try:
            resp = await client.request(
                method=request.method,
                url=target_url,
                headers=forward_headers,
                cookies=bridge_cookies,
                content=body if body else None,
            )
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            resp_content = resp.content
            resp_size = len(resp_content)

            # Store Set-Cookie headers in session bridge
            set_cookies = resp.headers.get_list("set-cookie") if hasattr(resp.headers, "get_list") else resp.headers.getall("set-cookie") if hasattr(resp.headers, "getall") else []
            if not set_cookies and "set-cookie" in resp.headers:
                set_cookies = [resp.headers["set-cookie"]]
            self.session_bridge.update_cookies_from_response(identity_id, set_cookies)

            # Log to traffic logger
            self.traffic_logger.log(
                identity_id=identity_id,
                method=request.method,
                path=target_path,
                query_string=query_string,
                status_code=resp.status_code,
                request_size_bytes=req_size,
                response_size_bytes=resp_size,
                latency_ms=latency_ms,
                fingerprint_hash=fingerprint,
                attack_run_id=attack_run_id,
                target_origin=target_origin,
                user_agent=user_agent,
            )

            # Build response back to client
            out_headers = {
                k: v
                for k, v in resp.headers.items()
                if k.lower() not in HOP_BY_HOP_HEADERS
            }
            # Rewrite Location header for redirects so client continues through /proxy
            if "location" in out_headers:
                loc = out_headers["location"]
                parsed_loc = urlparse(loc)
                if not parsed_loc.netloc or f"{parsed_loc.scheme}://{parsed_loc.netloc}".lower() == target_origin.lower():
                    # Internal target redirect
                    new_path = parsed_loc.path
                    if parsed_loc.query:
                        new_path = f"{new_path}?{parsed_loc.query}"
                    out_headers["location"] = f"/proxy{new_path}"

            return Response(
                content=resp_content,
                status_code=resp.status_code,
                headers=out_headers,
                media_type=resp.headers.get("content-type"),
            )

        except httpx.ConnectError as exc:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error("Target connection failed for %s: %s", target_url, exc)
            self.traffic_logger.log(
                identity_id=identity_id,
                method=request.method,
                path=target_path,
                query_string=query_string,
                status_code=status.HTTP_502_BAD_GATEWAY,
                request_size_bytes=req_size,
                response_size_bytes=0,
                latency_ms=latency_ms,
                target_origin=target_origin,
                user_agent=user_agent,
            )
            return Response(
                content=f'{{"error": "Bad Gateway: Unable to connect to target {target_origin}", "details": "{exc}"}}',
                status_code=status.HTTP_502_BAD_GATEWAY,
                media_type="application/json",
            )
        except httpx.TimeoutException as exc:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error("Target request timed out for %s: %s", target_url, exc)
            self.traffic_logger.log(
                identity_id=identity_id,
                method=request.method,
                path=target_path,
                query_string=query_string,
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                request_size_bytes=req_size,
                response_size_bytes=0,
                latency_ms=latency_ms,
                target_origin=target_origin,
                user_agent=user_agent,
            )
            return Response(
                content=f'{{"error": "Gateway Timeout: Target {target_origin} did not respond within {self.timeout}s"}}',
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                media_type="application/json",
            )


# Global proxy instance holder
_proxy_handler: ReverseProxyHandler | None = None


def get_proxy_handler() -> ReverseProxyHandler:
    if _proxy_handler is None:
        raise RuntimeError("ReverseProxyHandler has not been initialized.")
    return _proxy_handler


def init_proxy_handler(
    allowlist: TargetAllowlist,
    traffic_logger: TrafficLogger,
    session_bridge: SessionBridge,
    default_target: str,
    timeout: float = 30.0,
) -> ReverseProxyHandler:
    global _proxy_handler
    _proxy_handler = ReverseProxyHandler(
        allowlist=allowlist,
        traffic_logger=traffic_logger,
        session_bridge=session_bridge,
        default_target=default_target,
        timeout=timeout,
    )
    return _proxy_handler


# FastAPI router for proxy endpoints
proxy_router = APIRouter(tags=["Reverse Proxy"])


@proxy_router.api_route("/proxy/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def handle_proxy(path: str, request: Request) -> Response:
    """Transparently proxies HTTP requests to allowed target application."""
    handler = get_proxy_handler()
    return await handler.proxy_request(request, path)


@proxy_router.get("/api/proxy/status")
async def proxy_status() -> dict[str, Any]:
    """Returns proxy status, target origins, and logged metrics count."""
    handler = get_proxy_handler()
    return {
        "status": "active",
        "default_target": handler.default_target,
        "allowed_origins": handler.allowlist.origins,
        "total_requests_logged": handler.traffic_logger.total_count,
        "active_bridged_sessions": len(handler.session_bridge.list_sessions()),
        "snapshot": handler.traffic_logger.snapshot(),
    }


@proxy_router.get("/api/proxy/logs")
async def proxy_recent_logs(limit: int = 50, identity_id: str | None = None) -> list[dict[str, Any]]:
    """Returns recent server-measured traffic records, optionally filtered by identity_id."""
    handler = get_proxy_handler()
    records = handler.traffic_logger.recent(limit=limit)
    if identity_id:
        records = [r for r in records if r.identity_id == identity_id]
    return [r.to_dict() for r in records]

