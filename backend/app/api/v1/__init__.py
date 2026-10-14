"""API v1 master router aggregating all domain sub-routers."""

from __future__ import annotations

from fastapi import APIRouter

from .detection import router as detection_router
from .health import router as health_router
from .orchestrator import router as orchestrator_router
from .overview import router as overview_router
from .replay import router as replay_router
from .sensor import router as sensor_router
from .sessions import router as sessions_router
from .targets import router as targets_router
from .ws_ticket import router as ws_ticket_router
from app.identity.routes import router as identity_router
from app.pipeline.routes import router as pipeline_router

v1_router = APIRouter(prefix="/api/v1")

v1_router.include_router(health_router)
v1_router.include_router(overview_router)
v1_router.include_router(sessions_router)
v1_router.include_router(detection_router)
v1_router.include_router(orchestrator_router)
v1_router.include_router(targets_router)
v1_router.include_router(ws_ticket_router)
v1_router.include_router(replay_router)
v1_router.include_router(sensor_router)
v1_router.include_router(identity_router)
v1_router.include_router(pipeline_router)
