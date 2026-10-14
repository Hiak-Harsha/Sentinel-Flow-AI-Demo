"""Pydantic schemas for WebSocket Protocol v1 (envelope, auth tickets, channels)."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class WsTicketRequest(BaseModel):
    role: Literal["operator", "participant"] = Field(
        default="participant",
        description="Role requesting WebSocket ticket",
    )
    identity_id: str | None = Field(
        default=None,
        description="Participant device/identity ID (required if role is participant)",
    )
    passcode: str | None = Field(
        default=None,
        description="Operator passcode (required if role is operator)",
    )


class WsTicketResponse(BaseModel):
    ticket: str
    role: str
    identity_id: str | None = None
    expires_in: int = Field(default=300, description="Ticket TTL in seconds")


class WsEnvelope(BaseModel):
    """Protocol v1 Envelope: { v: 1, type, channel, seq, ts, provenance, data }."""
    v: int = Field(default=1, description="Protocol version number")
    type: str = Field(description="Event type identifier, e.g. telemetry.tick, alert.raised")
    channel: str = Field(description="Destination channel: public, operator, or participant:{id}")
    seq: int = Field(description="Monotonically increasing sequence number")
    ts: str = Field(description="ISO 8601 UTC timestamp")
    provenance: Literal["live", "replay", "simulated"] = Field(
        default="live",
        description="Data provenance: live (real traffic), replay (streamed dataset), simulated (scenario)",
    )
    data: Any = Field(description="Event payload object")


class WsClientMessage(BaseModel):
    type: Literal["auth", "subscribe", "resume", "ping"]
    ticket: str | None = None
    channel: str | None = None
    last_seq: int | None = None
