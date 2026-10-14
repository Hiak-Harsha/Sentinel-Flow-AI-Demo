"""Pydantic schemas for sessions and participant management."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class CreateSessionRequest(BaseModel):
    title: str | None = Field(default=None, description="Optional title or class description")


class SessionModel(BaseModel):
    id: str
    join_code: str
    phase: str = "WAITING"
    created_at_utc: str | None = None
    controlled_target: str | None = None
    max_participants: int = 60


class JoinSessionRequest(BaseModel):
    join_code: str = Field(min_length=4, max_length=12, description="Session join code")
    alias: str = Field(min_length=1, max_length=32, description="Display name / alias of participant")


class ParticipantModel(BaseModel):
    id: str | None = None
    token: str | None = None
    device_id: str
    alias: str
    role: str = "participant"
    joined_at: str | None = None
    last_seen: str | None = None
    request_count: int = 0


class ControlledTargetRequest(BaseModel):
    device_id: str | None = Field(default=None, description="Device ID to mark as controlled target, or None to clear")


class ActivityRequest(BaseModel):
    device_id: str = Field(description="Participant unique device identifier")
    action: str = Field(description="Simulated user activity action")
    is_burst: bool = Field(default=False, description="Flag indicating high-frequency synthetic burst")
    bytes_in: int = Field(default=128, ge=0)
    bytes_out: int = Field(default=1024, ge=0)


class ReplayEventRequest(BaseModel):
    scenario: str = Field(default="credential_stuffing")
    count: int = Field(default=10, ge=1, le=100)
    delay_ms: int = Field(default=50, ge=0, le=1000)
