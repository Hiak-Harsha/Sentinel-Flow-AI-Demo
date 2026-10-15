"""Failing-First Test Suite for Sentinel Flow v2 Role Matrix & Target Model.

Encodes the Authoritative Role & Permission Model:
1. Participant can launch bounded scenarios against the authorized lab target
   when exercise is OPEN and within quota.
2. Operator is strictly BLUE TEAM and receives 403 on attack launch endpoints.
3. Attack endpoints are locked (423 Locked) outside EXERCISE_OPEN phase.
4. Loopback bypass is removed: 127.0.0.1 without operator token cannot access operator controls
   or orchestrator attack routes.
5. Client identity headers (X-Sentinel-Identity, X-Participant-Device) cannot spoof attribution.
6. Participant A cannot inspect Participant B's runs (isolation).
7. Detector inputs contain no ground-truth fields or run-registry dependencies.

This test suite is expected to FAIL on Phase 0 baseline because:
- /api/v1/red/* endpoints do not exist yet (Phase 2)
- Operator can currently launch attacks on /api/v1/orchestrator/runs and /api/orchestrator/run (Phase 3)
- Loopback IP bypass exists in verify_operator_access (Phase 1)
- Reverse proxy currently falls back to trusting unverified headers (Phase 1)
"""

from __future__ import annotations

import inspect
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth.security import create_access_token


@pytest.fixture(autouse=True)
def clean_run_manager():
    from app.orchestrator.routes import get_run_manager
    try:
        rm = get_run_manager()
        rm._runs.clear()
    except Exception:
        pass
    yield


@pytest.fixture
def participant_token() -> str:
    return create_access_token(
        identity_id="pt_role_matrix_maya",
        alias="Maya",
        role="participant",
        extra_claims={"session_id": "session_test_01"},
    )


@pytest.fixture
def other_participant_token() -> str:
    return create_access_token(
        identity_id="pt_alex_02",
        alias="Alex",
        role="participant",
        extra_claims={"session_id": "session_test_01"},
    )


@pytest.fixture
def operator_token() -> str:
    return create_access_token(
        identity_id="op_lead_01",
        alias="SOC Lead",
        role="operator",
        extra_claims={"session_id": "session_test_01"},
    )


@pytest.fixture
def admin_token() -> str:
    return create_access_token(
        identity_id="admin_01",
        alias="Admin",
        role="admin",
        extra_claims={"session_id": "session_test_01"},
    )


# ============================================================================
# 1. Participant Intrusion Capabilities (Phase 2 Target)
# ============================================================================

