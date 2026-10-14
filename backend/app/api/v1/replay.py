"""Replay control endpoints for streaming benchmark scenarios and labeled attacks."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/replay", tags=["Scenario Replay Engine"])


class StartReplayRequest(BaseModel):
    scenario: str = Field(default="benign_baseline", description="Replay scenario name")
    speed_multiplier: float = Field(default=1.0, ge=0.1, le=50.0, description="Playback speed factor")
    loop: bool = Field(default=True, description="Whether to loop continuously")
    actor_identity: str = Field(default="replay:simulated_device_01", description="Actor identity identifier")


@router.get("/status")
async def get_replay_status(request: Request) -> dict[str, Any]:
    """Retrieve status and available scenarios from the replay engine."""
    engine = getattr(request.app.state, "replay_engine", None)
    if engine is None:
        raise HTTPException(status_code=503, detail="Replay engine is not initialized")
    return engine.get_status()


@router.post("/start")
async def start_replay(request: Request, body: StartReplayRequest) -> dict[str, Any]:
    """Start or restart scenario playback streaming into the event bus."""
    engine = getattr(request.app.state, "replay_engine", None)
    if engine is None:
        raise HTTPException(status_code=503, detail="Replay engine is not initialized")

    engine.start(
        scenario=body.scenario,
        speed_multiplier=body.speed_multiplier,
        loop=body.loop,
        actor_identity=body.actor_identity,
    )
    return {"message": "Replay started", "status": engine.get_status()}


@router.post("/stop")
async def stop_replay(request: Request) -> dict[str, Any]:
    """Stop running scenario playback."""
    engine = getattr(request.app.state, "replay_engine", None)
    if engine is None:
        raise HTTPException(status_code=503, detail="Replay engine is not initialized")

    engine.stop()
    return {"message": "Replay stopped", "status": engine.get_status()}


@router.post("/pause")
async def pause_replay(request: Request) -> dict[str, Any]:
    """Pause scenario playback."""
    engine = getattr(request.app.state, "replay_engine", None)
    if engine is None:
        raise HTTPException(status_code=503, detail="Replay engine is not initialized")

    engine.pause()
    return {"message": "Replay paused", "status": engine.get_status()}


@router.post("/resume")
async def resume_replay(request: Request) -> dict[str, Any]:
    """Resume scenario playback."""
    engine = getattr(request.app.state, "replay_engine", None)
    if engine is None:
        raise HTTPException(status_code=503, detail="Replay engine is not initialized")

    engine.resume()
    return {"message": "Replay resumed", "status": engine.get_status()}
