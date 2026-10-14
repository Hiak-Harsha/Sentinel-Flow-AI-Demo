"""WebSocket Protocol v1 tests: auth tickets, channel isolation, resume, and backpressure."""

from __future__ import annotations

import asyncio
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.ws.connection_manager import (
    WsClientConnection,
    WebSocketManager,
    WsTicketManager,
)


def test_ws_ticket_manager_lifecycle():
    """Verify ticket generation, validation, one-time consumption, and expiration."""
    tm = WsTicketManager(default_ttl_seconds=10)

    # 1. Issue operator ticket
    op_ticket = tm.issue_ticket(role="operator")
    assert op_ticket.startswith("wst_")

    # 2. Issue participant ticket
    part_ticket = tm.issue_ticket(role="participant", identity_id="alice_dev_1")
    assert part_ticket.startswith("wst_")

    # 3. Validate and consume participant ticket
    rec = tm.validate_and_consume(part_ticket)
    assert rec is not None
    assert rec["role"] == "participant"
    assert rec["identity_id"] == "alice_dev_1"

    # 4. Consumed ticket cannot be reused
    assert tm.validate_and_consume(part_ticket) is None

    # 5. Invalid ticket returns None
    assert tm.validate_and_consume("wst_non_existent") is None

    # 6. Expired ticket returns None
    exp_ticket = tm.issue_ticket(role="participant", ttl_seconds=-1)
    assert tm.validate_and_consume(exp_ticket) is None


def test_ws_channel_isolation_rules():
    """Verify strict server-side channel isolation rules."""
    participant_conn = WsClientConnection(
        websocket=None,  # type: ignore
        role="participant",
        identity_id="alice_dev_1",
    )
    operator_conn = WsClientConnection(
        websocket=None,  # type: ignore
        role="operator",
        identity_id=None,
    )

    # Public channel is open to all
    assert participant_conn.can_access_channel("public") is True
    assert operator_conn.can_access_channel("public") is True

    # Participant channel: own vs other
    assert participant_conn.can_access_channel("participant:alice_dev_1") is True
    assert participant_conn.can_access_channel("participant:bob_dev_2") is False

    # Operator channel: strictly forbidden to participant
    assert participant_conn.can_access_channel("operator") is False

    # Operator has visibility into all channels
    assert operator_conn.can_access_channel("operator") is True
    assert operator_conn.can_access_channel("participant:alice_dev_1") is True
    assert operator_conn.can_access_channel("participant:bob_dev_2") is True


@pytest.mark.asyncio
async def test_ws_channel_broadcast_routing():
    """Verify messages broadcast to 'operator' never leak to participant queue."""
    manager = WebSocketManager(buffer_size=50)

    part_conn = WsClientConnection(websocket=None, role="participant", identity_id="user_123")  # type: ignore
    op_conn = WsClientConnection(websocket=None, role="operator", identity_id=None)  # type: ignore
    manager.clients.add(part_conn)
    manager.clients.add(op_conn)

    # 1. Broadcast on 'operator' channel
    manager.broadcast(
        event_type="alert.raised",
        channel="operator",
        data={"alert_id": "alt_999", "threat": "brute_force"},
    )
    await asyncio.sleep(0.01)

    # Operator received it; Participant queue is completely empty
    assert not op_conn.queue.empty()
    assert part_conn.queue.empty()
    msg = op_conn.queue.get_nowait()
    assert msg["type"] == "alert.raised"
    assert msg["data"]["alert_id"] == "alt_999"

    # 2. Broadcast on 'public' channel
    manager.broadcast(
        event_type="telemetry.tick",
        channel="public",
        data={"requests_per_sec": 42},
    )
    await asyncio.sleep(0.01)

    # Both received public event
    assert not op_conn.queue.empty()
    assert not part_conn.queue.empty()