def test_participant_can_launch_scenario_when_exercise_open(participant_token: str):
    """Participant should be able to launch a bounded scenario via /api/v1/red/runs
    when the exercise phase is EXERCISE_OPEN.
    """
    with TestClient(app) as client:
        op_token = create_access_token(identity_id="op_admin", alias="Admin", role="operator")
        client.post(
            "/api/v1/operator/session/phase",
            headers={"Authorization": f"Bearer {op_token}"},
            json={"phase": "EXERCISE_OPEN"},
        )
        headers = {"Authorization": f"Bearer {participant_token}"}
        resp = client.post(
            "/api/v1/red/runs",
            headers=headers,
            json={"scenario": "credential_stuffing"},
        )
        # Target v2: returns 200 or 201 with run_id and participant attribution
        assert resp.status_code in (200, 201), (
            f"Expected 200/201 for participant launch, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "run_id" in data
        assert data.get("participant_identity_id") == "pt_role_matrix_maya"


def test_participant_cannot_launch_attacks_when_phase_locked(participant_token: str):
    """When the session phase is LOBBY, BASELINE, DEBRIEF, or CLOSED, attack requests
    must be rejected with HTTP 423 Locked.
    """
    with TestClient(app) as client:
        op_token = create_access_token(identity_id="op_admin", alias="Admin", role="operator")
        client.post(
            "/api/v1/operator/session/phase",
            headers={"Authorization": f"Bearer {op_token}"},
            json={"phase": "LOBBY"},
        )
        headers = {"Authorization": f"Bearer {participant_token}"}
        resp = client.post(
            "/api/v1/red/runs",
            headers=headers,
            json={"scenario": "credential_stuffing"},
        )
        assert resp.status_code == 423, (
            f"Expected 423 Locked when phase is not EXERCISE_OPEN, got {resp.status_code}"
        )


# ============================================================================
# 2. Operator Console Is Strictly Blue Team (No Attack Launching)
# ============================================================================

def test_operator_forbidden_from_launching_participant_attacks(operator_token: str):
    """Operator token must receive 403 Forbidden if attempting to call participant red routes.

    Expected to fail in Phase 0 because /api/v1/red/runs returns 404 instead of 403.
    """
    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {operator_token}"}
        resp = client.post(
            "/api/v1/red/runs",
            headers=headers,
            json={"scenario": "credential_stuffing"},
        )
        assert resp.status_code == 403, (
            f"Operator must receive 403 Forbidden on red routes, got {resp.status_code}"
        )


def test_operator_cannot_launch_attacks_via_orchestrator(operator_token: str):
    """In target v2 (Phase 3), the operator cannot launch attacks via orchestrator.

    Currently in baseline, operator is allowed to launch attacks (returns 200/201).
    This test asserts the target rule (operator must receive 403/404/405).
    Expected to fail in Phase 0 baseline because orchestrator currently allows operator launches.
    """
    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {operator_token}"}
        resp = client.post(
            "/api/v1/orchestrator/runs",
            headers=headers,
            json={"scenario": "credential_stuffing", "target_url": "http://127.0.0.1:8000"},
        )
        assert resp.status_code in (403, 404, 405), (
            f"Operator should not be allowed to launch attack runs, got {resp.status_code}"
        )


# ============================================================================
# 3. Elimination of Loopback Bypass & Identity Spoofing
# ============================================================================

def test_loopback_client_without_operator_token_is_rejected():
    """Unauthenticated requests from 127.0.0.1 must NOT receive operator privileges.

    Currently in baseline, verify_operator_access() has a loopback bypass allowing
    loopback requests without tokens to launch attacks via /api/orchestrator/run.
    Expected to fail in Phase 0 baseline because the loopback bypass is still active.
    """
    with TestClient(app, base_url="http://127.0.0.1") as client:
        # Calling orchestrator attack route without any token from loopback
        resp = client.post(
            "/api/orchestrator/run",
            json={"scenario": "credential_stuffing"},
        )
        # Target v2 requires authentication token; loopback without token must be 401 or 403
        assert resp.status_code in (401, 403), (
            f"Expected 401/403 for unauthenticated loopback request, got {resp.status_code}"
        )


def test_client_supplied_identity_header_spoofing_prevented():
    """Inbound X-Sentinel-Identity and X-Participant-Device headers from clients

    must be ignored when resolving identity. Unauthenticated requests must not
    be granted participant or operator access.
    Expected to fail in Phase 0 because red routes are not yet mounted (returns 404).
    """
    with TestClient(app) as client:
        headers = {
            "X-Sentinel-Identity": "operator_admin_spoof",
            "X-Participant-Device": "spoofed_device_999",
        }
        # Attempt to access a protected participant attack route
        resp = client.post(
            "/api/v1/red/runs",
            headers=headers,
            json={"scenario": "port_scan"},
        )
        assert resp.status_code == 401, (
            f"Expected 401 Unauthorized when forging identity headers, got {resp.status_code}"
        )


# ============================================================================
# 4. Participant Isolation
# ============================================================================

def test_participant_cannot_read_other_participant_runs(other_participant_token: str):
    """Participant A must receive 403 Forbidden when attempting to view Participant B's run.

    Expected to fail in Phase 0 because red endpoints return 404 instead of 403.
    """
    with TestClient(app) as client:
        headers_b = {"Authorization": f"Bearer {other_participant_token}"}
        resp = client.get("/api/v1/red/runs/run_maya_12345", headers=headers_b)
        assert resp.status_code == 403, (
            f"Expected 403 Forbidden for accessing another participant's run, got {resp.status_code}"
        )


# ============================================================================
# 5. Detector Isolation (No Ground-Truth Leakage)
# ============================================================================

def test_detector_has_no_dependency_on_run_registry():
    """Verify architectural isolation: detection modules must not import or depend

    on run_registry, orchestrator drivers, or ground truth tables.
    """
    import app.detection.rule_correlator as rule_correlator
    import app.detection.unsupervised_model as unsupervised_model

    for mod in [rule_correlator, unsupervised_model]:
        src = inspect.getsource(mod)
        assert "run_registry" not in src, f"{mod.__name__} references run_registry!"
        assert "app.orchestrator.run_manager" not in src, (
            f"{mod.__name__} references run_manager!"
        )
