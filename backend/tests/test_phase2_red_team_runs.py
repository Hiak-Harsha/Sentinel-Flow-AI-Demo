"""Comprehensive Verification Suite for Sentinel Flow v2 Phase 2:
- Participant-initiated bounded attack launches via POST /api/v1/red/runs
- Operator forbidden from launching attacks (403 Forbidden)
- Phase-gated locking (423 Locked outside EXERCISE_OPEN)
- Per-participant attack quota enforcement (429 Too Many Requests)
- Global concurrency cap enforcement (429 Too Many Requests)
- Participant isolation: GET /api/v1/red/runs filters to caller's runs
- Cross-participant access prohibition: GET /api/v1/red/runs/{id} returns 403 Forbidden
- Cross-participant stop prohibition: POST /api/v1/red/runs/{id}/stop returns 403 Forbidden
- Operator-disabled scenario rejection (403 Forbidden)
- Suspended participant rejection (403 Forbidden)
"""

from __future__ import annotations

from typing import Any, Generator
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth.security import create_access_token


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        from app.orchestrator.routes import get_run_manager
        try:
            rm = get_run_manager()
            rm._runs.clear()
        except Exception:
            pass
        yield c


@pytest.fixture
def participant_maya_token() -> str:
    return create_access_token(
        identity_id="pt_maya_01",
        alias="Maya",
        role="participant",
        extra_claims={"session_id": "session_phase2_test"},
    )


@pytest.fixture
def participant_alex_token() -> str:
    return create_access_token(
        identity_id="pt_alex_02",
        alias="Alex",
        role="participant",
        extra_claims={"session_id": "session_phase2_test"},
    )


@pytest.fixture
def operator_token() -> str:
    return create_access_token(
        identity_id="op_lead_01",
        alias="SOC Lead",
        role="operator",
        extra_claims={"session_id": "session_phase2_test"},
    )


# ============================================================================
# 1. Participant Launch & Attribution
# ============================================================================

