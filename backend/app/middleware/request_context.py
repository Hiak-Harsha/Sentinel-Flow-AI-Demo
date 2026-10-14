"""Request ID correlation middleware and unified error envelope handlers."""

from __future__ import annotations

import time
import uuid
from typing import Any, Callable

import structlog
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.orchestrator.allowlist_enforcer import SecurityError
from app.proxy.allowlist import AllowlistViolation
from app.schemas.envelope import ErrorDetail, ErrorEnvelope

logger = structlog.get_logger("sentinel_flow.http")


def get_request_id(request: Request) -> str:
    """Retrieve or generate correlation request ID from request state or header."""
    req_id = getattr(request.state, "request_id", None)
    if not req_id:
        req_id = request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:16]}"
        request.state.request_id = req_id
    return req_id


async def request_id_middleware(request: Request, call_next: Callable[[Request], Any]) -> Response:
    """Assign X-Request-ID header and bind structured contextvars for request lifecycle."""
    req_id = get_request_id(request)
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=req_id,
        method=request.method,
        path=request.url.path,
        client_ip=request.client.host if request.client else "unknown",
    )

    t0 = time.time()
    try:
        response = await call_next(request)
        duration_ms = round((time.time() - t0) * 1000, 2)
        response.headers["X-Request-ID"] = req_id
        logger.info(
            "http_request_finished",
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response
    except Exception as exc:
        duration_ms = round((time.time() - t0) * 1000, 2)
        logger.error(
            "http_request_unhandled_exception",
            error=str(exc),
            duration_ms=duration_ms,
            exc_info=True,
        )
        raise


def register_error_handlers(app: FastAPI) -> None:
    """Register FastAPI global exception handlers using the uniform ErrorEnvelope."""

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        req_id = get_request_id(request)
        msg = "Invalid request payload or query parameters."
        env = ErrorEnvelope(
            error=ErrorDetail(
                code="VALIDATION_ERROR",
                message=msg,
                details=exc.errors(),
                request_id=req_id,
            ),
            detail=msg,
        )
        return JSONResponse(status_code=422, content=env.model_dump(), headers={"X-Request-ID": req_id})

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        req_id = get_request_id(request)
        code = f"HTTP_{exc.status_code}"
        if exc.status_code == 404:
            code = "NOT_FOUND"
        elif exc.status_code == 401:
            code = "UNAUTHORIZED"
        elif exc.status_code == 403:
            code = "FORBIDDEN"
        elif exc.status_code == 400:
            code = "BAD_REQUEST"

        msg = str(exc.detail)
        env = ErrorEnvelope(
            error=ErrorDetail(
                code=code,
                message=msg,
                details=None,
                request_id=req_id,
            ),
            detail=msg,
        )
        return JSONResponse(status_code=exc.status_code, content=env.model_dump(), headers={"X-Request-ID": req_id})

    @app.exception_handler(SecurityError)
    async def security_error_handler(request: Request, exc: SecurityError) -> JSONResponse:
        req_id = get_request_id(request)
        msg = str(exc)
        env = ErrorEnvelope(
            error=ErrorDetail(
                code="SECURITY_ERROR",
                message=msg,
                details=None,
                request_id=req_id,
            ),
            detail=msg,
        )
        return JSONResponse(status_code=403, content=env.model_dump(), headers={"X-Request-ID": req_id})

    @app.exception_handler(AllowlistViolation)
    async def allowlist_violation_handler(request: Request, exc: AllowlistViolation) -> JSONResponse:
        req_id = get_request_id(request)
        env = ErrorEnvelope(
            error=ErrorDetail(
                code="ALLOWLIST_VIOLATION",
                message=str(exc),
                details=None,
                request_id=req_id,
            )
        )
        return JSONResponse(status_code=400, content=env.model_dump(), headers={"X-Request-ID": req_id})

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        req_id = get_request_id(request)
        logger.critical("internal_server_error", error=str(exc), exc_info=True)
        env = ErrorEnvelope(
            error=ErrorDetail(
                code="INTERNAL_SERVER_ERROR",
                message="An unexpected server error occurred.",
                details=str(exc),
                request_id=req_id,
            )
        )
        return JSONResponse(status_code=500, content=env.model_dump(), headers={"X-Request-ID": req_id})
