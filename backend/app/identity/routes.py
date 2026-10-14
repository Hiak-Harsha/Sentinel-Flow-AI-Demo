"""FastAPI router for identity and device registration."""

from __future__ import annotations

import uuid
from typing import Any
from fastapi import APIRouter, HTTPException, Request, Response, status
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


@router.post("/operator-login")
async def operator_login(req: OperatorLoginRequest) -> dict[str, Any]:
    """Verify operator passcode and issue operator session token."""
    if req.passcode.strip() not in (OPERATOR_PASSCODE.strip(), OPERATOR_SECRET_KEY.strip()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid operator passcode.")

    sm = get_session_manager()
    session = sm.create_session(
        identity_id="operator_console",
        alias="Operator Console",
        fingerprint_hash="op_console_fp",
        role="operator",
    )
    return {
        "status": "ok",
        "authenticated": True,
        "token": session.token,
        "identity_id": session.identity_id,
        "alias": session.alias,
        "role": "operator",
    }


@router.get("/whoami")
async def whoami(request: Request) -> dict[str, Any]:
    """Return identity and role from session token header."""
    auth_token = request.headers.get("X-Identity-Token") or request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not auth_token:
        return {"authenticated": False, "identity_id": None, "alias": None, "role": "anonymous"}

    sm = get_session_manager()
    session = sm.validate_token(auth_token)
    if not session:
        return {"authenticated": False, "identity_id": None, "alias": None, "role": "anonymous"}

    return {
        "authenticated": True,
        "identity_id": session.identity_id,
        "alias": session.alias,
        "role": session.role,
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
    """Validate a participant token against active sessions."""
    sm = get_session_manager()
    session = sm.validate_token(req.token)
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    current_fp = extract_fingerprint_from_request(request)
    fp_match = (current_fp == session.fingerprint_hash)

    return {
        "valid": True,
        "identity_id": session.identity_id,
        "alias": session.alias,
        "fingerprint_match": fp_match,
    }


@router.get("/list")
async def list_identities() -> list[dict[str, Any]]:
    """List all registered identities and device fingerprints."""
    resolver = get_identity_resolver()
    return resolver.list_identities()
