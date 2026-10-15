"""Attack scenario orchestrator, consent gate, and emergency stop circuit breaker endpoints."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.auth.dependencies import UserContext, require_roles
from app.schemas.orchestrator import (
    AttackRunModel,
    ConsentResponse,
    EmergencyStopResponse,
    GrantConsentRequest,
    StartRunRequest,
)

router = APIRouter(prefix="/orchestrator", tags=["Attack Orchestrator"])


@router.get("/status", summary="Get status of orchestrator, active runs, and emergency stop")
async def get_orchestrator_status(request: Request) -> dict[str, Any]:
    manager = request.app.state.run_manager
    return manager.get_status()


@router.get("/runs", summary="List all attack scenario runs")
async def list_runs(request: Request) -> dict[str, Any]:
    manager = request.app.state.run_manager
    runs = [manager.get_run_status(r_id) for r_id in manager.list_runs()]
    return {"runs": [r for r in runs if r is not None]}


@router.get("/runs/{run_id}", summary="Get execution status and effect timeline for a run")
async def get_run(request: Request, run_id: str) -> dict[str, Any]:
    manager = request.app.state.run_manager
    status = manager.get_run_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    effects = manager.get_effect_timeline(run_id)
    return {"run": status, "effects": effects}


@router.post("/runs", summary="Deprecated: Operator attack launch prohibited")
async def launch_run(
    request: Request,
    body: dict[str, Any] | None = None,
    user: UserContext = Depends(require_roles(["operator", "admin"])),
) -> dict[str, Any]:
    """In Sentinel Flow v2, operator attack launches are strictly prohibited.

    The operator console is strictly defensive. Bounded attack scenarios must be
    initiated by authorized classroom participants via /api/v1/red/runs.
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Operator cannot launch attack runs. Operators maintain strictly defensive visibility. Attack runs must be initiated by authorized participants via /api/v1/red/runs.",
    )


@router.post("/emergency-stop", response_model=EmergencyStopResponse, summary="Trip emergency stop circuit breaker and halt all scenarios")
async def emergency_stop(
    request: Request,
    user: UserContext = Depends(require_roles(["operator", "admin"])),
) -> dict[str, Any]:
    manager = request.app.state.run_manager
    event_store = request.app.state.event_store
    ws_mgr = getattr(request.app.state, "ws_manager", None)

    result = manager.emergency_stop()
    event_store.record_event(
        event_type="emergency_stop_tripped",
        source=f"operator:{user.identity_id}",
        target_service="orchestrator",
        metadata={"stopped_runs": result.get("stopped_runs", [])},
    )

    if ws_mgr:
        ws_mgr.broadcast(
            event_type="emergency_stop.engaged",
            channel="public",
            data=result,
        )

    return result


@router.post("/emergency-stop/reset", response_model=EmergencyStopResponse, summary="Reset emergency stop circuit breaker")
async def reset_emergency_stop(
    request: Request,
    user: UserContext = Depends(require_roles(["operator", "admin"])),
) -> dict[str, Any]:
    manager = request.app.state.run_manager
    event_store = request.app.state.event_store
    ws_mgr = getattr(request.app.state, "ws_manager", None)

    result = manager.reset_emergency_stop()
    event_store.record_event(
        event_type="emergency_stop_reset",
        source=f"operator:{user.identity_id}",
        target_service="orchestrator",
        metadata={},
    )

    if ws_mgr:
        ws_mgr.broadcast(
            event_type="emergency_stop.reset",
            channel="public",
            data=result,
        )

    return result


@router.post("/consent", response_model=ConsentResponse, summary="Issue verified operator consent token for an allowlisted target")
async def grant_consent(
    request: Request,
    body: GrantConsentRequest,
    user: UserContext = Depends(require_roles(["operator", "admin"])),
) -> dict[str, Any]:
    consent_gate = request.app.state.run_manager.consent_gate
    try:
        record = consent_gate.grant_consent(
            target_origin=body.target_origin,
            operator_name=body.operator_name or user.alias,
            confirmed_ownership=body.confirmed_ownership,
        )
        return {
            "consent_token": record.consent_token,
            "target_origin": record.target_origin,
            "operator_name": record.operator_name,
            "confirmed_ownership": record.confirmed_ownership,
            "granted_at_iso": record.granted_at_iso,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/consent/log", summary="Get operator consent audit ledger")
async def get_consent_audit_log(request: Request) -> dict[str, Any]:
    consent_gate = request.app.state.run_manager.consent_gate
    return {"consent_audit_log": consent_gate.get_audit_log()}
