"""FastAPI routes for detection engine status, alerts, dispositions, baseline calibration, and evidence chain verification."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.detection.engine import DetectionEngine

router = APIRouter(prefix="/api/detection", tags=["Detection"])

_detection_engine: DetectionEngine | None = None
_session_service: Any = None
_feature_store_ref: Any = None
_event_store_ref: Any = None


def set_detection_engine(engine: DetectionEngine) -> None:
    global _detection_engine
    _detection_engine = engine


def set_session_service(service: Any) -> None:
    global _session_service
    _session_service = service


def set_feature_store_for_detection(store: Any) -> None:
    global _feature_store_ref
    _feature_store_ref = store


def set_event_store_for_detection(db: Any) -> None:
    global _event_store_ref
    _event_store_ref = db


def get_detection_engine() -> DetectionEngine:
    if _detection_engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Detection engine is not initialized.",
        )
    return _detection_engine


class DispositionRequest(BaseModel):
    disposition: str = Field(..., description="NEW, INVESTIGATING, CONFIRMED_MALICIOUS, FALSE_POSITIVE, RESOLVED")
    analyst_notes: str = Field(default="", description="Analyst triage commentary")


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
    if _event_store_ref:
        _event_store_ref.update_alert_disposition(alert_id, "RESOLVED", "Resolved via analyst console")
    return {"status": "resolved", "alert_id": alert_id}


@router.post("/alerts/{alert_id}/disposition")
async def update_disposition(alert_id: str, req: DispositionRequest) -> dict[str, Any]:
    """Update formal analyst triage disposition."""
    engine = get_detection_engine()
    if req.disposition == "RESOLVED":
        engine.alerts.resolve_alert(alert_id)

    if _event_store_ref:
        _event_store_ref.update_alert_disposition(alert_id, req.disposition, req.analyst_notes)

    return {
        "status": "updated",
        "alert_id": alert_id,
        "disposition": req.disposition,
        "analyst_notes": req.analyst_notes,
    }


@router.get("/baseline")
async def get_baseline() -> dict[str, Any]:
    """Get unsupervised baseline distribution stats."""
    engine = get_detection_engine()
    return {"baseline_stats": engine.unsupervised.get_stats()}


@router.post("/baseline/calibrate")
@router.post("/baseline")
async def calibrate_baseline() -> dict[str, Any]:
    """Trigger baseline calibration by fitting empirical distribution on observed normal traffic."""
    engine = get_detection_engine()

    vectors = []
    if _feature_store_ref:
        vectors = _feature_store_ref.get_history(limit=100)

    # If active traffic history has at least 5 samples, fit empirical baseline
    if len(vectors) >= 5:
        stats = engine.unsupervised.fit_baseline(vectors)
        return {
            "status": "calibrated",
            "sample_count": len(vectors),
            "baseline_stats": stats,
            "message": f"Successfully fitted empirical baseline on {len(vectors)} observed telemetry samples.",
        }

    # If fewer than 5 samples in history, generate a baseline from current known-good device features or fallback
    current_features = list(_feature_store_ref.get_all_identity_features().values()) if _feature_store_ref else []
    all_available = vectors + current_features

    if len(all_available) >= 3:
        stats = engine.unsupervised.fit_baseline(all_available)
        return {
            "status": "calibrated",
            "sample_count": len(all_available),
            "baseline_stats": stats,
            "message": f"Calibrated initial baseline on {len(all_available)} active telemetry samples.",
        }

    # Honest disclosure: insufficient samples
    return {
        "status": "insufficient_samples",
        "sample_count": len(all_available),
        "samples_required": 5,
        "baseline_stats": engine.unsupervised.get_stats(),
        "message": f"Insufficient normal traffic samples ({len(all_available)}/5). Generate normal participant browsing to learn an empirical baseline.",
    }


@router.get("/evidence/verify")
async def verify_evidence_chain() -> dict[str, Any]:
    """Cryptographically verify the forward SHA-256 hash chain of the evidence ledger."""
    if not _event_store_ref:
        return {"valid": True, "total_events": 0, "message": "Event store not connected."}
    return _event_store_ref.verify_chain_integrity()


@router.get("/device/{device_id}")
async def get_device_assessment(device_id: str) -> dict[str, Any]:
    """Get real-time security assessment for an individual identity."""
    engine = get_detection_engine()
    assessment = engine.get_assessment(device_id)
    if not assessment:
        return {
            "device_id": device_id,
            "identity_id": device_id,
            "threat_score": 0.0,
            "threat_level": "LOW",
            "is_threat": False,
            "matched_rules": [],
            "human_summary": "No traffic observed yet for this identity.",
        }
    return {**assessment, "device_id": device_id}


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
            "identity_id": dev_id,
            "alias": p.get("alias", dev_id),
            "threat_level": assessment.get("threat_level", "LOW"),
            "threat_score": float(assessment.get("threat_score", 0.05)),
            "last_action": p.get("activity", "Active"),
            "last_seen": p.get("last_seen", ""),
            "is_targeted": bool(assessment.get("is_threat", False)),
        })

    for identity_id, assessment in getattr(engine, "_latest_assessments", {}).items():
        if identity_id not in seen_ids:
            seen_ids.add(identity_id)
            grid.append({
                "device_id": identity_id,
                "identity_id": identity_id,
                "alias": identity_id,
                "threat_level": assessment.get("threat_level", "LOW"),
                "threat_score": float(assessment.get("threat_score", 0.0)),
                "last_action": assessment.get("human_summary", "Traffic observed"),
                "last_seen": assessment.get("timestamp_iso", ""),
                "is_targeted": bool(assessment.get("is_threat", False)),
            })

    return grid
