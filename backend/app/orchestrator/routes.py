"""FastAPI router for operator-gated attack orchestration."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.orchestrator.allowlist_enforcer import SecurityError
from app.orchestrator.run_manager import RunManager

router = APIRouter(prefix="/api/orchestrator", tags=["Attack Orchestrator"])

_run_manager: RunManager | None = None


def set_run_manager(manager: RunManager) -> None:
    global _run_manager
    _run_manager = manager


def get_run_manager() -> RunManager:
    if _run_manager is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Attack orchestrator is not initialized.",
        )
    return _run_manager


AVAILABLE_SCENARIOS = [
    {
        "id": "credential_stuffing",
        "name": "Credential Stuffing Simulation",
        "category": "Authentication Attack",
        "description": "Rapid multi-username login attempts from a single device, demonstrating account churn and 401 rate escalation.",
        "risk_level": "LOW (Capped at 50 test accounts)",
        "params": {
            "account_count": {"label": "Test Accounts", "min": 5, "max": 50, "default": 25, "step": 5},
        },
    },
    {
        "id": "burst_dos",
        "name": "Volumetric Rate Burst (DoS)",
        "category": "Denial of Service",
        "description": "High-frequency HTTP GET flood against target root, triggering volume and rate spike detectors.",
        "risk_level": "MEDIUM",
        "params": {
            "requests_per_second": {"label": "Requests / Sec", "min": 1, "max": 50, "default": 15, "step": 1},
            "duration_seconds": {"label": "Burst Duration (s)", "min": 5, "max": 120, "default": 20, "step": 5},
        },
    },
    {
        "id": "scraping",
        "name": "High-Entropy Endpoint Scraping",
        "category": "Reconnaissance / Crawl",
        "description": "Rapid enumeration across 15+ endpoints with steady robotic interval, triggering endpoint entropy rules.",
        "risk_level": "LOW",
        "params": {
            "scraping_iterations": {"label": "Crawl Iterations", "min": 1, "max": 10, "default": 3, "step": 1},
        },
    },
    {
        "id": "zap_scan",
        "name": "OWASP ZAP / Non-Destructive Vulnerability Probe",
        "category": "Vulnerability Assessment",
        "description": "Non-destructive security probes (SQL syntax checks, XSS test patterns, sensitive file requests).",
        "risk_level": "LOW (Non-destructive)",
        "params": {},
    },
]


class ConsentRequest(BaseModel):
    target_origin: str = Field(..., description="Target origin e.g. https://kee-crochet-shop.vercel.app")
    operator_name: str = Field(default="Lab Operator")
    confirmed_ownership: bool = Field(..., description="Must be true to certify ownership")


class StartRunRequest(BaseModel):
    scenario: str = Field(..., description="Scenario ID e.g. credential_stuffing, burst_dos, scraping, zap_scan")
    target_origin: str = Field(..., description="Target URL")
    accounts: list[dict[str, str]] | None = None
    duration_seconds: int = Field(default=20, ge=5, le=120)
    requests_per_second: int = Field(default=15, ge=1, le=50)
    account_count: int = Field(default=25, ge=5, le=50)
    scraping_iterations: int = Field(default=3, ge=1, le=10)
    launched_by: str = Field(default="operator", description="Participant alias or operator")


@router.get("/scenarios")
async def list_scenarios() -> list[dict[str, Any]]:
    """List available red team scenarios with safety limits and parameter schema."""
    return AVAILABLE_SCENARIOS


@router.post("/consent")
async def record_consent(req: ConsentRequest) -> dict[str, Any]:
    """Record operator ownership confirmation for an allowlisted target."""
    manager = get_run_manager()
    try:
        record = manager.consent_gate.grant_consent(
            target_origin=req.target_origin,
            operator_name=req.operator_name,
            confirmed_ownership=req.confirmed_ownership,
        )
        return {
            "status": "granted",
            "consent_token": record.consent_token,
            "target": record.target_origin,
            "granted_at": record.granted_at_iso,
        }
    except SecurityError as err:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(err))


@router.get("/consent/audit")
async def get_consent_audit() -> list[dict[str, Any]]:
    """Inspect immutable operator consent audit log."""
    manager = get_run_manager()
    return manager.consent_gate.get_audit_log()


@router.post("/run")
async def start_run(req: StartRunRequest) -> dict[str, Any]:
    """Launch an attack scenario against allowlisted target."""
    manager = get_run_manager()
    try:
        run = await manager.start_run(
            scenario=req.scenario,
            target_origin=req.target_origin,
            accounts=req.accounts,
            duration_seconds=req.duration_seconds,
            requests_per_second=req.requests_per_second,
            account_count=req.account_count,
            scraping_iterations=req.scraping_iterations,
            launched_by=req.launched_by,
        )
        return {"status": "started", "run": run.to_dict()}
    except SecurityError as err:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(err))
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/run/{run_id}/stop")
async def stop_run(run_id: str) -> dict[str, Any]:
    """Halt an active attack run."""
    manager = get_run_manager()
    stopped = manager.stop_run(run_id)
    if not stopped:
        raise HTTPException(status_code=404, detail=f"Active run {run_id} not found.")
    return {"status": "stopped", "run_id": run_id}


@router.get("/run/{run_id}")
async def get_run_status(run_id: str) -> dict[str, Any]:
    """Get status and metrics of a specific attack run."""
    manager = get_run_manager()
    run = manager.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run.to_dict()


@router.get("/run/{run_id}/effect-timeline")
async def get_run_effect_timeline(run_id: str) -> list[dict[str, Any]]:
    """Return ordered list of per-request effect events for run (up to 500)."""
    manager = get_run_manager()
    return manager.get_effect_timeline(run_id)


@router.get("/runs")
async def list_runs() -> list[dict[str, Any]]:
    """List all attack runs in chronological order."""
    manager = get_run_manager()
    return manager.list_runs()
