"""Security headers and request size limit middleware."""

from __future__ import annotations

from typing import Any, Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse

# Maximum allowed request body size: 1 Megabyte
MAX_REQUEST_BODY_SIZE_BYTES = 1024 * 1024


async def security_headers_middleware(request: Request, call_next: Callable[[Request], Any]) -> Response:
    """Inject hardened OWASP security headers into all HTTP responses."""
    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "connect-src 'self' ws: wss: http: https:; "
        "font-src 'self' data:; "
        "frame-ancestors 'none'; "
        "object-src 'none'"
    )

    return response


async def request_size_limit_middleware(request: Request, call_next: Callable[[Request], Any]) -> Response:
    """Reject oversized request payloads (> 1MB) with 413 Payload Too Large."""
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            length_bytes = int(content_length)
            if length_bytes > MAX_REQUEST_BODY_SIZE_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "code": "PAYLOAD_TOO_LARGE",
                            "message": f"Request body exceeds maximum allowed size ({MAX_REQUEST_BODY_SIZE_BYTES} bytes).",
                            "details": {"size_bytes": length_bytes, "max_bytes": MAX_REQUEST_BODY_SIZE_BYTES},
                            "request_id": getattr(request.state, "request_id", None),
                        },
                        "detail": "Request entity too large",
                    },
                )
        except ValueError:
            pass

    return await call_next(request)