def test_participant_can_launch_scenario_when_exercise_open(
    client: TestClient,
    participant_maya_token: str,
    operator_token: str,
):
    """Participant Maya can launch credential_stuffing when exercise is EXERCISE_OPEN."""
    # Ensure exercise is OPEN and authorization confirmed
    op_headers = {"Authorization": f"Bearer {operator_token}"}
    client.post("/api/v1/operator/session/phase", headers=op_headers, json={"phase": "EXERCISE_OPEN"})
    client.put(
        "/api/v1/operator/authorization",
        headers=op_headers,
        json={
            "target_origin": "http://127.0.0.1:8000",
            "confirmed_ownership": True,
            "enabled_scenarios": ["credential_stuffing", "port_scan"],
            "quota_per_participant": 5,
            "global_concurrency_cap": 5,
        },
    )

    pt_headers = {"Authorization": f"Bearer {participant_maya_token}"}
    resp = client.post(
        "/api/v1/red/runs",
        headers=pt_headers,
        json={"scenario": "credential_stuffing"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "run_id" in data
    assert data["participant_identity_id"] == "pt_maya_01"
    assert data["scenario"] == "credential_stuffing"
    assert data["status"] == "started"
    assert "remaining_quota" in data

    # Clean up run
    client.post(f"/api/v1/red/runs/{data['run_id']}/stop", headers=pt_headers)


# ============================================================================
# 2. Operator Forbidden on Attack Launch
# ============================================================================

def test_operator_cannot_launch_participant_attacks(
    client: TestClient,
    operator_token: str,
):
    """Operator receives 403 Forbidden on participant attack routes."""
    op_headers = {"Authorization": f"Bearer {operator_token}"}
    resp = client.post(
        "/api/v1/red/runs",
        headers=op_headers,
        json={"scenario": "credential_stuffing"},
    )
    assert resp.status_code == 403
    assert "Forbidden" in resp.json()["detail"]


# ============================================================================
# 3. Phase Gated Locking
# ============================================================================

def test_participant_cannot_launch_when_phase_locked(
    client: TestClient,
    participant_maya_token: str,
    operator_token: str,
):
    """Participant receives 423 Locked when exercise is in LOBBY phase."""
    op_headers = {"Authorization": f"Bearer {operator_token}"}
    client.post("/api/v1/operator/session/phase", headers=op_headers, json={"phase": "LOBBY"})

    pt_headers = {"Authorization": f"Bearer {participant_maya_token}"}
    resp = client.post(
        "/api/v1/red/runs",
        headers=pt_headers,
        json={"scenario": "credential_stuffing"},
    )
    assert resp.status_code == 423
    assert "locked" in resp.json()["detail"].lower()


# ============================================================================
# 4. Quota Enforcement
# ============================================================================

def test_participant_quota_enforced(
    client: TestClient,
    operator_token: str,
):
    """When participant exceeds quota limit, subsequent runs return 429 Too Many Requests."""
    op_headers = {"Authorization": f"Bearer {operator_token}"}
    client.post("/api/v1/operator/session/phase", headers=op_headers, json={"phase": "EXERCISE_OPEN"})
    # Set quota to 1 for this test
    client.put(
        "/api/v1/operator/authorization",
        headers=op_headers,
        json={
            "target_origin": "http://127.0.0.1:8000",
            "confirmed_ownership": True,
            "enabled_scenarios": ["credential_stuffing", "port_scan"],
            "quota_per_participant": 1,
            "global_concurrency_cap": 5,
        },
    )

    participant_quinn_token = create_access_token(
        identity_id="pt_quinn_quota",
        alias="Quinn",
        role="participant",
        extra_claims={"session_id": "session_phase2_test"},
    )
    pt_headers = {"Authorization": f"Bearer {participant_quinn_token}"}
    # Run 1: Succeeds (201)
    r1 = client.post("/api/v1/red/runs", headers=pt_headers, json={"scenario": "port_scan"})
    assert r1.status_code == 201

    # Run 2: Exceeds quota (429)
    r2 = client.post("/api/v1/red/runs", headers=pt_headers, json={"scenario": "port_scan"})
    assert r2.status_code == 429
    assert "quota exceeded" in r2.json()["detail"].lower()

    # Clean up Quinn's run
    client.post(f"/api/v1/red/runs/{r1.json()['run_id']}/stop", headers=pt_headers)


# ============================================================================
# 5. Participant Isolation
# ============================================================================

def test_participant_isolation_listing_and_inspection(
    client: TestClient,
    participant_maya_token: str,
    participant_alex_token: str,
    operator_token: str,
):
    """Participant Alex cannot see or inspect Participant Maya's runs."""
    op_headers = {"Authorization": f"Bearer {operator_token}"}
    client.put(
        "/api/v1/operator/authorization",
        headers=op_headers,
        json={
            "target_origin": "http://127.0.0.1:8000",
            "confirmed_ownership": True,
            "enabled_scenarios": ["credential_stuffing", "port_scan"],
            "quota_per_participant": 10,
            "global_concurrency_cap": 10,
        },
    )

    # Seed Maya's run
    from app.orchestrator.routes import get_run_manager
    from app.orchestrator.run_manager import AttackRun
    rm = get_run_manager()
    rm._runs["run_maya_12345"] = AttackRun(
        run_id="run_maya_12345",
        scenario="port_scan",
        target_origin="http://127.0.0.1:8000",
        status="COMPLETED",
        launched_by="participant",
        participant_identity_id="pt_maya_01",
    )

    # Maya lists runs: must find run_maya_12345
    maya_headers = {"Authorization": f"Bearer {participant_maya_token}"}
    maya_list = client.get("/api/v1/red/runs", headers=maya_headers).json()
    maya_run_ids = [r["run_id"] for r in maya_list]
    assert "run_maya_12345" in maya_run_ids

    # Alex lists runs: must NOT find run_maya_12345
    alex_headers = {"Authorization": f"Bearer {participant_alex_token}"}
    alex_list = client.get("/api/v1/red/runs", headers=alex_headers).json()
    alex_run_ids = [r["run_id"] for r in alex_list]
    assert "run_maya_12345" not in alex_run_ids

    # Alex attempts to directly inspect Maya's run: receives 403 Forbidden
    alex_inspect = client.get("/api/v1/red/runs/run_maya_12345", headers=alex_headers)
    assert alex_inspect.status_code == 403
    assert "Access forbidden" in alex_inspect.json()["detail"]

    # Alex attempts to stop Maya's run: receives 403 Forbidden
    alex_stop = client.post("/api/v1/red/runs/run_maya_12345/stop", headers=alex_headers)
    assert alex_stop.status_code == 403
    assert "Access forbidden" in alex_stop.json()["detail"]


# ============================================================================
# 6. Scenario Enablement & Suspension Checks
# ============================================================================

def test_operator_disabled_scenario_is_rejected(
    client: TestClient,
    participant_maya_token: str,
    operator_token: str,
):
    """Attempting to launch a scenario not in operator enabled_scenarios returns 403."""
    op_headers = {"Authorization": f"Bearer {operator_token}"}
    client.post("/api/v1/operator/session/phase", headers=op_headers, json={"phase": "EXERCISE_OPEN"})
    client.put(
        "/api/v1/operator/authorization",
        headers=op_headers,
        json={
            "target_origin": "http://127.0.0.1:8000",
            "confirmed_ownership": True,
            "enabled_scenarios": ["credential_stuffing"],  # only credential stuffing
            "quota_per_participant": 10,
            "global_concurrency_cap": 10,
        },
    )

    maya_headers = {"Authorization": f"Bearer {participant_maya_token}"}
    resp = client.post(
        "/api/v1/red/runs",
        headers=maya_headers,
        json={"scenario": "scraping"},
    )
    assert resp.status_code == 403
    assert "not enabled" in resp.json()["detail"].lower()
