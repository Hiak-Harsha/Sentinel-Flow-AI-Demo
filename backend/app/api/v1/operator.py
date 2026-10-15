"""Operator control endpoints for Sentinel Flow v2.

Blue-team defensive supervisor operations:
- Exercise session phase management (LOBBY -> BASELINE -> EXERCISE_OPEN -> DEBRIEF -> CLOSED)
- Target ownership authorization and quota limits configuration
- Emergency stop circuit breaker and reset
- Participant tool suspension
- Read-only participant and attack run monitoring

Note: In accordance with Sentinel Flow v2 Authoritative Rules, the operator console
contains ZERO attack-launching routes.
"""

from __future__ import annotations

import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.auth.dependencies import Actor, require_role

logger = logging.getLogger("sentinel_flow.api.operator")

router = APIRouter(prefix="/operator", tags=["Operator Controls"])


class PhaseChangeRequest(BaseModel):
    phase: str = Field(..., description="Target phase: LOBBY, BASELINE, EXERCISE_OPEN, DEBRIEF, CLOSED")


class AuthorizationUpdateRequest(BaseModel):
    target_origin: str = Field(..., description="Authorized target URL (must be private or loopback)")
    confirmed_ownership: bool = Field(..., description="Explicit ownership confirmation")
    enabled_scenarios: list[str] = Field(
        default_factory=lambda: [
            "credential_stuffing",
            "port_scan",
            "burst_dos",
            "canary_probe",
            "scraping",
        ],
        description="List of allowed scenario IDs",
    )
    quota_per_participant: int = Field(default=5, ge=1, le=50, description="Max runs allowed per participant")
    effects_per_run_max: int = Field(default=50, ge=5, le=200, description="Max effects/requests per run")
    global_concurrency_cap: int = Field(default=8, ge=1, le=30, description="Max concurrent runs globally")
    reveal_mode: str = Field(default="after_run", description="Detection feedback: off, after_run, live")


@router.post("/session/phase", summary="Transition exercise session phase")
async def set_session_phase(
    body: PhaseChangeRequest,
    request: Request,
    actor: Actor = Depends(require_role("operator", "admin")),
) -> dict[str, Any]:
    """Advance session phase. Only operator or admin can transition phases."""
    sessions = getattr(request.app.state, "sessions", None)
    if not sessions:
        raise HTTPException(status_code=503, detail="Session service unavailable.")

    try:
        updated_session = sessions.transition_phase(body.phase, operator_id=actor.alias or actor.identity_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    # Broadcast session.phase_changed event over WebSockets
    ws_mgr = getattr(request.app.state, "ws_manager", None)
    if ws_mgr:
        ws_mgr.broadcast(
            event_type="session.phase_changed",
            channel="public",
            data={
                "session_id": updated_session["id"],
                "phase": updated_session["phase"],
                "updated_by": actor.alias or actor.identity_id,
            },
        )

    return {"status": "success", "session": updated_session}


@router.get("/authorization", summary="Retrieve active session authorization record")
async def get_authorization(
    request: Request,
    actor: Actor = Depends(require_role("operator", "admin")),
) -> dict[str, Any]:
    sessions = getattr(request.app.state, "sessions", None)
    if not sessions:
        raise HTTPException(status_code=503, detail="Session service unavailable.")
    return sessions.get_authorization_record()


@router.put("/authorization", summary="Configure authorized target, enabled scenarios, and quotas")
async def update_authorization(
    body: AuthorizationUpdateRequest,
    request: Request,
    actor: Actor = Depends(require_role("operator", "admin")),
) -> dict[str, Any]:
    sessions = getattr(request.app.state, "sessions", None)
    run_manager = getattr(request.app.state, "run_manager", None)
    if not sessions:
        raise HTTPException(status_code=503, detail="Session service unavailable.")

    # Validate target origin against allowlist enforcer
    if run_manager and hasattr(run_manager, "consent_gate"):
        try:
            consent_record = run_manager.consent_gate.grant_consent(
                target_origin=body.target_origin,
                operator_name=actor.alias or actor.identity_id,
                confirmed_ownership=body.confirmed_ownership,
            )
            consent_token = consent_record.consent_token
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        consent_token = ""

    auth_payload = body.model_dump()
    auth_payload["consent_token"] = consent_token

    updated_record = sessions.set_authorization_record(
        auth_payload,
        operator_id=actor.alias or actor.identity_id,
    )

    ws_mgr = getattr(request.app.state, "ws_manager", None)
    if ws_mgr:
        ws_mgr.broadcast(
            event_type="operator.authorization_updated",
            channel="operator",
            data=updated_record,
        )

    return {"status": "success", "authorization": updated_record}


@router.post("/emergency-stop", summary="Emergency Stop: Halt all runs within 2s and trip circuit breaker")
async def trigger_emergency_stop(
    request: Request,
    actor: Actor = Depends(require_role("operator", "admin")),
) -> dict[str, Any]:
    run_manager = getattr(request.app.state, "run_manager", None)
    if not run_manager:
        raise HTTPException(status_code=503, detail="Run manager unavailable.")

    result = run_manager.trigger_emergency_stop()

    ws_mgr = getattr(request.app.state, "ws_manager", None)
    if ws_mgr:
        ws_mgr.broadcast(
            event_type="emergency_stop.triggered",
            channel="public",
            data={
                "triggered_by": actor.alias or actor.identity_id,
                "reason": "Operator Emergency Stop invoked",
                **result,
            },
        )

    return {"status": "stopped", "result": result}


@router.post("/emergency-stop/reset", summary="Reset emergency stop circuit breaker")
async def reset_emergency_stop(
    request: Request,
    actor: Actor = Depends(require_role("operator", "admin")),
) -> dict[str, Any]:
    run_manager = getattr(request.app.state, "run_manager", None)
    if not run_manager:
        raise HTTPException(status_code=503, detail="Run manager unavailable.")

    result = run_manager.reset_emergency_stop()

    ws_mgr = getattr(request.app.state, "ws_manager", None)
    if ws_mgr:
        ws_mgr.broadcast(
            event_type="emergency_stop.reset",
            channel="public",
            data={
                "reset_by": actor.alias or actor.identity_id,
                **result,
            },
        )

    return {"status": "reset", "result": result}


@router.post("/participants/{participant_id}/suspend", summary="Suspend a participant's intrusion tools")
async def suspend_participant_route(
    participant_id: str,
    request: Request,
    actor: Actor = Depends(require_role("operator", "admin")),
) -> dict[str, Any]:
    sessions = getattr(request.app.state, "sessions", None)
    if not sessions:
        raise HTTPException(status_code=503, detail="Session service unavailable.")

    try:
        participant = sessions.suspend_participant(participant_id, operator_id=actor.alias or actor.identity_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    ws_mgr = getattr(request.app.state, "ws_manager", None)
    if ws_mgr:
        ws_mgr.broadcast(
            event_type="participant.suspended",
            channel=f"participant:{participant_id}",
            data={"participant_id": participant_id, "reason": "Suspended by operator"},
        )
        ws_mgr.broadcast(
            event_type="participant.suspended",
            channel="operator",
            data=participant,
        )

    return {"status": "suspended", "participant": participant}


@router.get("/runs", summary="Read-only view of recorded attack runs")
async def list_operator_runs(
    request: Request,
    actor: Actor = Depends(require_role("operator", "admin")),
) -> dict[str, Any]:
    run_manager = getattr(request.app.state, "run_manager", None)
    if not run_manager:
        return {"runs": []}
    runs = [run_manager.get_run_status(r_id) for r_id in run_manager.list_runs()]
    return {"runs": [r for r in runs if r is not None]}
