"""Role-Based Access Control (RBAC) dependencies for FastAPI endpoints."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.security import decode_access_token

logger = logging.getLogger("sentinel_flow.auth.dependencies")

# Roles hierarchy
ROLE_RANKS: dict[str, int] = {
    "anonymous": 0,
    "participant": 1,
    "analyst": 2,
    "operator": 3,
    "admin": 4,
}

_http_bearer = HTTPBearer(auto_error=False)


@dataclass
class UserContext:
    """Authenticated user context carrying identity attributes and security role."""

    identity_id: str
    alias: str
    role: str
    authenticated: bool = True
    token_type: str = "jwt"

    def has_role(self, minimum_role: str) -> bool:
        user_rank = ROLE_RANKS.get(self.role, 0)
        min_rank = ROLE_RANKS.get(minimum_role, 99)
        return user_rank >= min_rank


async def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_http_bearer),
) -> UserContext:
    """Extract and validate authentication token from Bearer header, X-Identity-Token, or cookie.
    
    Returns an authenticated UserContext if valid, or an anonymous UserContext if missing.
    Raises HTTPException(401) on malformed or expired tokens.
    """
    raw_token: str | None = None

    if creds and creds.credentials:
        raw_token = creds.credentials.strip()
    elif "X-Identity-Token" in request.headers:
        raw_token = request.headers["X-Identity-Token"].strip()
    elif "Authorization" in request.headers:
        auth_header = request.headers["Authorization"].strip()
        if auth_header.startswith("Bearer "):
            raw_token = auth_header[7:].strip()
        else:
            raw_token = auth_header

    if not raw_token:
        return UserContext(
            identity_id="anonymous",
            alias="Anonymous",
            role="anonymous",
            authenticated=False,
            token_type="none",
        )

    # 1. Try decoding as JWT access token first
    try:
        claims = decode_access_token(raw_token)
        return UserContext(
            identity_id=claims.get("sub", "unknown"),
            alias=claims.get("alias", claims.get("sub", "User")),
            role=claims.get("role", "participant"),
            authenticated=True,
            token_type="jwt",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired. Please refresh or re-authenticate.",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\", error_description=\"token expired\""},
        )
    except jwt.PyJWTError:
        # Not a valid JWT; check if it is a registered in-memory or DB session token
        pass

    # 2. Check session manager for backwards compatibility with session tokens (e.g. participant tokens)
    try:
        from app.identity.routes import get_session_manager

        sm = get_session_manager()
        session = sm.validate_token(raw_token)
        if session and session.is_valid:
            return UserContext(
                identity_id=session.identity_id,
                alias=session.alias,
                role=session.role,
                authenticated=True,
                token_type="opaque",
            )
    except Exception:
        pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or unverified authentication token.",
        headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
    )


def require_authenticated() -> Callable[[UserContext], UserContext]:
    """Dependency that ensures the request is authenticated with any valid role."""

    async def _checker(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not user.authenticated or user.role == "anonymous":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to access this resource.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user

    return _checker


def require_roles(allowed_roles: list[str]) -> Callable[[UserContext], UserContext]:
    """Dependency enforcing role-based authorization against a list of permitted roles.
    
    Always permits 'admin'.
    Returns 401 if unauthenticated.
    Returns 403 if role is insufficient.
    """

    async def _role_checker(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not user.authenticated or user.role == "anonymous":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to access this resource.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if user.role != "admin" and user.role not in allowed_roles:
            logger.warning(
                "Access denied for user %s (role: %s); requires one of %s",
                user.identity_id,
                user.role,
                allowed_roles,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Role '{user.role}' lacks sufficient privileges for this operation.",
            )

        return user

    return _role_checker
