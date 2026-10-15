"""Authentication routes: Argon2 operator login, JWT token rotation, refresh, and logout."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.auth.dependencies import UserContext, get_current_user
from app.auth.security import (
    create_access_token,
    create_refresh_token,
    login_rate_limiter,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_operator_passcode,
)
from app.identity.routes import get_session_manager

logger = logging.getLogger("sentinel_flow.api.v1.auth")

router = APIRouter(prefix="/auth", tags=["Authentication & RBAC"])


class OperatorLoginRequest(BaseModel):
    passcode: str = Field(..., min_length=1, description="Operator authorization passcode")


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1, description="Rotating refresh token")


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class TokenResponse(BaseModel):
    status: str = "ok"
    authenticated: bool = True
    access_token: str
    refresh_token: str
    token: str  # Backwards compatibility alias for access_token
    token_type: str = "bearer"
    expires_in: int = 900
    identity_id: str
    alias: str
    role: str


@router.post(
    "/operator-login",
    response_model=TokenResponse,
    summary="Authenticate operator with Argon2 passcode and issue short-lived JWT + rotating refresh token",
)
async def operator_login(req: OperatorLoginRequest, request: Request) -> dict[str, Any]:
    client_ip = request.client.host if request.client else "unknown"

    # 1. Rate limiter lockout check
    is_allowed, remaining_sec = login_rate_limiter.check(client_ip)
    if not is_allowed:
        logger.warning("Blocked login attempt from locked-out IP %s (%s seconds remaining)", client_ip, remaining_sec)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Locked out for {int(remaining_sec)} seconds.",
            headers={"Retry-After": str(int(remaining_sec))},
        )

    # 2. Verify passcode with Argon2
    is_valid = verify_operator_passcode(req.passcode)
    if not is_valid:
        failures, is_locked, lockout_dur = login_rate_limiter.record_failure(client_ip)
        logger.warning("Failed operator login from IP %s (attempt %d)", client_ip, failures)
        if is_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Locked out for {int(lockout_dur)} seconds.",
                headers={"Retry-After": str(int(lockout_dur))},
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid operator passcode.",
        )

    # 3. Successful login - clear rate-limit failure tracker
    login_rate_limiter.record_success(client_ip)

    # 4. Issue JWT access token (15 mins) and rotating refresh token (7 days)
    identity_id = "operator_console"
    alias = "Operator Console"
    role = "operator"

    access_token = create_access_token(
        identity_id=identity_id,
        alias=alias,
        role=role,
        ttl_minutes=15,
    )
    refresh_token, _ = create_refresh_token(
        identity_id=identity_id,
        alias=alias,
        role=role,
        ttl_days=7,
    )

    # Register in SessionManager for backwards-compatible token validation
    try:
        sm = get_session_manager()
        sm.create_session(
            identity_id=identity_id,
            alias=alias,
            fingerprint_hash="op_console_fp",
            role=role,
        )
    except Exception:
        pass

    logger.info("Operator authenticated successfully from %s; issued JWT access & refresh tokens", client_ip)
    return {
        "status": "ok",
        "authenticated": True,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token": access_token,
        "token_type": "bearer",
        "expires_in": 900,
        "identity_id": identity_id,
        "alias": alias,
        "role": role,
    }


@router.post(
    "/refresh",
    summary="Rotate refresh token and issue new JWT access token",
)
async def refresh_token(req: RefreshTokenRequest) -> dict[str, Any]:
    try:
        new_access, new_refresh, identity_id, role = rotate_refresh_token(req.refresh_token)
    except ValueError as exc:
        logger.warning("Refresh token rotation rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    return {
        "status": "ok",
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token": new_access,
        "token_type": "bearer",
        "expires_in": 900,
        "identity_id": identity_id,
        "role": role,
    }


@router.post(
    "/logout",
    summary="Revoke refresh token and invalidate operator session",
)
async def logout(req: LogoutRequest) -> dict[str, Any]:
    if req.refresh_token:
        revoke_refresh_token(req.refresh_token)
    return {"status": "ok", "message": "Successfully logged out"}


@router.get(
    "/whoami",
    summary="Get authenticated user role and identity context",
)
async def whoami(user: UserContext = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "authenticated": user.authenticated,
        "identity_id": user.identity_id if user.authenticated else None,
        "alias": user.alias if user.authenticated else None,
        "role": user.role,
        "token_type": user.token_type,
    }
