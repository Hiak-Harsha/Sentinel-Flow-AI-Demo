"""Health, overview, telemetry statistics, and academic model endpoints."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Query, Request

router = APIRouter(tags=["Overview & Telemetry"])


@router.get("/health", summary="Health check endpoint")
async def health() -> dict[str, str]:
    return {"status": "ok", "platform": "Sentinel Flow 3.0 (Production Verified Architecture)"}


@router.get("/overview", summary="Aggregate command center and SOC overview metrics")
async def get_overview(request: Request) -> dict[str, Any]:
    sessions = request.app.state.sessions
    detection_engine = request.app.state.detection_engine
    pipeline = request.app.state.feature_pipeline
    academic = request.app.state.academic
    event_store = request.app.state.event_store

    session = sessions.get_current_session()
    participants = sessions.get_participants()
    telemetry_snap = pipeline.compute_network_snapshot()
    det_status = detection_engine.get_status()
    academic_status = academic.get_status()
    recent_events = event_store.list_recent_events(limit=20)
    integrity = event_store.verify_chain_integrity()

    return {
        "session": session,
        "participants_count": len(participants),
        "threat_level": det_status["threat_level"],
        "active_devices": telemetry_snap["active_devices"],
        "requests_per_sec": telemetry_snap["requests_per_sec"],
        "active_alerts": det_status["active_detections"],
        "academic_model_ready": academic_status["ready"],
        "network_snapshot": telemetry_snap,
        "recent_activity": recent_events,
        "evidence_integrity": integrity,
    }


@router.get("/activity/stream", summary="Chronological activity stream from tamper-evident evidence ledger")
async def get_activity_stream(request: Request, limit: int = Query(default=50, ge=1, le=200)) -> list[dict[str, Any]]:
    return request.app.state.event_store.list_recent_events(limit=limit)


@router.get("/telemetry/stats", summary="Current 5s sliding window network feature statistics")
async def get_telemetry_stats(request: Request) -> dict[str, Any]:
    return request.app.state.feature_pipeline.compute_network_snapshot()


@router.get("/telemetry/timeseries", summary="Bounded timeseries points for telemetry charts")
async def get_telemetry_timeseries(request: Request, limit: int = Query(default=50, ge=1, le=200)) -> dict[str, Any]:
    return {"timeseries": request.app.state.feature_store.get_history(limit=limit)}


@router.get("/academic-model/status", summary="Academic supervised model (UNSW-NB15) status")
async def get_academic_model_status(request: Request) -> dict[str, Any]:
    return request.app.state.academic.get_status()


@router.get("/academic-model/benchmark", summary="Academic supervised model benchmark metrics")
async def get_academic_model_benchmark(request: Request) -> dict[str, Any]:
    return {"benchmark": request.app.state.academic.get_status().get("metrics")}


@router.post("/academic-model/predict", summary="Inference endpoint for academic UNSW-NB15 flow model")
async def predict_academic_flow(request: Request, features: dict[str, float]) -> dict[str, Any]:
    return request.app.state.academic.predict(features)
