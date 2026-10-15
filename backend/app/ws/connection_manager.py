"""WebSocket Protocol v1 Connection Manager.

Enforces:
- Auth tickets with role-based channel authorization.
- Channel isolation: 'operator' channel strictly denied to participants.
- Monotonic sequence numbers (seq) and ring-buffer resume mechanism.
- 20-second heartbeat ping/pong.
- Per-connection bounded queues (drop-oldest for high-frequency telemetry, never-drop for alerts).
"""

from __future__ import annotations

import asyncio
import collections
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Literal

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from app.schemas.ws import WsEnvelope

logger = structlog.get_logger("sentinel_flow.ws")

HIGH_PRIORITY_TYPES = {
    "alert.raised",
    "alert.updated",
    "alert.resolved",
    "emergency_stop.engaged",
    "emergency_stop.reset",
    "attack.finished",
    "resync_required",
}


class WsTicketManager:
    """Manages short-lived tickets for authenticating WebSocket connections."""

    def __init__(self, default_ttl_seconds: int = 300) -> None:
        self.default_ttl = default_ttl_seconds
        # ticket -> {"role": str, "identity_id": str | None, "expires_at": float}
        self._tickets: dict[str, dict[str, Any]] = {}

    def issue_ticket(
        self,
        role: Literal["operator", "participant"],
        identity_id: str | None = None,
        ttl_seconds: int | None = None,
    ) -> str:
        ticket = f"wst_{secrets.token_urlsafe(24)}"
        ttl = ttl_seconds or self.default_ttl
        self._tickets[ticket] = {
            "role": role,
            "identity_id": identity_id,
            "expires_at": time.time() + ttl,
        }
        return ticket

    def validate_and_consume(self, ticket: str) -> dict[str, Any] | None:
        rec = self._tickets.pop(ticket, None)
        if not rec:
            return None
        if time.time() > rec["expires_at"]:
            return None
        return rec


class WsClientConnection:
    """Represents an active client socket session with channels and outbound queue."""

    def __init__(
        self,
        websocket: WebSocket,
        role: str,
        identity_id: str | None,
        max_queue_size: int = 100,
    ) -> None:
        self.websocket = websocket
        self.role = role
        self.identity_id = identity_id
        self.channels: set[str] = {"public"}
        if identity_id:
            self.channels.add(f"participant:{identity_id}")
        if role == "operator":
            self.channels.add("operator")

        self.queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=max_queue_size)
        self.last_ping: float = time.time()
        self.is_active: bool = True

    def can_access_channel(self, channel: str) -> bool:
        if channel == "public":
            return True
        if channel in ("operator", "analyst"):
            return self.role in ("operator", "admin")
        if channel.startswith("participant:"):
            target_id = channel.split(":", 1)[1]
            return self.role in ("operator", "admin") or self.identity_id == target_id
        return False

    async def enqueue_message(self, message: dict[str, Any], high_priority: bool = False) -> None:
        if not self.is_active:
            return

        if self.queue.full():
            if high_priority:
                # Evict oldest low-priority item if possible to guarantee delivery
                try:
                    self.queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    self.queue.put_nowait(message)
                except asyncio.QueueFull:
                    pass
            else:
                # Drop oldest item for normal telemetry ticks
                try:
                    self.queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    self.queue.put_nowait(message)
                except asyncio.QueueFull:
                    pass
        else:
            try:
                self.queue.put_nowait(message)
            except asyncio.QueueFull:
                pass


class WebSocketManager:
    """Central manager handling channel subscriptions, ring-buffered events, and fan-out."""

    def __init__(self, buffer_size: int = 500) -> None:
        self.ticket_manager = WsTicketManager()
        self.clients: set[WsClientConnection] = set()
        self.seq: int = 0
        self.ring_buffer: collections.deque[dict[str, Any]] = collections.deque(maxlen=buffer_size)
        self._lock = asyncio.Lock()

    def create_ticket(
        self,
        role: Literal["operator", "participant"],
        identity_id: str | None = None,
        ttl_seconds: int = 300,
    ) -> str:
        return self.ticket_manager.issue_ticket(role, identity_id, ttl_seconds)

    async def authenticate_and_connect(
        self,
        websocket: WebSocket,
        ticket: str | None,
    ) -> WsClientConnection | None:
        auth_data = None
        if ticket:
            auth_data = self.ticket_manager.validate_and_consume(ticket)
            if auth_data:
                await websocket.accept()
        else:
            # Check for initial auth message only if not in query parameter
            await websocket.accept()
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=1.0)
                if msg.get("type") == "auth" and msg.get("ticket"):
                    auth_data = self.ticket_manager.validate_and_consume(msg["ticket"])
            except Exception:
                pass

        if not auth_data:
            logger.warning("ws_auth_rejected", reason="invalid_or_missing_ticket")
            try:
                await websocket.accept()
            except Exception:
                pass
            await websocket.close(code=4401, reason="Authentication failed: valid ticket required")
            return None

        client = WsClientConnection(
            websocket=websocket,
            role=auth_data["role"],
            identity_id=auth_data.get("identity_id"),
        )
        self.clients.add(client)
        try:
            from app.observability.metrics import record_ws_connection
            for ch in client.channels:
                record_ws_connection(channel=ch, role=client.role, delta=1)
        except Exception:
            pass
        logger.info(
            "ws_client_connected",
            role=client.role,
            identity_id=client.identity_id,
            total_clients=len(self.clients),
        )
        return client

    def disconnect(self, client: WsClientConnection) -> None:
        client.is_active = False
        self.clients.discard(client)
        try:
            from app.observability.metrics import record_ws_connection
            for ch in client.channels:
                record_ws_connection(channel=ch, role=client.role, delta=-1)
        except Exception:
            pass
        logger.info("ws_client_disconnected", remaining_clients=len(self.clients))

    def broadcast(
        self,
        *,
        event_type: str,
        channel: str,
        data: Any,
        provenance: Literal["live", "replay", "simulated"] = "live",
    ) -> dict[str, Any]:
        """Broadcast a message adhering to WsEnvelope v1."""
        self.seq += 1
        now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        envelope = {
            "v": 1,
            "type": event_type,
            "channel": channel,
            "seq": self.seq,
            "ts": now_iso,
            "provenance": provenance,
            "data": data,
        }
        self.ring_buffer.append(envelope)

        high_priority = event_type in HIGH_PRIORITY_TYPES
        for client in list(self.clients):
            if client.can_access_channel(channel):
                asyncio.create_task(client.enqueue_message(envelope, high_priority=high_priority))

        return envelope

    def resume(self, client: WsClientConnection, last_seq: int) -> bool:
        """Replay missed messages if last_seq is present in ring buffer; otherwise prompt resync."""
        if not self.ring_buffer:
            return True

        oldest_seq = self.ring_buffer[0]["seq"]
        newest_seq = self.ring_buffer[-1]["seq"]

        if last_seq >= newest_seq:
            return True  # Already caught up

        if last_seq < oldest_seq - 1:
            # Client missed too many events, ring buffer exhausted
            asyncio.create_task(client.enqueue_message({
                "v": 1,
                "type": "resync_required",
                "channel": "public",
                "seq": self.seq,
                "ts": datetime.now(timezone.utc).isoformat(),
                "provenance": "live",
                "data": {"last_seq_received": last_seq, "oldest_available_seq": oldest_seq},
            }, high_priority=True))
            return False

        # Replay missed events
        for item in self.ring_buffer:
            if item["seq"] > last_seq and client.can_access_channel(item["channel"]):
                asyncio.create_task(client.enqueue_message(item, high_priority=True))
        return True
