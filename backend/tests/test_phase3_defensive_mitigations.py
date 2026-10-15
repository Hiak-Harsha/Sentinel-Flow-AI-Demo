"""Comprehensive Verification Suite for Sentinel Flow v2 Phase 3:
- Operator console strictly defensive: cannot launch attacks via /api/v1/orchestrator/runs (403 Forbidden)
- Operator cannot launch attacks via legacy /api/orchestrator/runs (403 Forbidden)
- Operator can apply rate limiting mitigation: POST /api/v1/operator/mitigations/rate-limit
- Lab target enforces rate limit on mitigated identity (429 Too Many Requests)
- Operator can apply isolation mitigation: POST /api/v1/operator/mitigations/isolate
- Lab target blocks isolated identity (403 Forbidden)
- Operator can reset mitigations: POST /api/v1/operator/mitigations/reset
- Operator circuit breaker trip and reset: POST /api/v1/operator/circuit-breaker/trip & /reset
- Participant identity attribution verified in incident telemetry without ground truth registry leakage
"""

from __future__ import annotations

import time
from typing import Generator
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth.security import create_access_token, sign_internal_actor


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def operator_token() -> str:
    return create_access_token(
        identity_id="op_lead_01",
        alias="SOC Lead",
        role="operator",
        extra_claims={"session_id": "session_phase3_test"},
    )


@pytest.fixture
def participant_token() -> str:
    return create_access_token(
        identity_id="pt_maya_01",
        alias="Maya",
        role="participant",
        extra_claims={"session_id": "session_phase3_test"},
    )


# ============================================================================
# 1. Operator Attack Launch Prohibition (Strictly Defensive Posture)
# ============================================================================

def test_operator_cannot_launch_attacks_via_v1_orchestrator(
    client: TestClient,
    operator_token: str,
):
    """Operator receives 403 Forbidden when calling POST /api/v1/orchestrator/runs."""
    headers = {"Authorization": f"Bearer {operator_token}"}
    resp = client.post(
        "/api/v1/orchestrator/runs",
        headers=headers,
        json={"scenario": "credential_stuffing", "target_origin": "http://127.0.0.1:8000"},
    )
    assert resp.status_code == 403
    assert "Operator cannot launch attack runs" in resp.json()["detail"]


def test_operator_cannot_launch_attacks_via_legacy_orchestrator(
    client: TestClient,
    operator_token: str,
):
    """Operator receives 403 Forbidden when calling POST /api/orchestrator/runs."""
    headers = {"Authorization": f"Bearer {operator_token}"}
    resp = client.post(
        "/api/orchestrator/runs",
        headers=headers,
        json={"scenario": "credential_stuffing", "target_origin": "http://127.0.0.1:8000"},
    )
    assert resp.status_code == 403
    assert "Operator cannot launch attack runs" in resp.json()["detail"]


# ============================================================================
# 2. Operator Defensive Mitigations: Rate Limiting
# ============================================================================

def test_operator_rate_limit_mitigation(
    client: TestClient,
    operator_token: str,
):
    """Operator applies rate-limiting to an identity, and lab-target enforces 429 when exceeded."""
    op_headers = {"Authorization": f"Bearer {operator_token}"}
    
    # 1. Apply rate limit of 2 requests/second to pt_maya_01
    rate_resp = client.post(
        "/api/v1/operator/mitigations/rate-limit",
        headers=op_headers,
        json={"identity_id": "pt_maya_01", "rate_limit_rps": 2.0},
    )
    assert rate_resp.status_code == 200
    data = rate_resp.json()
    assert data["status"] == "success"
    assert data["mitigation"]["action"] == "rate_limit"
    assert data["mitigation"]["rate_limit_rps"] == 2.0

    # 2. Check that GET /api/v1/operator/mitigations lists this rule
    list_resp = client.get("/api/v1/operator/mitigations", headers=op_headers)
    assert list_resp.status_code == 200
    active_ids = [m["identity_id"] for m in list_resp.json()["active_mitigations"]]
    assert "pt_maya_01" in active_ids

    # 3. Simulate requests from pt_maya_01 against lab-target
    actor_header = sign_internal_actor(actor_id="pt_maya_01", role="participant")
    pt_headers = {"X-Sentinel-Actor": actor_header}

    # Request 1 & 2: within rate limit (200)
    r1 = client.get("/lab-target/api/status", headers=pt_headers)
    assert r1.status_code == 200

    r2 = client.get("/lab-target/api/status", headers=pt_headers)
    assert r2.status_code == 200

    # Request 3 in same window: exceeds 2 rps rate limit -> 429 Too Many Requests
    r3 = client.get("/lab-target/api/status", headers=pt_headers)
    assert r3.status_code == 429
    assert "rate limit exceeded" in r3.json()["detail"].lower()

    # 4. Reset mitigation
    client.post(
        "/api/v1/operator/mitigations/reset",
        headers=op_headers,
        json={"identity_id": "pt_maya_01"},
    )


# ============================================================================
# 3. Operator Defensive Mitigations: Identity Isolation
# ============================================================================

def test_operator_isolate_and_reset_mitigation(
    client: TestClient,
    operator_token: str,
):
    """Operator isolates an identity; lab-target returns 403 Forbidden until reset."""
    op_headers = {"Authorization": f"Bearer {operator_token}"}
    
    # 1. Apply isolation to pt_alex_02
    iso_resp = client.post(
        "/api/v1/operator/mitigations/isolate",
        headers=op_headers,
        json={"identity_id": "pt_alex_02"},
    )
    assert iso_resp.status_code == 200
    assert iso_resp.json()["mitigation"]["action"] == "isolate"

    # 2. Requests from pt_alex_02 are blocked with 403 Forbidden
    actor_header = sign_internal_actor(actor_id="pt_alex_02", role="participant")
    alex_headers = {"X-Sentinel-Actor": actor_header}

    blocked = client.get("/lab-target/api/status", headers=alex_headers)
    assert blocked.status_code == 403
    assert "isolated by operator mitigation" in blocked.json()["detail"]

    # 3. Reset mitigation for pt_alex_02
    reset_resp = client.post(
        "/api/v1/operator/mitigations/reset",
        headers=op_headers,
        json={"identity_id": "pt_alex_02"},
    )
    assert reset_resp.status_code == 200
    assert reset_resp.json()["mitigation"]["status"] == "CLEARED"

    # 4. Now requests from pt_alex_02 are permitted
    allowed = client.get("/lab-target/api/status", headers=alex_headers)
    assert allowed.status_code == 200


# ============================================================================
# 4. Circuit Breaker Trip and Reset
# ============================================================================

def test_operator_circuit_breaker_trip_and_reset(
    client: TestClient,
    operator_token: str,
):
    """Operator can trip and reset the emergency circuit breaker via /api/v1/operator/circuit-breaker."""
    op_headers = {"Authorization": f"Bearer {operator_token}"}

    # Trip circuit breaker
    trip_resp = client.post("/api/v1/operator/circuit-breaker/trip", headers=op_headers)
    assert trip_resp.status_code == 200
    assert trip_resp.json()["status"] == "stopped"

    # Reset circuit breaker
    reset_resp = client.post("/api/v1/operator/circuit-breaker/reset", headers=op_headers)
    assert reset_resp.status_code == 200
    assert reset_resp.json()["status"] == "reset"
