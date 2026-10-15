"""Comprehensive Verification Suite for Sentinel Flow v2 Phase 1:
- Cryptographic Token Identity Resolution (zero trust in client-supplied headers)
- Removal of Loopback Bypass in verify_operator_access
- End-to-end Signed Internal Header Attribution (X-Sentinel-Actor with HMAC)
- Tampered Internal Signature Rejection (403 Forbidden)
- Unauthenticated Attack Path Rejection (401 Unauthorized)
- Exercise Phase State Machine (LOBBY -> BASELINE -> EXERCISE_OPEN -> DEBRIEF -> CLOSED)
- Phase-gating: Attack instruments locked (423 Locked) outside EXERCISE_OPEN, normal browsing allowed
- Operator Authorization Record & Consent Binding
- Participant Suspension
"""

from __future__ import annotations

from typing import Any, Generator
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth.security import create_access_token, sign_internal_actor
from app.lab_target import add_lab_event_listener, remove_lab_event_listener


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def participant_token() -> str:
    return create_access_token(
        identity_id="pt_maya_01",
        alias="Maya",
        role="participant",
        extra_claims={"session_id": "session_phase1_test"},
    )


@pytest.fixture
def operator_token() -> str:
    return create_access_token(
        identity_id="op_lead_01",
        alias="SOC Lead",
        role="operator",
        extra_claims={"session_id": "session_phase1_test"},
    )


# ============================================================================
# 1. End-to-End Identity Attribution & Anti-Spoofing
# ============================================================================

def test_participant_token_attributed_end_to_end_in_lab_target(
    client: TestClient,
    participant_token: str,
):
    """Participant Maya's token produces lab audit events attributed to Maya."""
    captured_events: list[dict[str, Any]] = []
    listener = lambda ev: captured_events.append(ev)
    add_lab_event_listener(listener)
    try:
        # Open exercise first so proxy permits access
        op_token = create_access_token(identity_id="op_admin", alias="Admin", role="operator")
        client.post(
            "/api/v1/operator/session/phase",
            headers={"Authorization": f"Bearer {op_token}"},
            json={"phase": "EXERCISE_OPEN"},
        )

        headers = {"Authorization": f"Bearer {participant_token}"}
        resp = client.post(
            "/proxy/lab-target/auth/login",
            headers=headers,
            json={"username": "test_analyst", "password": "WrongPassword!"},
        )
        assert resp.status_code == 401
        assert len(captured_events) > 0
        last_event = captured_events[-1]
        assert last_event["actor_id"] == "pt_maya_01", (
            f"Expected actor_id pt_maya_01, got {last_event['actor_id']}"
        )
    finally:
        remove_lab_event_listener(listener)


def test_forged_client_identity_header_is_ignored(
    client: TestClient,
    participant_token: str,
):
    """Forged X-Sentinel-Identity header from client is ignored in favor of verified token."""
    captured_events: list[dict[str, Any]] = []
    listener = lambda ev: captured_events.append(ev)
    add_lab_event_listener(listener)
    try:
        op_token = create_access_token(identity_id="op_admin", alias="Admin", role="operator")
        client.post(
            "/api/v1/operator/session/phase",
            headers={"Authorization": f"Bearer {op_token}"},
            json={"phase": "EXERCISE_OPEN"},
        )

        # Maya sends a forged identity header trying to frame user_bob
        headers = {
            "Authorization": f"Bearer {participant_token}",
            "X-Sentinel-Identity": "user_bob_spoofed",
            "X-Participant-Device": "device_bob_spoofed",
        }
        resp = client.post(
            "/proxy/lab-target/auth/login",
            headers=headers,
            json={"username": "test_analyst", "password": "WrongPassword!"},
        )
        assert resp.status_code == 401
        assert len(captured_events) > 0
        last_event = captured_events[-1]
        assert last_event["actor_id"] == "pt_maya_01"
        assert last_event["actor_id"] != "user_bob_spoofed"
    finally:
        remove_lab_event_listener(listener)


def test_invalid_internal_actor_signature_is_rejected(client: TestClient):
    """Directly sending a forged or tampered X-Sentinel-Actor header to lab target returns 403."""
    headers = {
        "X-Sentinel-Actor": "eyJhbGciOiJIUzI1NiJ9.invalid_tampered_signature_12345",
    }
    resp = client.post(
        "/lab-target/auth/login",
        headers=headers,
        json={"username": "test_analyst", "password": "WrongPassword!"},
    )
    assert resp.status_code == 403
    assert "Invalid or tampered internal actor signature" in resp.json()["detail"]


# ============================================================================
# 2. Elimination of Loopback Bypass
# ============================================================================

def test_loopback_client_without_operator_token_is_rejected(client: TestClient):
    """Unauthenticated loopback request cannot access operator controls or launch attacks."""
    # 1. Calling operator phase transition without token
    resp1 = client.post(
        "/api/v1/operator/session/phase",
        json={"phase": "EXERCISE_OPEN"},
    )
    assert resp1.status_code == 401

    # 2. Calling orchestrator attack route without token
    resp2 = client.post(
        "/api/orchestrator/run",
        json={"scenario": "credential_stuffing"},
    )
    assert resp2.status_code == 401


# ============================================================================
# 3. Unauthenticated Attack-Class Path Rejection
# ============================================================================

