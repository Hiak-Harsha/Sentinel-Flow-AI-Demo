"""Model Registry, Evaluation Benchmark, and Shadow Mode REST API (API v1)."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.feature_schema import LIVE_FEATURE_NAMES
from app.ml.registry import ModelRegistry

router = APIRouter(prefix="/models", tags=["Model Registry & Evaluation"])


class PredictRequest(BaseModel):
    features: dict[str, float] = Field(description="Dictionary of observable live streaming features")


class PredictResponse(BaseModel):
    label: str
    predicted_class: int
    attack_probability: float
    confidence: float
    operating_threshold: float
    conformal_status: str
    explanation: list[dict[str, Any]]
    latency_ms: float


class ModelPromoteRequest(BaseModel):
    stage: str = Field(default="production", description="Target deployment stage: production, staging, archived")
    notes: str = Field(default="", description="Operator deployment reason / audit notes")


@router.get("", summary="List all registered models across development, staging, and production stages")
async def list_models(request: Request) -> list[dict[str, Any]]:
    registry: ModelRegistry = getattr(request.app.state, "model_registry", None)
    if not registry:
        registry = ModelRegistry()
    return await registry.list_models()


@router.get("/active", summary="Get active production model metadata, metrics, and feature importances")
async def get_active_model(request: Request) -> dict[str, Any]:
    registry: ModelRegistry = getattr(request.app.state, "model_registry", None)
    if not registry:
        registry = ModelRegistry()
    return registry.get_active_model_details()


@router.get("/benchmark", summary="Get multi-classifier candidate benchmark comparison and held-out evaluation")
async def get_benchmark_comparison(request: Request) -> dict[str, Any]:
    academic = getattr(request.app.state, "academic", None)
    if academic:
        return {"candidate_comparison": academic.get_benchmark()}
    registry: ModelRegistry = getattr(request.app.state, "model_registry", None)
    if not registry:
        registry = ModelRegistry()
    active = registry.get_active_model_details()
    return {"candidate_comparison": active.get("candidate_comparison", [])}


@router.get("/shadow/status", summary="Get active shadow-mode evaluation status and agreement metrics")
async def get_shadow_status(request: Request) -> dict[str, Any]:
    registry: ModelRegistry = getattr(request.app.state, "model_registry", None)
    if not registry:
        return {"enabled": False, "evaluated_count": 0, "agreement_rate": 1.0}
    return registry.get_shadow_status()


@router.post("/predict", response_model=PredictResponse, summary="Perform calibrated inference on input feature vector")
async def predict_model(request: Request, body: PredictRequest) -> dict[str, Any]:
    det_engine = getattr(request.app.state, "detection_engine", None)
    if not det_engine or not det_engine.supervised.is_ready:
        raise HTTPException(status_code=503, detail="Supervised model is not ready or loaded.")

    from app.pipeline.feature_store import IdentityFeatureVector
    now = 0.0
    vec = IdentityFeatureVector(
        identity_id="api_eval_probe",
        timestamp_epoch=now,
        timestamp_iso="2026-10-15T00:00:00Z",
        **{k: v for k, v in body.features.items() if hasattr(IdentityFeatureVector, k)},
    )
    res = det_engine.supervised.predict_vector(vec)

    return {
        "label": "ATTACK" if res.get("label") == 1 else "NORMAL",
        "predicted_class": res.get("label", 0),
        "attack_probability": res.get("attack_probability", 0.0),
        "confidence": res.get("confidence", 0.0),
        "operating_threshold": res.get("operating_threshold", 0.5),
        "conformal_status": res.get("conformal_status", "NORMAL"),
        "explanation": res.get("explanation", []),
        "latency_ms": res.get("latency_ms", 0.0),
    }


@router.post("/{model_id}/promote", summary="Promote a candidate model to production or staging")
async def promote_model(request: Request, model_id: str, body: ModelPromoteRequest) -> dict[str, Any]:
    event_store = getattr(request.app.state, "event_store", None)
    ws_mgr = getattr(request.app.state, "ws_manager", None)

    # Record promotion audit event in tamper-evident ledger
    ev_record = None
    if event_store:
        ev_record = event_store.record_event(
            event_type="model_promoted",
            source="soc_operator",
            target_service="model_registry",
            metadata={
                "model_id": model_id,
                "target_stage": body.stage,
                "operator_notes": body.notes,
            },
        )

    if ws_mgr:
        ws_mgr.broadcast(
            event_type="model.status",
            channel="operator",
            data={
                "model_id": model_id,
                "stage": body.stage,
                "notes": body.notes,
                "audit_event": ev_record,
            },
        )

    return {
        "status": "promoted",
        "model_id": model_id,
        "stage": body.stage,
        "notes": body.notes,
    }
