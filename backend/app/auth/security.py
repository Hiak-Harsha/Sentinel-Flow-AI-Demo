"""Argon2 password hashing, JWT token lifecycle, rotating refresh tokens, and rate-limiting lockout."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError

from app.config import (
    DEFAULT_OPERATOR_PASSCODE,
    OPERATOR_PASSCODE,
    OPERATOR_SECRET_KEY,
    settings,
)

logger = logging.getLogger("sentinel_flow.auth.security")

# Initialize Argon2 Password Hasher
# Using standard OWASP recommended memory and time cost parameters
_hasher = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)

# Cached operator Argon2 hash
_OPERATOR_ARGON2_HASH: str | None = os.getenv("SENTINEL_OPERATOR_ARGON2_HASH")
if not _OPERATOR_ARGON2_HASH:
    _OPERATOR_ARGON2_HASH = _hasher.hash(OPERATOR_PASSCODE.strip())


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password or passcode using Argon2id."""
    return _hasher.hash(plain_password)


def verify_password(hash_val: str, plain_password: str) -> bool:
    """Verify plaintext against an Argon2id hash."""
    try:
        return _hasher.verify(hash_val, plain_password)
    except (VerifyMismatchError, VerificationError):
        return False


def verify_operator_passcode(passcode: str) -> bool:
    """Verify operator passcode using Argon2 or secret key fallback."""
    clean = passcode.strip()
    if not clean:
        return False

    # Production safety check
    if settings.is_production and clean == DEFAULT_OPERATOR_PASSCODE:
        logger.warning("Rejected login with default operator passcode in production environment")
        return False

    # Check Argon2 hash of operator passcode
    if _OPERATOR_ARGON2_HASH and verify_password(_OPERATOR_ARGON2_HASH, clean):
        return True

    # Check operator secret key fallback
    if OPERATOR_SECRET_KEY and clean == OPERATOR_SECRET_KEY.strip():
        return True

    return False


# ============================================================================
# JWT Access Token Management (HS256)
# ============================================================================

JWT_ALGORITHM = "HS256"
JWT_DEFAULT_TTL_MINUTES = 15


