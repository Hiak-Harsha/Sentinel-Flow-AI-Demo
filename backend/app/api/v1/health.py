"""Health and readiness probes for Sentinel Flow v3."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/health", tags=["Health & Probes"])


class LiveResponse(BaseModel):
    status: str = "alive"
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    version: str = "3.0.0"


class ComponentHealth(BaseModel):
    status: str
    details: dict[str, Any] = Field(default_factory=dict)


class ReadyResponse(BaseModel):
    status: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    version: str = "3.0.0"
    components: dict[str, ComponentHealth]


@router.get("/live", response_model=LiveResponse)
async def liveness_probe() -> LiveResponse:
    """Kubernetes / container liveness probe confirming process is responsive."""
    return LiveResponse(status="alive")


@router.get("/ready", response_model=ReadyResponse)
async def readiness_probe(request: Request, response: Response) -> ReadyResponse:
    """Readiness probe evaluating database, eventbus, models, and safety boundaries."""
    app_state = request.app.state
    components: dict[str, ComponentHealth] = {}
    is_ready = True

    # 1. Database check
    try:
        from app.db.session import get_session
        from sqlalchemy import text

        async with get_session() as session:
            await session.execute(text("SELECT 1"))
        components["database"] = ComponentHealth(status="healthy", details={"connected": True})
    except Exception as e:
        is_ready = False
        components["database"] = ComponentHealth(status="unhealthy", details={"error": str(e)})

    # 2. EventBus metrics
    event_bus = getattr(app_state, "event_bus", None)
    if event_bus is not None:
        try:
            metrics = await event_bus.get_metrics()
            components["event_bus"] = ComponentHealth(status="healthy", details=metrics)
        except Exception as e:
            components["event_bus"] = ComponentHealth(status="degraded", details={"error": str(e)})
    else:
        components["event_bus"] = ComponentHealth(status="healthy", details={"backend": "in_memory"})

    # 3. Model readiness
    academic = getattr(app_state, "academic", None)
    if academic is not None:
        model_status = academic.get_status()
        components["academic_model"] = ComponentHealth(
            status="healthy" if model_status.get("ready") else "warning",
            details=model_status,
        )
    else:
        components["academic_model"] = ComponentHealth(status="unknown", details={})

    # 4. Allowlist & Safety Boundary
    allowlist = getattr(app_state, "allowlist", None)
    if allowlist is not None:
        components["safety_boundary"] = ComponentHealth(
            status="healthy",
            details={
                "allowed_targets": allowlist.allowed_origins,
                "private_network_only": True,
            },
        )
    else:
        components["safety_boundary"] = ComponentHealth(status="unhealthy", details={"error": "no allowlist configured"})
        is_ready = False

    # 5. Host sensor
    host_sensor = getattr(app_state, "host_sensor", None)
    if host_sensor is not None:
        components["host_sensor"] = ComponentHealth(
            status="healthy",
            details={"enabled": host_sensor.enabled},
        )

    # 6. Replay engine
    replay_engine = getattr(app_state, "replay_engine", None)
    if replay_engine is not None:
        components["replay_engine"] = ComponentHealth(
            status="healthy",
            details=replay_engine.get_status(),
        )

    overall_status = "ready" if is_ready else "not_ready"
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return ReadyResponse(status=overall_status, components=components)
