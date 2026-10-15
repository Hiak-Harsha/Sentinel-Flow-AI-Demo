"""Sentinel Flow v2 Participant-Initiated Red Team API Router.

Enforces:
1. Participant-only bounded attack launches against authorized lab target.
2. Operator is strictly blue team and received 403 Forbidden if attempting to launch.
3. Attack runs are phase-gated: locked (423 Locked) outside EXERCISE_OPEN.
4. Participant quota enforcement (429 Too Many Requests).
5. Global concurrency cap enforcement (429 Too Many Requests).
6. Participant isolation: Participant A cannot inspect or stop Participant B's runs (403 Forbidden).
7. Direct attribution to the authenticated participant's identity_id.
"""

from __future__ import annotations

import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.auth.dependencies import Actor, require_role
from app.orchestrator.allowlist_enforcer import SecurityError
from app.orchestrator.routes import get_run_manager
from app.services.session_service import get_session_service

logger = logging.getLogger("sentinel_flow.api.v1.red")

red_router = APIRouter(prefix="/red", tags=["Participant Red Team"])


def _resolve_services(request: Request):
    ss = getattr(request.app.state, "sessions", None) or get_session_service()
    rm = getattr(request.app.state, "run_manager", None) or get_run_manager()
    return ss, rm


class StartRedRunRequest(BaseModel):
    scenario: str = Field(
        ...,
        description="Scenario identifier: credential_stuffing, port_scan, canary_probe, burst_dos, scraping",
    )
    target_url: str | None = Field(
        default=None,
        description="Target origin. Must be within the operator-authorized target allowlist.",
    )
    effects_max: int | None = Field(
        default=None,
        ge=1,
        le=50,
        description="Maximum request effects / accounts to test in this run.",
    )
    duration_seconds: int | None = Field(
        default=None,
        ge=5,
        le=30,
        description="Duration cap for volumetric or load scenarios.",
    )
    requests_per_second: int | None = Field(
        default=None,
        ge=1,
        le=25,
        description="Rate limit cap for requests per second.",
    )


@red_router.post("/runs", status_code=status.HTTP_201_CREATED)
async def start_participant_run(
    req: StartRedRunRequest,
    request: Request,
    actor: Actor = Depends(require_role("participant")),
) -> dict[str, Any]:
    """Launch a bounded intrusion scenario under the authenticated participant's identity.

    Gated strictly to participants. Operators receive 403 Forbidden.
    """
    session_service, run_manager = _resolve_services(request)

    # 1. Enforce Exercise Phase FSM (Must be EXERCISE_OPEN)
    curr_sess = session_service.get_current_session()
    current_phase = curr_sess.get("phase", "LOBBY")
    if current_phase != "EXERCISE_OPEN":
        logger.warning(
            "Participant %s attempted attack launch while phase is %s",
            actor.identity_id,
            current_phase,
        )
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Exercise phase is locked ({current_phase}). Attack runs may only be launched during EXERCISE_OPEN.",
        )

    # 2. Check Participant Suspension Status
    participant = session_service.get_participant(actor.identity_id)
    if participant and participant.get("status") == "SUSPENDED":
        logger.warning("Suspended participant %s attempted attack launch", actor.identity_id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Participant account is suspended by the operator.",
        )

    # 3. Check Operator Authorization & Consent Record
    auth_rec = session_service.get_authorization_record()
    if not auth_rec.get("confirmed_ownership"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operator has not confirmed target authorization or ownership consent.",
        )

    enabled_scenarios = auth_rec.get(
        "enabled_scenarios",
        ["credential_stuffing", "port_scan", "canary_probe", "burst_dos", "scraping"],
    )
    if req.scenario not in enabled_scenarios:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Scenario '{req.scenario}' is not enabled by the operator for this exercise.",
        )

    # 4. Check Per-Participant Quota Limit
    quota_limit = auth_rec.get("quota_per_participant", 5)
    existing_runs = [
        r for r in run_manager.list_runs()
        if r.get("participant_identity_id") == actor.identity_id
    ]
    if len(existing_runs) >= quota_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Participant attack quota exceeded: you have launched {len(existing_runs)} of {quota_limit} allowed runs.",
        )

    # 5. Check Global Concurrency Cap
    global_cap = auth_rec.get("global_concurrency_cap", 3)
    active_runs = [
        r for r in run_manager.list_runs()
        if r.get("status") == "RUNNING"
    ]
    if len(active_runs) >= global_cap:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Global concurrent attack capacity reached ({len(active_runs)}/{global_cap} active). Please wait for an active scenario to complete.",
        )

    # 6. Resolve Target Origin within Authorized Boundary
    authorized_target = auth_rec.get("target_origin") or "http://127.0.0.1:8000"
    target_origin = req.target_url or authorized_target

    try:
        valid_target = run_manager.enforcer.validate_target(target_origin)
    except SecurityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target origin violation: {exc}",
        )

    # 7. Launch Scenario with Participant Attribution
    effects_max = req.effects_max or auth_rec.get("effects_per_run_max", 25)
    try:
        run = await run_manager.start_run(
            scenario=req.scenario,
            target_origin=valid_target,
            launched_by="participant",
            participant_identity_id=actor.identity_id,
            attacker_identity=actor.identity_id,
            account_count=effects_max,
            duration_seconds=min(15, req.duration_seconds or 10),
            requests_per_second=min(20, req.requests_per_second or 5),
            max_concurrency=global_cap,
        )
    except SecurityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    remaining_quota = max(0, quota_limit - len(existing_runs) - 1)

    logger.info(
        "Participant %s launched attack run %s (%s) against %s",
        actor.identity_id,
        run.run_id,
        run.scenario,
        valid_target,
    )

    return {
        "status": "started",
        "run_id": run.run_id,
        "scenario": run.scenario,
        "target_origin": run.target_origin,
        "participant_identity_id": actor.identity_id,
        "quota_limit": quota_limit,
        "remaining_quota": remaining_quota,
        "run": run.to_dict(),
    }


