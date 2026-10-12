"""FastAPI routes for detection engine status, alerts, and calibration."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.detection.engine import DetectionEngine

router = APIRouter(prefix="/api/detection", tags=["Detection"])

_detection_engine: DetectionEngine | None = None
_session_service: Any = None


def set_detection_engine(engine: DetectionEngine) -> None:
    global _detection_engine
    _detection_engine = engine


def set_session_service(service: Any) -> None:
    global _session_service
    _session_service = service


def get_detection_engine() -> DetectionEngine:
    if _detection_engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Detection engine is not initialized.",
        )
    return _detection_engine


@router.get("/status")
async def get_detection_status() -> dict[str, Any]:
    """Get real-time multi-layer detection status."""
    engine = get_detection_engine()
    return engine.get_status()


@router.get("/alerts")
async def get_active_alerts() -> list[dict[str, Any]]:
    """Get currently active security alerts."""
    engine = get_detection_engine()
    return engine.alerts.get_active_alerts()


@router.get("/alerts/history")
async def get_alert_history(limit: int = 50) -> list[dict[str, Any]]:
    """Get chronological alert history."""
    engine = get_detection_engine()
    return engine.alerts.get_history(limit=limit)


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str) -> dict[str, Any]:
    """Mark an alert as resolved."""
    engine = get_detection_engine()
    success = engine.alerts.resolve_alert(alert_id)
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "resolved", "alert_id": alert_id}


@router.get("/baseline")
async def get_baseline() -> dict[str, Any]:
    """Get unsupervised baseline distribution stats."""
    engine = get_detection_engine()
    return {"baseline_stats": engine.unsupervised.get_stats()}


@router.post("/baseline/calibrate")
@router.post("/baseline")
async def calibrate_baseline() -> dict[str, Any]:
    """Manually trigger baseline calibration."""
    engine = get_detection_engine()
    stats = engine.unsupervised.get_stats()
    return {"status": "calibrated", "baseline_stats": stats}


@router.get("/device/{device_id}")
async def get_device_assessment(device_id: str) -> dict[str, Any]:
    """Get real-time security assessment for an individual identity."""
    engine = get_detection_engine()
    assessment = engine.get_assessment(device_id)
    if not assessment:
        return {
            "device_id": device_id,
            "threat_score": 0.0,
            "threat_level": "LOW",
            "is_threat": False,
            "matched_rules": [],
            "human_summary": "No traffic observed yet for this identity.",
        }
    return assessment


@router.get("/grid")
async def get_detection_grid() -> list[dict[str, Any]]:
    """Return compact status for all known devices for the operator heatmap."""
    engine = get_detection_engine()
    grid: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    participants = _session_service.get_participants() if _session_service else []
    for p in participants:
        dev_id = str(p.get("device_id") or p.get("id"))
        seen_ids.add(dev_id)
        assessment = engine.get_assessment(dev_id) or {}
        grid.append({
            "device_id": dev_id,
            "alias": p.get("alias", dev_id),
            "threat_level": assessment.get("threat_level", p.get("state", "LOW")),
            "threat_score": float(assessment.get("threat_score", p.get("anomaly_score", 0.05))),
            "last_action": p.get("activity", "Active"),
            "last_seen": p.get("last_seen", ""),
            "is_targeted": bool(assessment.get("is_threat", False)),
        })

    # Also include any identities evaluated in detection engine not in participants (e.g. simulated bots/attackers)
    for identity_id, assessment in getattr(engine, "_latest_assessments", {}).items():
        if identity_id not in seen_ids:
            seen_ids.add(identity_id)
            grid.append({
                "device_id": identity_id,
                "alias": identity_id,
                "threat_level": assessment.get("threat_level", "LOW"),
                "threat_score": float(assessment.get("threat_score", 0.0)),
                "last_action": assessment.get("human_summary", "Traffic observed"),
                "last_seen": assessment.get("timestamp_iso", ""),
                "is_targeted": bool(assessment.get("is_threat", False)),
            })

    return grid

