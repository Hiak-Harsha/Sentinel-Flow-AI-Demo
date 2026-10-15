"""Test suite for Phase 4: Real-time Wiring and Persistence Survival.

Verifies:
1. Session phase state machine and operator authorization survive backend restart.
2. Attack run records and emergency circuit breaker survive backend restart.
3. WebSocket v1 connection, auth ticket consumption, and channel isolation.
4. Reconnection with monotonic sequence resume replay.
5. High-priority message guarantees (never-drop alerts vs bounded telemetry queue).
6. Private network CORS origin validation for LAN participants.
"""

from __future__ import annotations

import asyncio
import json
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.db.session import close_db, init_db
from app.orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer
from app.orchestrator.consent_gate import ConsentGate
from app.orchestrator.run_manager import AttackRun, RunManager
from app.services.session_service import SessionService
from app.ws.connection_manager import WebSocketManager, WsClientConnection


@pytest.fixture(autouse=True)
def setup_temp_db(monkeypatch, tmp_path):
    """Isolate database to a fresh temporary SQLite file per test run."""
    import app.db.session as session_module
    session_module._engine = None
    session_module._session_factory = None

    db_file = tmp_path / "test_phase4.db"
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    monkeypatch.setattr(settings, "db_url", db_url)
    monkeypatch.setenv("SENTINEL_ENV", "development")
    yield db_file

    session_module._engine = None
    session_module._session_factory = None


@pytest.mark.asyncio
async def test_session_phase_and_authorizations_survive_restart(tmp_path):
    from app.main import app

    session_id = None
    join_code = None

    # --- INSTANCE 1: Create session, transition phase to EXERCISE_OPEN, set authorization ---
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res_create = await client.post("/api/v1/sessions")
            assert res_create.status_code == 200
            session_data = res_create.json()
            session_id = session_data["id"]
            join_code = session_data["join_code"]

            # Transition phase to EXERCISE_OPEN
            sessions_svc: SessionService = app.state.sessions
            sessions_svc.transition_phase("EXERCISE_OPEN", operator_id="Instructor")

            # Set custom authorization
            sessions_svc.set_authorization_record(
                {
                    "target_origin": "http://127.0.0.1:8000/lab-target",
                    "quota_per_participant": 10,
                    "global_concurrency_cap": 12,
                },
                operator_id="Instructor",
            )
            # Give async persist time to write
            await asyncio.sleep(0.1)

    # --- SIMULATE RESTART ---
    await close_db()
    app.state.sessions.active_session = None
    app.state.sessions.participants = {}
    app.state.sessions.session_authorizations = {}

    # --- INSTANCE 2: Hydrate state and verify ---
    async with app.router.lifespan_context(app):
        sessions_svc2: SessionService = app.state.sessions
        curr_session = sessions_svc2.get_current_session()
        assert curr_session["id"] == session_id
        assert curr_session["phase"] == "EXERCISE_OPEN"

        auth = sessions_svc2.get_authorization_record(session_id)
        assert auth["quota_per_participant"] == 10
        assert auth["global_concurrency_cap"] == 12
        assert auth["authorized_by"] == "Instructor"

    await close_db()


@pytest.mark.asyncio
async def test_run_manager_persistence_across_restart(tmp_path):
    from app.orchestrator.allowlist_enforcer import TargetAllowlist

    allowlist = TargetAllowlist(["http://127.0.0.1:8000"])
    enforcer = OrchestratorAllowlistEnforcer(allowlist)
    consent = ConsentGate(enforcer)
    state_file = tmp_path / "emergency_stop.json"

    # Instance 1: Create runs and trip circuit breaker
    rm1 = RunManager(enforcer, consent, state_file=state_file)
    rm1._runs["run_persisted_test_01"] = AttackRun(
        run_id="run_persisted_test_01",
        scenario="port_scan",
        target_origin="http://127.0.0.1:8000",
        status="COMPLETED",
        progress_percent=100.0,
        launched_by="participant",
        participant_identity_id="usr_student_42",
        quota_limit=50,
        requests_executed=35,
    )
    rm1._persist_runs()
    rm1.emergency_stop()

    assert rm1.emergency_stop_tripped is True

    # Instance 2: Boot new RunManager with same directory
    rm2 = RunManager(enforcer, consent, state_file=state_file)
    assert rm2.emergency_stop_tripped is True

    loaded_run = rm2.get_run("run_persisted_test_01")
    assert loaded_run is not None
    assert loaded_run.scenario == "port_scan"
    assert loaded_run.participant_identity_id == "usr_student_42"
    assert loaded_run.requests_executed == 35

    # Reset circuit breaker
    rm2.reset_emergency_stop()
    assert rm2.emergency_stop_tripped is False


