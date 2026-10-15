"""Prometheus metrics endpoint for Sentinel Flow API v1."""

from __future__ import annotations

from fastapi import APIRouter, Response
from app.observability.metrics import get_metrics_payload

router = APIRouter(tags=["Observability & Metrics"])


@router.get("/metrics", summary="Prometheus formatted telemetry and system metrics")
def get_metrics() -> Response:
    """Return standard Prometheus text format telemetry metrics."""
    content, content_type = get_metrics_payload()
    return Response(content=content, media_type=content_type)
