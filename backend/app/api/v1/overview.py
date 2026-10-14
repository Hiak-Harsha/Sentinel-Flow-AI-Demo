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
    event_repo = getattr(request.app.state, "event_repo", None)
    if event_repo:
        rollups = await event_repo.get_rollups(window_type="1m", limit=limit)
        if rollups:
            return {
                "timeseries": [
                    {
                        "timestamp": r.window_start.isoformat().replace("+00:00", "Z"),
                        "requests_per_sec": round(r.total_requests / 60.0, 2),
                        "total_requests": r.total_requests,
                        "error_count": r.error_count,
                        "avg_latency_ms": r.avg_latency_ms,
                        "p95_latency_ms": r.p95_latency_ms,
                        "unique_identities": r.unique_identities,
                        "bytes_in": r.total_bytes_in,
                        "bytes_out": r.total_bytes_out,
                    }
                    for r in rollups
                ],
                "source": "telemetry_rollups",
            }
    return {
        "timeseries": request.app.state.feature_store.get_history(limit=limit),
        "source": "sliding_window_cache",
    }


@router.get("/telemetry/rollups", summary="Aggregated time-bucket rollups (1m or 1h)")
async def get_telemetry_rollups(
    request: Request,
    window_type: str = Query(default="1m", pattern="^(1m|1h)$"),
    limit: int = Query(default=60, ge=1, le=500),
) -> dict[str, Any]:
    event_repo = getattr(request.app.state, "event_repo", None)
    if not event_repo:
        return {"rollups": []}
    records = await event_repo.get_rollups(window_type=window_type, limit=limit)
    return {
        "window_type": window_type,
        "rollups": [
            {
                "id": r.id,
                "window_start": r.window_start.isoformat().replace("+00:00", "Z"),
                "total_requests": r.total_requests,
                "error_count": r.error_count,
                "avg_latency_ms": r.avg_latency_ms,
                "p95_latency_ms": r.p95_latency_ms,
                "unique_identities": r.unique_identities,
                "total_bytes_in": r.total_bytes_in,
                "total_bytes_out": r.total_bytes_out,
            }
            for r in records
        ],
    }


@router.get("/academic-model/status", summary="Academic supervised model (UNSW-NB15) status")
async def get_academic_model_status(request: Request) -> dict[str, Any]:
    return request.app.state.academic.get_status()


@router.get("/academic-model/benchmark", summary="Academic supervised model benchmark metrics")
async def get_academic_model_benchmark(request: Request) -> dict[str, Any]:
    return {"benchmark": request.app.state.academic.get_status().get("metrics")}


@router.post("/academic-model/predict", summary="Inference endpoint for academic UNSW-NB15 flow model")
async def predict_academic_flow(request: Request, features: dict[str, float]) -> dict[str, Any]:
    return request.app.state.academic.predict(features)