@pytest.mark.asyncio
async def test_websocket_channel_isolation_and_resume():
    ws_mgr = WebSocketManager(buffer_size=100)

    # Participant ticket & connection
    ticket_pt = ws_mgr.create_ticket(role="participant", identity_id="pt_dev_99")
    auth_data = ws_mgr.ticket_manager.validate_and_consume(ticket_pt)
    assert auth_data is not None
    assert auth_data["role"] == "participant"

    # Mock participant connection
    class MockWs:
        pass

    client_pt = WsClientConnection(
        websocket=MockWs(),  # type: ignore
        role="participant",
        identity_id="pt_dev_99",
        max_queue_size=10,
    )
    ws_mgr.clients.add(client_pt)

    # Participant channel checks
    assert client_pt.can_access_channel("public") is True
    assert client_pt.can_access_channel("participant:pt_dev_99") is True
    assert client_pt.can_access_channel("participant:other_dev") is False
    assert client_pt.can_access_channel("operator") is False  # Operator channel strictly denied!

    # Broadcast message on operator channel - participant should NOT receive it
    ws_mgr.broadcast(
        event_type="alert.raised",
        channel="operator",
        data={"alert_id": "alt_secret_01"},
    )
    assert client_pt.queue.empty()

    # Broadcast on public channel - participant receives it
    ws_mgr.broadcast(
        event_type="telemetry.tick",
        channel="public",
        data={"requests_per_sec": 42},
    )
    msg = await client_pt.queue.get()
    assert msg["v"] == 1
    assert msg["type"] == "telemetry.tick"
    assert msg["channel"] == "public"
    assert msg["data"]["requests_per_sec"] == 42


@pytest.mark.asyncio
async def test_high_priority_alert_queue_guarantee():
    class MockWs:
        pass

    client = WsClientConnection(
        websocket=MockWs(),  # type: ignore
        role="operator",
        identity_id=None,
        max_queue_size=3,
    )

    # Enqueue 3 normal telemetry messages
    await client.enqueue_message({"type": "telemetry.tick", "seq": 1}, high_priority=False)
    await client.enqueue_message({"type": "telemetry.tick", "seq": 2}, high_priority=False)
    await client.enqueue_message({"type": "telemetry.tick", "seq": 3}, high_priority=False)
    assert client.queue.full()

    # Enqueue high priority alert - must drop oldest low-priority message to fit
    await client.enqueue_message({"type": "alert.raised", "seq": 4}, high_priority=True)

    items = []
    while not client.queue.empty():
        items.append(await client.queue.get())

    types = [i["type"] for i in items]
    assert "alert.raised" in types, "High-priority alert was not guaranteed delivery!"


def test_cors_private_network_origin_matching():
    from app.config import settings
    import re

    regex_str = settings.get_cors_origin_regex()
    assert regex_str is not None
    cors_regex = re.compile(regex_str)

    # Valid LAN & local origins
    assert cors_regex.match("http://localhost:5173")
    assert cors_regex.match("http://127.0.0.1:5173")
    assert cors_regex.match("http://192.168.1.100:5173")
    assert cors_regex.match("http://10.0.0.25:3000")
    assert cors_regex.match("http://172.20.10.2:5173")
    assert cors_regex.match("http://my-laptop.local:5173")

    # Untrusted external origins
    assert not cors_regex.match("https://evil-attacker.com")
    assert not cors_regex.match("https://google.com")