def create_access_token(
    *,
    identity_id: str,
    alias: str,
    role: str = "participant",
    ttl_minutes: int = JWT_DEFAULT_TTL_MINUTES,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Generate a signed, short-lived JWT access token."""
    now = int(time.time())
    payload = {
        "sub": identity_id,
        "alias": alias,
        "role": role,
        "jti": uuid4().hex,
        "iat": now,
        "exp": now + (ttl_minutes * 60),
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, OPERATOR_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Verify signature and return decoded claims from JWT access token.
    
    Raises jwt.PyJWTError on invalid, tampered, or expired tokens.
    """
    return jwt.decode(
        token,
        OPERATOR_SECRET_KEY,
        algorithms=[JWT_ALGORITHM],
        options={"require": ["exp", "sub", "role"]},
    )


# ============================================================================
# Rotating Refresh Token Management
# ============================================================================

@dataclass
class RefreshTokenRecord:
    """Stored representation of a refresh token (hashed at rest)."""

    token_hash: str
    identity_id: str
    alias: str
    role: str
    expires_at_epoch: float
    created_at_epoch: float = field(default_factory=time.time)
    revoked_at_epoch: float | None = None

    @property
    def is_active(self) -> bool:
        return self.revoked_at_epoch is None and time.time() < self.expires_at_epoch


class RefreshTokenStore:
    """In-memory thread-safe store for rotating refresh tokens hashed at rest."""

    def __init__(self) -> None:
        self._tokens_by_hash: dict[str, RefreshTokenRecord] = {}

    def _hash_token(self, raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    def create(
        self,
        *,
        identity_id: str,
        alias: str,
        role: str,
        ttl_days: int = 7,
    ) -> tuple[str, RefreshTokenRecord]:
        """Create a new raw refresh token, storing its SHA-256 hash at rest."""
        raw_token = f"sfr_{secrets.token_urlsafe(32)}"
        token_hash = self._hash_token(raw_token)
        now = time.time()
        record = RefreshTokenRecord(
            token_hash=token_hash,
            identity_id=identity_id,
            alias=alias,
            role=role,
            expires_at_epoch=now + (ttl_days * 86400),
            created_at_epoch=now,
        )
        self._tokens_by_hash[token_hash] = record
        return raw_token, record

    def rotate(self, raw_token: str) -> tuple[str, str, str, str]:
        """Rotate refresh token: invalidate old token, issue new access token and new refresh token.
        
        Returns: (new_access_token, new_refresh_token, identity_id, role)
        Raises: ValueError if token is expired, revoked, or not found.
        """
        token_hash = self._hash_token(raw_token)
        record = self._tokens_by_hash.get(token_hash)

        if not record:
            raise ValueError("Invalid refresh token")

        if record.revoked_at_epoch is not None:
            # Token reuse detected! Potential breach attempt - revoke all for this identity
            logger.warning("Refresh token reuse detected for identity %s; possible replay attack", record.identity_id)
            self.revoke_all_for_identity(record.identity_id)
            raise ValueError("Refresh token has already been used and revoked")

        if time.time() >= record.expires_at_epoch:
            raise ValueError("Refresh token expired")

        # Invalidate the old refresh token
        record.revoked_at_epoch = time.time()

        # Issue new pair
        new_refresh, new_record = self.create(
            identity_id=record.identity_id,
            alias=record.alias,
            role=record.role,
        )
        new_access = create_access_token(
            identity_id=record.identity_id,
            alias=record.alias,
            role=record.role,
        )

        return new_access, new_refresh, record.identity_id, record.role

    def revoke(self, raw_token: str) -> bool:
        """Revoke a specific refresh token."""
        token_hash = self._hash_token(raw_token)
        record = self._tokens_by_hash.get(token_hash)
        if record and record.revoked_at_epoch is None:
            record.revoked_at_epoch = time.time()
            return True
        return False

    def revoke_all_for_identity(self, identity_id: str) -> int:
        """Revoke all active refresh tokens for an identity."""
        count = 0
        now = time.time()
        for record in self._tokens_by_hash.values():
            if record.identity_id == identity_id and record.revoked_at_epoch is None:
                record.revoked_at_epoch = now
                count += 1
        return count


_refresh_token_store = RefreshTokenStore()


def create_refresh_token(
    *,
    identity_id: str,
    alias: str,
    role: str = "participant",
    ttl_days: int = 7,
) -> tuple[str, RefreshTokenRecord]:
    return _refresh_token_store.create(
        identity_id=identity_id,
        alias=alias,
        role=role,
        ttl_days=ttl_days,
    )


def rotate_refresh_token(raw_refresh_token: str) -> tuple[str, str, str, str]:
    return _refresh_token_store.rotate(raw_refresh_token)


def revoke_refresh_token(raw_refresh_token: str) -> bool:
    return _refresh_token_store.revoke(raw_refresh_token)


# ============================================================================
# Login Rate Limiting & Account Lockout
# ============================================================================

@dataclass
class FailureTracker:
    failures: int = 0
    lockout_until_epoch: float = 0.0
    last_failure_epoch: float = 0.0


class LoginRateLimiter:
    """Sliding-window rate limiter with progressive lockout for authentication endpoints."""

    def __init__(self, max_failures: int = 5, lockout_seconds: float = 60.0) -> None:
        self.max_failures = max_failures
        self.lockout_seconds = lockout_seconds
        self._trackers: dict[str, FailureTracker] = {}

    def check(self, client_ip: str) -> tuple[bool, float]:
        """Check if client_ip is currently locked out.
        
        Returns: (is_allowed: bool, remaining_seconds: float)
        """
        tracker = self._trackers.get(client_ip)
        if not tracker:
            return True, 0.0

        now = time.time()
        if tracker.lockout_until_epoch > now:
            remaining = tracker.lockout_until_epoch - now
            return False, round(remaining, 1)

        # Reset if window expired (e.g. 10 minutes without attempts)
        if now - tracker.last_failure_epoch > 600.0:
            del self._trackers[client_ip]

        return True, 0.0

    def record_failure(self, client_ip: str) -> tuple[int, bool, float]:
        """Record an authentication failure.
        
        Returns: (failures_count, is_now_locked_out, lockout_duration)
        """
        now = time.time()
        tracker = self._trackers.setdefault(client_ip, FailureTracker())
        tracker.failures += 1
        tracker.last_failure_epoch = now

        if tracker.failures >= self.max_failures:
            tracker.lockout_until_epoch = now + self.lockout_seconds
            logger.warning(
                "IP %s exceeded maximum authentication attempts (%d); locked out for %ds",
                client_ip,
                tracker.failures,
                self.lockout_seconds,
            )
            return tracker.failures, True, self.lockout_seconds

        return tracker.failures, False, 0.0

    def record_success(self, client_ip: str) -> None:
        """Reset failures counter upon successful authentication."""
        self._trackers.pop(client_ip, None)


login_rate_limiter = LoginRateLimiter(max_failures=5, lockout_seconds=60.0)


# ============================================================================
# Signed Internal Actor Header & Run Token Functions (Phase 1 & 2)
# ============================================================================

def sign_internal_actor(
    *,
    actor_id: str,
    role: str = "participant",
    session_id: str | None = None,
    run_id: str | None = None,
) -> str:
    """Create an HMAC-SHA256 signed internal actor token for proxy -> target forwarding.
    
    Format: base64url(json_payload).hmac_signature
    """
    now = int(time.time())
    payload_dict = {
        "act": actor_id,
        "rol": role,
        "sid": session_id or "",
        "rid": run_id or "",
        "iat": now,
        "nonce": secrets.token_hex(8),
    }
    payload_json = json.dumps(payload_dict, separators=(",", ":")).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_json).decode("ascii").rstrip("=")

    secret = settings.internal_hmac_secret.encode("utf-8")
    sig = hmac.new(secret, payload_b64.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def verify_internal_actor(signed_header: str | None) -> dict[str, Any] | None:
    """Verify HMAC signature and freshness of an internal actor header.
    
    Returns payload dict if valid and within 300s clock skew window, or None if invalid/expired.
    """
    if not signed_header or "." not in signed_header:
        return None
    try:
        payload_b64, sig = signed_header.strip().split(".", 1)
        secret = settings.internal_hmac_secret.encode("utf-8")
        expected_sig = hmac.new(secret, payload_b64.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None

        # Add padding back for base64 decode
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload_bytes = base64.urlsafe_b64decode(padded.encode("ascii"))
        payload = json.loads(payload_bytes.decode("utf-8"))

        # Check freshness (max 300 seconds)
        iat = payload.get("iat", 0)
        if abs(time.time() - iat) > 300:
            return None

        return {
            "actor_id": payload.get("act", "unknown"),
            "role": payload.get("rol", "participant"),
            "session_id": payload.get("sid") or None,
            "run_id": payload.get("rid") or None,
        }
    except Exception:
        return None


def mint_run_token(run_id: str, participant_identity_id: str, ttl_seconds: int = 120) -> str:
    """Generate a short-lived token binding an attack run to an authenticated participant."""
    now = int(time.time())
    payload = {
        "rid": run_id,
        "sub": participant_identity_id,
        "iat": now,
        "exp": now + ttl_seconds,
        "typ": "run_token",
    }
    return jwt.encode(payload, settings.operator_secret, algorithm="HS256")


def verify_run_token(token: str | None, run_id: str) -> str | None:
    """Validate a run token against the requested run_id. Returns participant_identity_id or None."""
    if not token:
        return None
    try:
        claims = jwt.decode(token.strip(), settings.operator_secret, algorithms=["HS256"])
        if claims.get("typ") != "run_token":
            return None
        if claims.get("rid") != run_id:
            return None
        return claims.get("sub")
    except Exception:
        return None

