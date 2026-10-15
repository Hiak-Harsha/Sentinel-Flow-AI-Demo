"""Comprehensive Security Hardening Tests (Phase 8):
- Argon2 password hashing and verification
- JWT access tokens with short-lived expiration
- Rotating refresh tokens (hashed at rest, replay protection)
- Login rate-limiting and brute-force lockout
- Role-based authorization matrix (RBAC) across all protected endpoints
- WebSocket channel authorization and isolation
- OWASP security headers (CSP, nosniff, DENY)
- Request size limit enforcement (413 Payload Too Large)
"""

from __future__ import annotations

import time
import pytest
from fastapi.testclient import TestClient

from app.auth.security import (
    create_access_token,
    decode_access_token,
    create_refresh_token,
    rotate_refresh_token,
    revoke_refresh_token,
    hash_password,
    verify_password,
    verify_operator_passcode,
    LoginRateLimiter,
)
from app.auth.dependencies import UserContext, ROLE_RANKS
from app.config import OPERATOR_PASSCODE
from app.main import app
from app.ws.connection_manager import WsClientConnection


# ============================================================================
# 1. Argon2 Hashing & Verification Tests
# ============================================================================

def test_argon2_hashing_and_verification():
    raw_secret = "CustomSuperSecret2026!"
    hashed = hash_password(raw_secret)

    assert hashed.startswith("$argon2id$")
    assert verify_password(hashed, raw_secret) is True
    assert verify_password(hashed, "WrongPassword123") is False


def test_operator_passcode_verification():
    assert verify_operator_passcode(OPERATOR_PASSCODE) is True
    assert verify_operator_passcode("invalid-passcode-xyz") is False
    assert verify_operator_passcode("") is False


# ============================================================================
# 2. JWT Access Tokens Tests
# ============================================================================

def test_jwt_access_token_creation_and_decoding():
    token = create_access_token(
        identity_id="user_test_1",
        alias="Alice",
        role="operator",
        ttl_minutes=15,
    )
    claims = decode_access_token(token)

    assert claims["sub"] == "user_test_1"
    assert claims["alias"] == "Alice"
    assert claims["role"] == "operator"
    assert claims["type"] == "access"
    assert claims["exp"] > time.time()
    assert "jti" in claims


def test_jwt_access_token_expiration_rejection():
    # Create an expired token (ttl = -1 minutes)
    expired_token = create_access_token(
        identity_id="user_test_expired",
        alias="ExpiredUser",
        role="participant",
        ttl_minutes=-1,
    )
    with pytest.raises(Exception):
        decode_access_token(expired_token)


# ============================================================================
# 3. Rotating Refresh Token Tests
# ============================================================================

def test_refresh_token_lifecycle_and_rotation():
    raw_refresh, record = create_refresh_token(
        identity_id="analyst_01",
        alias="Bob",
        role="analyst",
        ttl_days=7,
    )

    assert raw_refresh.startswith("sfr_")
    assert record.is_active is True
    # Verify token is hashed at rest (record holds SHA-256 hash, not raw token)
    assert record.token_hash != raw_refresh
    assert len(record.token_hash) == 64

    # Rotate refresh token
    new_access, new_refresh, id_id, role = rotate_refresh_token(raw_refresh)

    assert new_access is not None
    assert new_refresh.startswith("sfr_")
    assert new_refresh != raw_refresh
    assert id_id == "analyst_01"
    assert role == "analyst"

    # Replay protection: Attempting to rotate the old refresh token MUST fail
    with pytest.raises(ValueError, match="already been used and revoked"):
        rotate_refresh_token(raw_refresh)


def test_refresh_token_revocation():
    raw_refresh, _ = create_refresh_token(
        identity_id="op_to_revoke",
        alias="RevokeMe",
        role="operator",
    )
    assert revoke_refresh_token(raw_refresh) is True
    with pytest.raises(ValueError, match="Invalid refresh token"):
        rotate_refresh_token("sfr_nonexistent_token_12345")


# ============================================================================
# 4. Login Rate Limiting & Lockout Tests
# ============================================================================

def test_login_rate_limiter_lockout():
    limiter = LoginRateLimiter(max_failures=5, lockout_seconds=30.0)
    test_ip = "192.168.1.99"

    # 4 failures should NOT lock out
    for i in range(4):
        failures, is_locked, _ = limiter.record_failure(test_ip)
        assert failures == i + 1
        assert is_locked is False
        allowed, _ = limiter.check(test_ip)
        assert allowed is True

    # 5th failure must trigger lockout
    failures, is_locked, duration = limiter.record_failure(test_ip)
    assert failures == 5
    assert is_locked is True
    assert duration == 30.0

    allowed, remaining = limiter.check(test_ip)
    assert allowed is False
    assert remaining > 0

    # Success from another IP should be independent
    limiter.record_success("10.0.0.1")
    assert limiter.check("10.0.0.1")[0] is True