@pytest.mark.asyncio
async def test_ws_resume_and_ring_buffer():
    """Verify resume replaying from ring buffer and resync_required fallback."""
    manager = WebSocketManager(buffer_size=5)
    client = WsClientConnection(websocket=None, role="operator", identity_id=None)  # type: ignore

    # Emit 5 events (seq 1 to 5)
    for i in range(1, 6):
        manager.broadcast(event_type="telemetry.tick", channel="public", data={"idx": i})

    # Client reconnects with last_seq=3 -> should replay seq 4 and 5
    success = manager.resume(client, last_seq=3)
    assert success is True
    await asyncio.sleep(0.01)

    replayed = []
    while not client.queue.empty():
        replayed.append(client.queue.get_nowait())
    assert len(replayed) == 2
    assert replayed[0]["seq"] == 4
    assert replayed[1]["seq"] == 5

    # Emit 6 more events (buffer maxlen=5 -> oldest events evicted)
    for i in range(6, 12):
        manager.broadcast(event_type="telemetry.tick", channel="public", data={"idx": i})

    # Client reconnects asking for seq 2 (which is evicted from buffer)
    success_evicted = manager.resume(client, last_seq=2)
    assert success_evicted is False
    await asyncio.sleep(0.01)

    resync_msg = client.queue.get_nowait()
    assert resync_msg["type"] == "resync_required"
    assert resync_msg["data"]["last_seq_received"] == 2


@pytest.mark.asyncio
async def test_ws_drop_oldest_backpressure_and_alert_preservation():
    """Verify drop-oldest behavior on telemetry queue and preservation of alerts."""
    conn = WsClientConnection(websocket=None, role="operator", identity_id=None, max_queue_size=3)  # type: ignore

    # Enqueue 4 low-priority items into a size-3 queue
    await conn.enqueue_message({"seq": 1, "type": "telemetry.tick"}, high_priority=False)
    await conn.enqueue_message({"seq": 2, "type": "telemetry.tick"}, high_priority=False)
    await conn.enqueue_message({"seq": 3, "type": "telemetry.tick"}, high_priority=False)
    await conn.enqueue_message({"seq": 4, "type": "telemetry.tick"}, high_priority=False)

    assert conn.queue.qsize() == 3
    # First item (seq 1) was dropped; queue now contains seq 2, 3, 4
    first_item = conn.queue.get_nowait()
    assert first_item["seq"] == 2

    # Enqueue critical alert with high_priority=True
    await conn.enqueue_message({"seq": 5, "type": "alert.raised"}, high_priority=True)
    items = []
    while not conn.queue.empty():
        items.append(conn.queue.get_nowait())
    types = [it["type"] for it in items]
    assert "alert.raised" in types


def test_ws_endpoint_ticket_auth_success():
    """Verify WebSocket endpoint handshake succeeds with valid operator or participant tickets."""
    from app.config import OPERATOR_PASSCODE

    with TestClient(app) as client:
        # 1. Unauthenticated operator ticket request fails
        denied_res = client.post("/api/v1/ws/ticket", json={"role": "operator"})
        assert denied_res.status_code == 403

        # 2. Authenticated operator ticket request succeeds
        ticket_res = client.post("/api/v1/ws/ticket", json={"role": "operator", "passcode": OPERATOR_PASSCODE})
        assert ticket_res.status_code == 200
        ticket_data = ticket_res.json()
        assert "ticket" in ticket_data
        ticket = ticket_data["ticket"]

        # 3. Participant ticket request succeeds without passcode
        part_res = client.post("/api/v1/ws/ticket", json={"role": "participant", "identity_id": "student_alice"})
        assert part_res.status_code == 200
        assert "ticket" in part_res.json()

        # 4. Connect with ticket parameter -> accepted
        with client.websocket_connect(f"/ws?ticket={ticket}") as ws:
            welcome = ws.receive_json()
            assert welcome.get("type") == "initial_state"
            assert welcome.get("channel") == "public"


def test_ws_endpoint_ticket_auth_rejection():
    """Verify WebSocket endpoint rejects unauthenticated connections with close code 4401."""
    from starlette.websockets import WebSocketDisconnect

    with TestClient(app) as client:
        # 1. Connect with invalid ticket parameter -> rejected / closed with 4401
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect("/ws?ticket=invalid_ticket_xyz") as ws:
                ws.receive_json()
        assert exc_info.value.code == 4401

        # 2. Connect without query ticket and send invalid auth payload -> rejected with 4401
        with pytest.raises(WebSocketDisconnect) as exc_info2:
            with client.websocket_connect("/ws") as ws:
                ws.send_json({"type": "auth", "ticket": "invalid_payload_ticket"})
                ws.receive_json()
        assert exc_info2.value.code == 4401
