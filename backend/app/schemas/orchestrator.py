"""Pydantic schemas for attack orchestrator and safety consent gate."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class StartRunRequest(BaseModel):
    scenario: str = Field(description="Scenario: credential_stuffing, port_scan, burst_dos, canary_probe, scraping")
    target_origin: str = Field(description="Target origin passing RFC1918 / loopback allowlist")
    duration_seconds: int = Field(default=20, ge=1, le=120)
    requests_per_second: int = Field(default=15, ge=1, le=100)
    account_count: int = Field(default=25, ge=1, le=100)
    scraping_iterations: int = Field(default=3, ge=1, le=20)
    accounts: list[dict[str, str]] | None = None


class AttackRunModel(BaseModel):
    run_id: str
    scenario: str
    target_origin: str
    status: str
    progress_percent: float = 0.0
    started_at_epoch: float
    completed_at_epoch: float | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None
    launched_by: str = "operator"
    quota_limit: int = 50
    requests_executed: int = 0


class GrantConsentRequest(BaseModel):
    target_origin: str
    operator_name: str = "Operator"
    confirmed_ownership: bool = Field(description="Explicit confirmation that operator owns the target environment")


class ConsentResponse(BaseModel):
    consent_token: str
    target_origin: str
    operator_name: str
    confirmed_ownership: bool
    granted_at_iso: str


class EmergencyStopResponse(BaseModel):
    status: str
    emergency_stop: bool
    emergency_stop_tripped: bool
    message: str
    stopped_runs: list[str] = Field(default_factory=list)
