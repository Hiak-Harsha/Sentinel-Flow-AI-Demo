"""FastAPI router for operator-gated attack orchestration."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
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


import logging
from app.config import settings
from app.auth.security import decode_access_token

logger = logging.getLogger("sentinel_flow.orchestrator.routes")


def verify_operator_access(request: Request) -> None:
    """Server-side verification of operator role with zero unauthenticated loopback bypass."""
    raw_auth = request.headers.get("Authorization", "")
    token = (
        request.headers.get("X-Identity-Token")
        or (raw_auth[7:].strip() if raw_auth.startswith("Bearer ") else raw_auth.strip())
        or request.cookies.get("sentinel_session")
    )

    if not token:
        # Dev shortcut strictly gated behind SENTINEL_ENV=dev AND DEV_ALLOW_LOOPBACK_BYPASS=True
        if settings.is_dev and getattr(settings, "dev_allow_loopback_bypass", False):
            client_ip = request.client.host if request.client else ""
            if client_ip in ("127.0.0.1", "localhost", "::1", "testserver", "testclient"):
                logger.warning("DEV_ALLOW_LOOPBACK_BYPASS active: granting operator access to %s", client_ip)
                return
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: operator privileges required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Try decoding as JWT access token
    try:
        claims = decode_access_token(token)
        role = claims.get("role", "")
        if role in ("operator", "admin"):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Operator privileges required; calling role '{role}' is forbidden.",
        )
    except HTTPException:
        raise
    except Exception:
        pass

    # 2. Check session manager for registered session tokens
    try:
        from app.identity.routes import get_session_manager
        sm = get_session_manager()
        session = sm.validate_token(token) if token else None
        if session and session.role in ("operator", "admin"):
            return
        if session:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operator privileges required; calling role '{session.role}' is forbidden.",
            )
    except HTTPException:
        raise
    except Exception:
        pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or unverified authentication token.",
        headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
    )


AVAILABLE_SCENARIOS = [
    {
        "id": "credential_stuffing",
        "name": "Failed-Login Brute Force (MITRE T1110)",
        "category": "Authentication Attack",
        "description": "Rapid multi-principal authentication attempts against lab login endpoint, generating verifiable auth.failure audit events.",
        "risk_level": "LOW (Bounded to max 25 test attempts)",
        "params": {
            "account_count": {"label": "Test Accounts", "min": 5, "max": 25, "default": 10, "step": 5},
        },
    },
    {
        "id": "port_scan",
        "name": "Network Service Discovery / Port Scan (MITRE T1046)",
        "category": "Reconnaissance / Discovery",
        "description": "Simulated connection sensor probes across distinct TCP ports (21, 22, 23, 80, 443, 3306, 5432, 8080).",
        "risk_level": "LOW (Sensor telemetry only)",
        "params": {},
    },
    {
        "id": "burst_dos",
        "name": "Volumetric Rate Burst / Overload (MITRE T1499)",
        "category": "Denial of Service",
        "description": "Bounded high-frequency HTTP requests against target health endpoint, reporting rate, p95 latency, and saturation telemetry.",
        "risk_level": "MEDIUM (Capped at 20 req/s, 15s max, 50 requests total)",
        "params": {
            "requests_per_second": {"label": "Requests / Sec", "min": 5, "max": 20, "default": 15, "step": 1},
            "duration_seconds": {"label": "Burst Duration (s)", "min": 5, "max": 15, "default": 10, "step": 5},
        },
    },
    {
        "id": "canary_probe",
        "name": "Exploitation Attempt Canary Probes (MITRE T1190)",
        "category": "Initial Access / Exploitation Attempt",
        "description": "Non-destructive canary security traps (SQL syntax tests, traversal markers, sensitive file probes) that verify detection without executing exploits.",
        "risk_level": "LOW (Safe non-destructive canary markers)",
        "params": {},
    },
    {
        "id": "scraping",
        "name": "Automated Endpoint Crawl / Active Scanning (MITRE T1595)",
        "category": "Reconnaissance / Crawl",
        "description": "Robotic endpoint crawling across 15+ paths with uniform interval and high path entropy.",
        "risk_level": "LOW",
        "params": {
            "scraping_iterations": {"label": "Crawl Iterations", "min": 1, "max": 5, "default": 2, "step": 1},
        },
    },
]


class ConsentRequest(BaseModel):
    target_origin: str = Field(..., description="Target origin e.g. http://127.0.0.1:8000/lab-target")
    operator_name: str = Field(default="Lab Operator")
    confirmed_ownership: bool = Field(..., description="Must be true to certify ownership")


class StartRunRequest(BaseModel):
    scenario: str = Field(..., description="Scenario ID: credential_stuffing, port_scan, burst_dos, canary_probe, scraping")
    target_origin: str = Field(default="http://127.0.0.1:8000", description="Private lab target URL")
    accounts: list[dict[str, str]] | None = None
    duration_seconds: int = Field(default=10, ge=5, le=30)
    requests_per_second: int = Field(default=15, ge=1, le=20)
    account_count: int = Field(default=10, ge=5, le=25)
    scraping_iterations: int = Field(default=2, ge=1, le=5)
    launched_by: str = Field(default="operator", description="Participant alias or operator")


@router.get("/status")
async def get_orchestrator_status() -> dict[str, Any]:
    """Return status of red team orchestrator, consent gate, and active runs."""
    manager = get_run_manager()
    return manager.get_status()


@router.get("/scenarios")
async def list_scenarios() -> list[dict[str, Any]]:
    """List available red team scenarios with safety limits and parameter schema."""
    return AVAILABLE_SCENARIOS


@router.post("/consent")
async def record_consent(req: ConsentRequest, request: Request) -> dict[str, Any]:
    """Record operator ownership confirmation for an allowlisted private target."""
    verify_operator_access(request)
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
    """Inspect operator consent audit log."""
    manager = get_run_manager()
    return manager.consent_gate.get_audit_log()


@router.post("/run")
@router.post("/runs")
async def start_run(request: Request, req: dict[str, Any] | None = None) -> dict[str, Any]:
    """Deprecated: Operators are strictly defensive. Attack runs are participant-only via /api/v1/red/runs."""
    manager = get_run_manager()
    if getattr(manager, "emergency_stop_tripped", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Emergency stop circuit breaker active. All attack executions halted.",
        )
    verify_operator_access(request)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Operator cannot launch attack runs. Operators maintain strictly defensive visibility. Attack runs must be initiated by authorized participants via /api/v1/red/runs.",
    )


@router.post("/run/{run_id}/stop")
async def stop_run(run_id: str, request: Request) -> dict[str, Any]:
    """Halt an active attack run."""
    verify_operator_access(request)
    manager = get_run_manager()
    stopped = manager.stop_run(run_id)
    if not stopped:
        raise HTTPException(status_code=404, detail=f"Active run {run_id} not found.")
    return {"status": "stopped", "run_id": run_id}


@router.post("/emergency-stop")
async def emergency_stop(request: Request) -> dict[str, Any]:
    """Immediately halt ALL active runs and trip the circuit breaker."""
    verify_operator_access(request)
    manager = get_run_manager()
    return manager.emergency_stop()


@router.post("/emergency-stop/reset")
async def reset_emergency_stop(request: Request) -> dict[str, Any]:
    """Reset the emergency stop circuit breaker."""
    verify_operator_access(request)
    manager = get_run_manager()
    return manager.reset_emergency_stop()


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
