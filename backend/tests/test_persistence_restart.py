"""Test suite verifying persistence survival across application restarts (Phase 2 requirement).

Flow:
1. Boot backend instance 1 with its full lifespan.
2. Create session -> participant joins -> alert is raised and persisted.
3. Shut down instance 1 completely (disposing engine, stopping background workers, resetting memory).
4. Boot fresh backend instance 2 with lifespan pointing to the same database.
5. Verify session, participant, and security alert state remain 100% intact.
"""

from __future__ import annotations

import os
import tempfile
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.db.base import Base
from app.db.session import close_db, get_engine, init_db


@pytest.fixture(autouse=True)
def setup_temp_db(monkeypatch, tmp_path):
    """Isolate database to a fresh temporary SQLite file per test run."""
    db_file = tmp_path / "test_restart.db"
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    monkeypatch.setattr(settings, "db_url", db_url)
    monkeypatch.setenv("SENTINEL_ENV", "development")
    yield db_file


@pytest.mark.asyncio
async def test_state_survives_backend_restart():
    from app.main import app

    session_id = None
    join_code = None
    participant_id = None
    device_id = None

    # =========================================================================
    # INSTANCE 1: Boot lifespan, create session, join participant, raise alert
    # =========================================================================
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Create a new classroom session
            res_create = await client.post("/api/v1/sessions")
            assert res_create.status_code == 200, res_create.text
            session_data = res_create.json()
            session_id = session_data["id"]
            join_code = session_data["join_code"]

            # 2. Join a student participant
            res_join = await client.post(
                "/api/v1/sessions/join",
                json={"join_code": join_code, "alias": "Alice SecOps"},
            )
            assert res_join.status_code == 200, res_join.text
            participant_data = res_join.json()
            participant_id = participant_data["id"]
            device_id = participant_data["device_id"]

            # 3. Raise a security alert via detection repository
            det_repo = app.state.detection_repo
            alert = await det_repo.save_alert(
                alert_id="alt_restart_survival_001",
                identity_id=device_id,
                rule_id="RULE_CREDENTIAL_STUFFING",
                name="Rapid Authentication Anomaly",
                severity="HIGH",
                threat_score=0.92,
                status="open",
                session_id=session_id,
            )
            assert alert.alert_id == "alt_restart_survival_001"

    # =========================================================================
    # RESTART SIMULATION: Close connections, dispose engine, reset memory
    # =========================================================================
    await close_db()

    # Clear in-memory instance state to simulate clean restart
    app.state.sessions.active_session = None
    app.state.sessions.participants = {}
    app.state.detection_engine._latest_assessments = {}
    app.state.detection_engine.alerts._active_alerts = {}

    # =========================================================================
    # INSTANCE 2: Verify state was hydrated from persistent storage
    # =========================================================================
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client2:
            # 1. Verify session survived
            res_curr = await client2.get("/api/v1/sessions/current")
            assert res_curr.status_code == 200
            curr_body = res_curr.json()
            assert curr_body["session"]["id"] == session_id
            assert curr_body["session"]["join_code"] == join_code

            # 2. Verify participant survived
            res_part = await client2.get("/api/v1/sessions/participants")
            assert res_part.status_code == 200
            participants = res_part.json()["participants"]
            alice = next((p for p in participants if p["id"] == participant_id or p["alias"] == "Alice SecOps"), None)
            assert alice is not None, f"Alice SecOps not found in {participants}"
            assert alice["device_id"] == device_id

            # 3. Verify alert survived in detection repository
            det_repo2 = app.state.detection_repo
            persisted_alerts = await det_repo2.get_alerts()
            test_alert = next((a for a in persisted_alerts if a.alert_id == "alt_restart_survival_001"), None)
            assert test_alert is not None, f"Alert not found in {persisted_alerts}"
            assert test_alert.identity_id == device_id
            assert test_alert.severity == "HIGH"
            assert test_alert.rule_id == "RULE_CREDENTIAL_STUFFING"

    # Final cleanup
    await close_db()