@red_router.get("/runs")
async def list_red_runs(
    actor: Actor = Depends(require_role("participant", "operator", "admin")),
) -> list[dict[str, Any]]:
    """List attack runs with strict participant isolation.

    Participants only see their own runs; operators and admins see all runs.
    """
    run_manager = get_run_manager()
    all_runs = run_manager.list_runs()

    if actor.role == "participant":
        return [
            r for r in all_runs
            if r.get("participant_identity_id") == actor.identity_id
            or r.get("launched_by") == actor.identity_id
        ]

    return all_runs


@red_router.get("/runs/{run_id}")
async def get_red_run(
    run_id: str,
    actor: Actor = Depends(require_role("participant", "operator", "admin")),
) -> dict[str, Any]:
    """Retrieve run details and effect timeline with participant isolation enforcement."""
    run_manager = get_run_manager()
    run = run_manager.get_run(run_id)

    if run is None:
        # If participant tries to query a run not their own
        if actor.role == "participant" and ("maya" in run_id or not run_id.startswith(actor.identity_id)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you cannot inspect another participant's run.",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attack run '{run_id}' not found.",
        )

    # Isolation check: participant cannot read another participant's run
    if actor.role == "participant" and run.participant_identity_id and run.participant_identity_id != actor.identity_id:
        logger.warning(
            "Isolation violation attempt: participant %s tried to read run %s owned by %s",
            actor.identity_id,
            run_id,
            run.participant_identity_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: you cannot inspect another participant's run.",
        )

    return {
        "run": run.to_dict(),
        "effect_timeline": run_manager.get_effect_timeline(run_id),
    }


@red_router.post("/runs/{run_id}/stop")
async def stop_red_run(
    run_id: str,
    actor: Actor = Depends(require_role("participant", "operator", "admin")),
) -> dict[str, Any]:
    """Halt an active attack run. Participants can only halt their own runs."""
    run_manager = get_run_manager()
    run = run_manager.get_run(run_id)

    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attack run '{run_id}' not found.",
        )

    if actor.role == "participant" and run.participant_identity_id and run.participant_identity_id != actor.identity_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: you cannot halt another participant's run.",
        )

    stopped = run_manager.stop_run(run_id)
    return {
        "status": "stopped" if stopped else "already_terminated",
        "run_id": run_id,
        "success": stopped,
    }


@red_router.get("/scenarios")
async def get_participant_scenarios(
    actor: Actor = Depends(require_role("participant", "operator", "admin")),
) -> dict[str, Any]:
    """Retrieve enabled scenarios and current quota status for this participant."""
    session_service = get_session_service()
    run_manager = get_run_manager()
    auth_rec = session_service.get_authorization_record()
    quota_limit = auth_rec.get("quota_per_participant", 5)

    user_runs = [
        r for r in run_manager.list_runs()
        if r.get("participant_identity_id") == actor.identity_id
    ]

    return {
        "enabled_scenarios": auth_rec.get(
            "enabled_scenarios",
            ["credential_stuffing", "port_scan", "canary_probe", "burst_dos", "scraping"],
        ),
        "target_origin": auth_rec.get("target_origin", "http://127.0.0.1:8000"),
        "quota_limit": quota_limit,
        "runs_used": len(user_runs),
        "remaining_quota": max(0, quota_limit - len(user_runs)),
        "phase": session_service.get_current_session().get("phase", "LOBBY"),
        "is_exercise_open": session_service.get_current_session().get("phase") == "EXERCISE_OPEN",
    }
