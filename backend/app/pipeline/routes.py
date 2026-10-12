"""FastAPI routes for inspecting real-time computed features."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, status

from app.pipeline.feature_pipeline import FeaturePipeline
from app.pipeline.feature_store import FeatureStore

router = APIRouter(prefix="/api/features", tags=["Feature Pipeline"])

_pipeline_instance: FeaturePipeline | None = None


def set_feature_pipeline(pipeline: FeaturePipeline) -> None:
    global _pipeline_instance
    _pipeline_instance = pipeline


def _get_pipeline() -> FeaturePipeline:
    if _pipeline_instance is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Feature pipeline is not initialized.",
        )
    return _pipeline_instance


@router.get("")
async def get_all_features() -> dict[str, Any]:
    """Return latest feature vectors for all active identities."""
    pipeline = _get_pipeline()
    return {
        "identities": pipeline.store.get_all_identity_features(),
        "network": pipeline.store.get_network_snapshot(),
    }


@router.get("/network/snapshot")
async def get_network_feature_snapshot() -> dict[str, Any]:
    """Return aggregate network telemetry snapshot."""
    pipeline = _get_pipeline()
    return pipeline.compute_network_snapshot()


@router.get("/{identity_id}")
@router.get("/debug/{identity_id}")
async def get_identity_features(identity_id: str) -> dict[str, Any]:
    """Inspect calculated streaming feature vector for a specific identity."""
    pipeline = _get_pipeline()
    vector = pipeline.compute_features_for_identity(identity_id)
    return {
        "identity_id": identity_id,
        "features": vector.to_dict(),
        "history": pipeline.store.get_history(identity_id=identity_id, limit=20),
    }