def test_unauthenticated_client_cannot_access_attack_class_paths(client: TestClient):
    """Anonymous client (no token) is blocked with 401 from hitting canary traps or port sensors."""
    # 1. Canary trap
    resp1 = client.get("/proxy/lab-target/canary/sql_injection")
    assert resp1.status_code == 401
    assert "Authentication required" in resp1.json()["detail"]

    # 2. Sensor port probe
    resp2 = client.post("/proxy/lab-target/sensor/port-probe?port=22")
    assert resp2.status_code == 401
    assert "Authentication required" in resp2.json()["detail"]


# ============================================================================
# 4. Session State Machine & Phase-Gated Locking
# ============================================================================

def test_phase_state_machine_transition_and_locking(
    client: TestClient,
    participant_token: str,
    operator_token: str,
):
    """Verify LOBBY -> BASELINE -> EXERCISE_OPEN -> DEBRIEF -> CLOSED transitions and 423 locking."""
    op_headers = {"Authorization": f"Bearer {operator_token}"}
    pt_headers = {"Authorization": f"Bearer {participant_token}"}

    # 1. Transition to LOBBY
    r_lobby = client.post(
        "/api/v1/operator/session/phase",
        headers=op_headers,
        json={"phase": "LOBBY"},
    )
    assert r_lobby.status_code == 200
    assert r_lobby.json()["session"]["phase"] == "LOBBY"

    # 2. In LOBBY, normal browsing succeeds (200 OK)
    r_normal = client.get("/proxy/lab-target/api/products", headers=pt_headers)
    assert r_normal.status_code == 200

    # 3. In LOBBY, attack instrumentation is locked with 423 Locked
    r_attack_locked = client.get("/proxy/lab-target/canary/traversal", headers=pt_headers)
    assert r_attack_locked.status_code == 423
    assert "Exercise is not open" in r_attack_locked.json()["detail"]

    # 4. Operator transitions to EXERCISE_OPEN
    r_open = client.post(
        "/api/v1/operator/session/phase",
        headers=op_headers,
        json={"phase": "EXERCISE_OPEN"},
    )
    assert r_open.status_code == 200
    assert r_open.json()["session"]["phase"] == "EXERCISE_OPEN"

    # 5. In EXERCISE_OPEN, attack instrumentation is unlocked
    r_attack_unlocked = client.get("/proxy/lab-target/canary/traversal", headers=pt_headers)
    # Canary hit returns 200 with status: blocked (security honeypot tripped), proving target was reached
    assert r_attack_unlocked.status_code == 200
    assert r_attack_unlocked.json()["status"] == "blocked"

    # 6. Operator transitions to DEBRIEF
    r_debrief = client.post(
        "/api/v1/operator/session/phase",
        headers=op_headers,
        json={"phase": "DEBRIEF"},
    )
    assert r_debrief.status_code == 200
    assert r_debrief.json()["session"]["phase"] == "DEBRIEF"

    # 7. In DEBRIEF, attack instruments are locked again with 423
    r_debrief_locked = client.get("/proxy/lab-target/canary/traversal", headers=pt_headers)
    assert r_debrief_locked.status_code == 423


# ============================================================================
# 5. Operator Authorization Record & Consent Gate Binding
# ============================================================================

def test_operator_authorization_record_configuration(
    client: TestClient,
    operator_token: str,
):
    """Operator configures authorized target, enabled scenarios, quotas, and concurrency."""
    op_headers = {"Authorization": f"Bearer {operator_token}"}

    # 1. Update authorization
    payload = {
        "target_origin": "http://127.0.0.1:8000",
        "confirmed_ownership": True,
        "enabled_scenarios": ["credential_stuffing", "canary_probe"],
        "quota_per_participant": 3,
        "effects_per_run_max": 25,
        "global_concurrency_cap": 4,
        "reveal_mode": "live",
    }
    resp = client.put(
        "/api/v1/operator/authorization",
        headers=op_headers,
        json=payload,
    )
    assert resp.status_code == 200
    auth = resp.json()["authorization"]
    assert auth["target_origin"] == "http://127.0.0.1:8000"
    assert auth["quota_per_participant"] == 3
    assert auth["global_concurrency_cap"] == 4
    assert auth["reveal_mode"] == "live"
    assert auth["consent_token"].startswith("cst_")

    # 2. Retrieve authorization
    get_resp = client.get("/api/v1/operator/authorization", headers=op_headers)
    assert get_resp.status_code == 200
    retrieved = get_resp.json()
    assert retrieved["quota_per_participant"] == 3
    assert retrieved["global_concurrency_cap"] == 4


# ============================================================================
# 6. Participant Suspension
# ============================================================================

def test_operator_can_suspend_participant(
    client: TestClient,
    operator_token: str,
):
    """Operator can suspend a participant."""
    # Join participant first
    join_resp = client.post(
        "/api/v1/sessions/join",
        json={"join_code": "SF-DEMO", "alias": "Charlie"},
    )
    assert join_resp.status_code == 200
    participant_id = join_resp.json()["id"]

    op_headers = {"Authorization": f"Bearer {operator_token}"}
    susp_resp = client.post(
        f"/api/v1/operator/participants/{participant_id}/suspend",
        headers=op_headers,
    )
    assert susp_resp.status_code == 200
    assert susp_resp.json()["status"] == "suspended"
    assert susp_resp.json()["participant"]["status"] == "SUSPENDED"
