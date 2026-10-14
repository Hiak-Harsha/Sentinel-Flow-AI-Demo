"""Host flow sensor endpoints for strictly local socket & connection monitoring."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/sensor", tags=["Host Sensor"])


@router.get("/status")
async def get_sensor_status(request: Request) -> dict[str, Any]:
    """Retrieve host flow sensor status."""
    sensor = getattr(request.app.state, "host_sensor", None)
    if sensor is None:
        raise HTTPException(status_code=503, detail="Host sensor is not initialized")
    return {
        "enabled": sensor.enabled,
        "sample_interval_seconds": sensor.sample_interval,
        "is_sampling": sensor._task is not None and not sensor._task.done(),
    }


@router.post("/sample")
async def sample_host_metrics(request: Request) -> dict[str, Any]:
    """Sample instantaneous local machine psutil counters (local boundary only)."""
    sensor = getattr(request.app.state, "host_sensor", None)
    if sensor is None:
        raise HTTPException(status_code=503, detail="Host sensor is not initialized")
    metrics = sensor.sample_now()
    return {"metrics": metrics}
