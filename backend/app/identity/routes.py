"""FastAPI router for identity and device registration."""

from __future__ import annotations

import uuid
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.identity.fingerprint import extract_fingerprint_from_request
from app.identity.identity_resolver import IdentityResolver
from app.identity.session_manager import SessionManager

router = APIRouter(prefix="/api/identity", tags=["Identity"])

_session_manager: SessionManager | None = None
_identity_resolver: IdentityResolver | None = None


def init_identity_system(repo: Any | None = None) -> tuple[SessionManager, IdentityResolver]:
    global _session_manager, _identity_resolver
    _session_manager = SessionManager(repo=repo)
    _identity_resolver = IdentityResolver(_session_manager)
    return _session_manager, _identity_resolver


def get_identity_resolver() -> IdentityResolver:
    if _identity_resolver is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Identity system not initialized.",
        )
    return _identity_resolver


def get_session_manager() -> SessionManager:
    if _session_manager is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Session manager not initialized.",
        )
    return _session_manager


from app.config import OPERATOR_PASSCODE, OPERATOR_SECRET_KEY


class RegisterIdentityRequest(BaseModel):
    alias: str = Field(..., min_length=1, max_length=32)
    device_id: str | None = None
    client_fingerprint: str | None = None
    role: str = "participant"
    passcode: str | None = None


class OperatorLoginRequest(BaseModel):
    passcode: str = Field(..., min_length=1)


class ValidateTokenRequest(BaseModel):
    token: str


from app.auth.security import (
    create_access_token,
    create_refresh_token,
    login_rate_limiter,
    verify_operator_passcode,
)
from app.auth.dependencies import get_current_user, UserContext


@router.post("/operator-login")
async def operator_login(req: OperatorLoginRequest, request: Request) -> dict[str, Any]:
    """Verify operator passcode using Argon2 and issue short-lived JWT + rotating refresh token."""
    client_ip = request.client.host if request.client else "unknown"

    # Rate limiter check
    is_allowed, remaining_sec = login_rate_limiter.check(client_ip)
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Locked out for {int(remaining_sec)} seconds.",
            headers={"Retry-After": str(int(remaining_sec))},
        )

    # Argon2 verification
    if not verify_operator_passcode(req.passcode):
        failures, is_locked, lockout_dur = login_rate_limiter.record_failure(client_ip)
        if is_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Locked out for {int(lockout_dur)} seconds.",
                headers={"Retry-After": str(int(lockout_dur))},
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid operator passcode.")

    login_rate_limiter.record_success(client_ip)

    identity_id = "operator_console"
    alias = "Operator Console"
    role = "operator"

    # Generate JWT access token & rotating refresh token
    access_token = create_access_token(identity_id=identity_id, alias=alias, role=role, ttl_minutes=15)
    refresh_token, _ = create_refresh_token(identity_id=identity_id, alias=alias, role=role)

    # Also register in SessionManager for opaque token compatibility
    sm = get_session_manager()
    session = sm.create_session(
        identity_id=identity_id,
        alias=alias,
        fingerprint_hash="op_console_fp",
        role=role,
    )
    sm._tokens[access_token] = session

    return {
        "status": "ok",
        "authenticated": True,
        "token": access_token,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 900,
        "identity_id": session.identity_id,
        "alias": session.alias,
        "role": "operator",
    }


@router.get("/whoami")
async def whoami(user: UserContext = Depends(get_current_user)) -> dict[str, Any]:
    """Return identity and role from session token or JWT header."""
    return {
        "authenticated": user.authenticated,
        "identity_id": user.identity_id if user.authenticated else None,
        "alias": user.alias if user.authenticated else None,
        "role": user.role,
    }


@router.post("/register")
async def register_identity(req: RegisterIdentityRequest, request: Request) -> dict[str, Any]:
    """Register participant alias, compute device fingerprint, and issue secure session token."""
    resolver = get_identity_resolver()

    fingerprint = req.client_fingerprint or extract_fingerprint_from_request(request)
    identity_id = req.device_id or f"id_{uuid.uuid4().hex[:8]}"

    assigned_role = "participant"
    if req.role == "operator" and req.passcode and req.passcode.strip() == OPERATOR_PASSCODE.strip():
        assigned_role = "operator"

    triple, session = resolver.bind_identity(
        identity_id=identity_id,
        alias=req.alias,
        fingerprint_hash=fingerprint,
        role=assigned_role,
    )

    return {
        "status": "registered",
        "identity_id": triple.identity_id,
        "alias": triple.alias,
        "token": session.token,
        "role": session.role,
        "fingerprint": fingerprint,
        "expires_at": session.expires_at_epoch,
    }


@router.post("/validate")
async def validate_session(req: ValidateTokenRequest, request: Request) -> dict[str, Any]:
    """Validate a participant or operator token against active sessions."""
    sm = get_session_manager()
    session = sm.validate_token(req.token)
    if session:
        current_fp = extract_fingerprint_from_request(request)
        fp_match = (current_fp == session.fingerprint_hash)
        return {
            "valid": True,
            "identity_id": session.identity_id,
            "alias": session.alias,
            "fingerprint_match": fp_match,
        }

    # Check JWT access token
    try:
        from app.auth.security import decode_access_token
        claims = decode_access_token(req.token)
        return {
            "valid": True,
            "identity_id": claims.get("sub", "unknown"),
            "alias": claims.get("alias", "User"),
            "fingerprint_match": True,
        }
    except Exception:
        pass

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


@router.get("/list")
async def list_identities() -> list[dict[str, Any]]:
    """List all registered identities and device fingerprints."""
    resolver = get_identity_resolver()
    return resolver.list_identities()