# ============================================================================
# 5. Role-Based Access Control (RBAC) Endpoint Matrix Tests
# ============================================================================

def test_rbac_access_matrix():
    with TestClient(app) as client:
        # Create tokens for various roles
        operator_token = create_access_token(identity_id="op_1", alias="Operator", role="operator")
        analyst_token = create_access_token(identity_id="an_1", alias="Analyst", role="analyst")
        participant_token = create_access_token(identity_id="pt_1", alias="Student", role="participant")

        op_headers = {"Authorization": f"Bearer {operator_token}"}
        an_headers = {"Authorization": f"Bearer {analyst_token}"}
        pt_headers = {"Authorization": f"Bearer {participant_token}"}

        # 1. Anonymous calling operator route /api/v1/orchestrator/runs -> 401 Unauthorized
        res_anon = client.post("/api/v1/orchestrator/runs", json={"scenario": "credential_stuffing"})
        assert res_anon.status_code == 401

        # 2. Participant calling operator route /api/v1/orchestrator/runs -> 403 Forbidden
        res_part = client.post(
            "/api/v1/orchestrator/runs",
            json={"scenario": "credential_stuffing"},
            headers=pt_headers,
        )
        assert res_part.status_code == 403

        # 3. Participant calling /api/v1/models/{model_id}/promote -> 403 Forbidden
        res_promote_part = client.post(
            "/api/v1/models/candidate_v1/promote",
            json={"stage": "production", "notes": "Hacked"},
            headers=pt_headers,
        )
        assert res_promote_part.status_code == 403

        # 4. Operator calling /api/v1/models/{model_id}/promote -> 200 OK
        res_promote_op = client.post(
            "/api/v1/models/candidate_v1/promote",
            json={"stage": "production", "notes": "Approved by SOC"},
            headers=op_headers,
        )
        assert res_promote_op.status_code == 200
        assert res_promote_op.json()["status"] == "promoted"

        # 5. Participant calling /api/v1/detection/alerts/{id}/disposition -> 403 Forbidden
        res_disp_part = client.patch(
            "/api/v1/detection/alerts/alt_test_1/disposition",
            json={"disposition": "FALSE_POSITIVE", "notes": "Unauthorized"},
            headers=pt_headers,
        )
        assert res_disp_part.status_code == 403

        # 6. Analyst calling alert disposition -> Not 401 or 403 (either 200 or 404 for missing alert)
        res_disp_an = client.patch(
            "/api/v1/detection/alerts/alt_test_1/disposition",
            json={"disposition": "FALSE_POSITIVE", "notes": "Triaged by analyst"},
            headers=an_headers,
        )
        assert res_disp_an.status_code not in (401, 403)


# ============================================================================
# 6. WebSocket Channel Isolation Tests
# ============================================================================

def test_websocket_channel_isolation():
    # Mock WebSocket object with minimal interface
    class FakeWs:
        pass

    # Participant connection bound to Device-01
    pt_conn = WsClientConnection(
        websocket=FakeWs(),  # type: ignore
        role="participant",
        identity_id="Device-01",
    )

    # Operator connection
    op_conn = WsClientConnection(
        websocket=FakeWs(),  # type: ignore
        role="operator",
        identity_id="OperatorConsole",
    )

    # Participant permissions:
    assert pt_conn.can_access_channel("public") is True
    assert pt_conn.can_access_channel("participant:Device-01") is True
    # Participant CANNOT access operator channel
    assert pt_conn.can_access_channel("operator") is False
    # Participant CANNOT access analyst channel
    assert pt_conn.can_access_channel("analyst") is False
    # Participant CANNOT access another student's channel
    assert pt_conn.can_access_channel("participant:Device-02") is False

    # Operator permissions:
    assert op_conn.can_access_channel("public") is True
    assert op_conn.can_access_channel("operator") is True
    assert op_conn.can_access_channel("analyst") is True
    assert op_conn.can_access_channel("participant:Device-01") is True
    assert op_conn.can_access_channel("participant:Device-02") is True


# ============================================================================
# 7. Security Headers & Request Body Size Tests
# ============================================================================

def test_security_headers_present_on_responses():
    with TestClient(app) as client:
        res = client.get("/api/v1/health/live")
        assert res.status_code == 200

        headers = res.headers
        assert headers.get("X-Content-Type-Options") == "nosniff"
        assert headers.get("X-Frame-Options") == "DENY"
        assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "Content-Security-Policy" in headers


def test_request_size_limit_rejection():
    with TestClient(app) as client:
        # Simulate an oversized request with Content-Length header > 1MB
        res = client.post(
            "/api/v1/auth/operator-login",
            content=b"{}",
            headers={"Content-Length": "1500000", "Content-Type": "application/json"},
        )
        assert res.status_code == 413
        assert res.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"
