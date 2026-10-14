"""Pydantic models for detection engine, alerts, and evidence chain verification."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class AlertDispositionRequest(BaseModel):
    disposition: str = Field(description="Alert status: OPEN, ACKNOWLEDGED, INVESTIGATING, RESOLVED, FALSE_POSITIVE")
    notes: str = Field(default="", description="Analyst investigation notes")


class AlertModel(BaseModel):
    alert_id: str
    id: str | None = None
    session_id: str = "current"
    rule_id: str
    name: str
    severity: str
    identity_id: str
    threat_score: float
    disposition: str = "OPEN"
    analyst_notes: str | None = None
    created_at: str
    updated_at: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)


class DetectionStatusResponse(BaseModel):
    threat_level: str
    active_detections: int
    baseline_stats: dict[str, Any] = Field(default_factory=dict)
    rules_registered: int = 7
    engine_ready: bool = True
    average_baseline_maturity: float = 0.0
    tracked_identities: int = 0


class ChainVerifyResponse(BaseModel):
    valid: bool
    chain_valid: bool
    total_events: int = 0
    chain_tail_hash: str | None = None
    latest_integrity_hash: str | None = None
    verified_at: str | None = None
    failed_at_index: int | None = None
    corrupted_at_index: int | None = None
    event_id: str | None = None
    reason: str | None = None
