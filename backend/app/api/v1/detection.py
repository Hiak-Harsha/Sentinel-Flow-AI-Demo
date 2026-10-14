"""Detection engine, alerts lifecycle, baseline calibration, and evidence chain verification."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Query, Request

from app.schemas.detection import (
    AlertDispositionRequest,
    AlertModel,
    ChainVerifyResponse,
    DetectionStatusResponse,
)

router = APIRouter(prefix="/detection", tags=["Detection & Evidence"])


@router.get("/status", response_model=DetectionStatusResponse, summary="Get global detection engine threat status")
async def get_detection_status(request: Request) -> dict[str, Any]:
    return request.app.state.detection_engine.get_status()


@router.get("/alerts", response_model=list[AlertModel], summary="List security alerts with optional disposition filter")
async def list_alerts(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    disposition: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    alerts = request.app.state.event_store.list_alerts(limit=limit)
    if disposition:
        alerts = [a for a in alerts if a.get("disposition", "").upper() == disposition.upper()]
    return alerts


@router.patch("/alerts/{alert_id}/disposition", summary="Update alert disposition and analyst investigation notes")
async def update_alert_disposition(
    request: Request,
    alert_id: str,
    body: AlertDispositionRequest,
) -> dict[str, Any]:
    event_store = request.app.state.event_store
    ws_mgr = getattr(request.app.state, "ws_manager", None)

    updated = event_store.update_alert_disposition(
        alert_id=alert_id,
        disposition=body.disposition.upper(),
        notes=body.notes,
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found.")

    # Record disposition event in cryptographic ledger
    ev_record = event_store.record_event(
        event_type="alert_disposition_updated",
        source="soc_analyst",
        target_service="alerts_workbench",
        metadata={
            "alert_id": alert_id,
            "disposition": body.disposition.upper(),
            "analyst_notes": body.notes,
        },
    )

    if ws_mgr:
        ws_mgr.broadcast(
            event_type="alert.updated",
            channel="operator",
            data={
                "alert_id": alert_id,
                "disposition": body.disposition.upper(),
                "notes": body.notes,
                "ledger_event": ev_record,
            },
        )

    return {
        "status": "ok",
        "alert_id": alert_id,
        "disposition": body.disposition.upper(),
        "notes": body.notes,
    }


@router.get("/chain/verify", response_model=ChainVerifyResponse, summary="Verify cryptographic SHA-256 evidence chain integrity")
@router.get("/evidence/verify", response_model=ChainVerifyResponse, summary="Verify cryptographic SHA-256 evidence chain integrity")
async def verify_evidence_chain(request: Request) -> dict[str, Any]:
    return request.app.state.event_store.verify_chain_integrity()


@router.post("/baseline/calibrate", summary="Calibrate detection baseline metrics")
async def calibrate_baseline(request: Request) -> dict[str, Any]:
    pipeline = request.app.state.feature_pipeline
    det_engine = request.app.state.detection_engine

    snapshot = pipeline.compute_network_snapshot()
    det_engine.unsupervised_detector.update_baseline(snapshot)
    return {
        "status": "calibrated",
        "baseline_stats": det_engine.get_status().get("baseline_stats", {}),
    }
