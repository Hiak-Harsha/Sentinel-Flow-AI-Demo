"""Session management, participant join, and activity endpoints for API v1."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Request

from app.schemas.sessions import (
    ActivityRequest,
    ControlledTargetRequest,
    CreateSessionRequest,
    JoinSessionRequest,
    ParticipantModel,
    SessionModel,
)

router = APIRouter(tags=["Sessions"])


@router.post("/sessions", response_model=SessionModel, summary="Create a new classroom session")
async def create_session(request: Request, body: CreateSessionRequest | None = None) -> dict[str, Any]:
    sessions = request.app.state.sessions
    session = sessions.create_session()
    ws_mgr = getattr(request.app.state, "ws_manager", None)
    if ws_mgr:
        ws_mgr.broadcast(event_type="session.created", channel="public", data=session)
    return session


@router.get("/sessions/current", summary="Get the currently active session")
async def get_current_session(request: Request) -> dict[str, Any]:
    sessions = request.app.state.sessions
    detection_engine = request.app.state.detection_engine
    academic = request.app.state.academic
    pipeline = request.app.state.feature_pipeline
    event_store = request.app.state.event_store

    session = sessions.get_current_session()
    participants = sessions.get_participants()
    det_status = detection_engine.get_status()
    telemetry_snap = pipeline.compute_network_snapshot()
    recent_events = event_store.list_recent_events(limit=25)

    return {
        "session": session,
        "participants": participants,
        "threat_level": det_status["threat_level"],
        "active_detections": det_status["active_detections"],
        "baseline_stats": det_status["baseline_stats"],
        "model": academic.get_status(),
        "telemetry": telemetry_snap,
        "recent_activity": recent_events,
    }


@router.post("/sessions/join", response_model=ParticipantModel, summary="Join a session as a classroom participant")
async def join_session(request: Request, body: JoinSessionRequest) -> dict[str, Any]:
    sessions = request.app.state.sessions
    traffic_logger = request.app.state.traffic_logger
    ws_mgr = getattr(request.app.state, "ws_manager", None)

    try:
        participant = sessions.join_participant(body.join_code, body.alias)
        traffic_logger.log(
            identity_id=participant["device_id"],
            method="POST",
            path="/session/join",
            status_code=200,
            request_size_bytes=128,
            response_size_bytes=512,
            latency_ms=12.0,
            user_agent="SentinelFlow-ParticipantApp/3.0",
        )
        if ws_mgr:
            ws_mgr.broadcast(
                event_type="participant.joined",
                channel="public",
                data={
                    "participant": participant,
                    "session": sessions.get_current_session(),
                },
            )
        return participant
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/sessions/participants", summary="List all active participants in current session")
async def get_participants(request: Request) -> dict[str, Any]:
    return {"participants": request.app.state.sessions.get_participants()}


@router.post("/sessions/controlled-target", summary="Designate or clear controlled target device")
async def set_controlled_target(request: Request, body: ControlledTargetRequest) -> dict[str, Any]:
    sessions = request.app.state.sessions
    sessions.set_controlled_target(body.device_id)
    session = sessions.get_current_session()
    ws_mgr = getattr(request.app.state, "ws_manager", None)
    if ws_mgr:
        ws_mgr.broadcast(event_type="session.phase_changed", channel="public", data=session)
    return {"status": "ok", "controlled_target": body.device_id}


@router.post("/activity", summary="Ingest participant synthetic web application activity")
async def record_activity(request: Request, body: ActivityRequest) -> dict[str, Any]:
    traffic_logger = request.app.state.traffic_logger
    target_url = getattr(request.app.state, "default_target_url", "http://127.0.0.1:8000/lab-target")

    path_map = {
        "fetch_status": "/api/status",
        "query_records": "/api/data/records",
        "view_profile": "/api/user/profile",
        "update_settings": "/api/settings",
        "auth_login": "/api/auth/login",
    }
    path = path_map.get(body.action, f"/api/{body.action}")
    status_code = 401 if body.action == "auth_login" and body.is_burst else 200

    traffic_logger.log(
        identity_id=body.device_id,
        method="POST" if body.action.startswith("update") else "GET",
        path=path,
        status_code=status_code,
        request_size_bytes=body.bytes_in,
        response_size_bytes=body.bytes_out,
        latency_ms=8.5 if not body.is_burst else 2.1,
        target_origin=target_url,
        user_agent="SentinelFlow-ParticipantApp/3.0",
    )
    return {"status": "ok", "device_id": body.device_id, "action": body.action}


@router.get("/history", summary="List historical classroom demonstration sessions")
async def get_history(request: Request) -> dict[str, Any]:
    return {"history": request.app.state.sessions.get_history()}
