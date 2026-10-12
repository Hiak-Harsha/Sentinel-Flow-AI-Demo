"""Sentinel Flow: Cybersecurity AI Intrusion & Behavioural Anomaly Detection API."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import (
    ALLOWED_ORIGINS,
    ARTIFACT_DIR,
    DEFAULT_TARGET_URL,
    PROXY_TIMEOUT_SECONDS,
    TARGET_CONFIG_PATH,
    ensure_runtime_directories,
)
from .detection.engine import DetectionEngine
from .detection.routes import router as detection_router, set_detection_engine, set_session_service
from .identity.identity_resolver import IdentityResolver
from .identity.routes import router as identity_router, init_identity_system
from .identity.session_manager import SessionManager
from .orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer
from .orchestrator.consent_gate import ConsentGate
from .orchestrator.routes import router as orchestrator_router, set_run_manager
from .orchestrator.run_manager import RunManager
from .pipeline.feature_pipeline import FeaturePipeline
from .pipeline.feature_store import FeatureStore
from .pipeline.routes import router as pipeline_router, set_feature_pipeline
from .proxy.allowlist import TargetAllowlist, load_allowlist_from_config
from .proxy.reverse_proxy import get_proxy_handler, init_proxy_handler, proxy_router
from .proxy.session_bridge import SessionBridge
from .proxy.traffic_logger import TrafficLogger
from .proxy.webhook_receiver import router as webhook_router, set_webhook_traffic_logger
from .services.academic_model_service import AcademicModelService
from .services.session_service import SessionService


class ConnectionHub:
    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        if not self.connections:
            return

        async def _safe_send(ws: WebSocket) -> None:
            try:
                await asyncio.wait_for(ws.send_json(message), timeout=0.15)
            except Exception:
                self.disconnect(ws)

        await asyncio.gather(*(_safe_send(c) for c in list(self.connections)), return_exceptions=True)

    def broadcast_nowait(self, message: dict[str, Any]) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.broadcast(message))
        except RuntimeError:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_runtime_directories()
    hub = ConnectionHub()
    sessions = SessionService()
    academic = AcademicModelService(ARTIFACT_DIR)

    # 1. Initialize Reverse Proxy & Safety Allowlist
    try:
        allowlist = load_allowlist_from_config(TARGET_CONFIG_PATH)
    except Exception:
        allowlist = TargetAllowlist([DEFAULT_TARGET_URL])

    traffic_logger = TrafficLogger()
    session_bridge = SessionBridge()
    proxy_handler = init_proxy_handler(
        allowlist=allowlist,
        traffic_logger=traffic_logger,
        session_bridge=session_bridge,
        default_target=DEFAULT_TARGET_URL,
        timeout=PROXY_TIMEOUT_SECONDS,
    )
    set_webhook_traffic_logger(traffic_logger)

    # 2. Initialize Streaming Feature Pipeline & Store
    feature_store = FeatureStore()
    feature_pipeline = FeaturePipeline(traffic_logger=traffic_logger, feature_store=feature_store)
    set_feature_pipeline(feature_pipeline)

    # 3. Initialize Multi-Layer Detection Engine
    detection_engine = DetectionEngine()
    set_detection_engine(detection_engine)
    set_session_service(sessions)

    # 4. Initialize Identity & Device Fingerprint Resolver
    session_manager, identity_resolver = init_identity_system()

    # 5. Initialize Attack Orchestrator & Safety Gate
    orch_enforcer = OrchestratorAllowlistEnforcer(allowlist)
    consent_gate = ConsentGate(orch_enforcer)
    run_manager = RunManager(
        orch_enforcer,
        consent_gate,
        traffic_logger=traffic_logger,
        detection_engine=detection_engine,
    )
    set_run_manager(run_manager)

    # Auto-grant lab consent for default target so local demo works seamlessly
    consent_gate.grant_consent(
        target_origin=DEFAULT_TARGET_URL,
        operator_name="Lab Operator",
        confirmed_ownership=True,
    )

    # Auto-initialize an active session so app is ready out of the box
    sessions.create_session()

    # Wire Feature Pipeline -> Detection Engine -> WebSocket Hub
    def on_feature_vector(vec):
        assessment = detection_engine.evaluate_vector(vec)
        hub.broadcast_nowait({
            "type": "assessment_update",
            "identity_id": vec.identity_id,
            "assessment": assessment,
            "features": vec.to_dict(),
            "threat_level": detection_engine.get_global_threat_level(),
        })
        if assessment.get("is_threat"):
            hub.broadcast_nowait({
                "type": "alert_raised",
                "alert": assessment.get("raised_alert"),
                "assessment": assessment,
            })

    feature_pipeline.add_listener(on_feature_vector)

    # Wire Attack Orchestrator Progress -> WebSocket Hub
    run_manager.add_listener(lambda data: hub.broadcast_nowait(data))

    app.state.hub = hub
    app.state.sessions = sessions
    app.state.academic = academic
    app.state.allowlist = allowlist
    app.state.traffic_logger = traffic_logger
    app.state.session_bridge = session_bridge
    app.state.proxy_handler = proxy_handler
    app.state.feature_store = feature_store
    app.state.feature_pipeline = feature_pipeline
    app.state.detection_engine = detection_engine
    app.state.session_manager = session_manager
    app.state.identity_resolver = identity_resolver
    app.state.run_manager = run_manager

    # Start periodic telemetry broadcaster background task
    async def periodic_telemetry_broadcaster():
        while True:
            await asyncio.sleep(1.0)
            try:
                snapshot = feature_pipeline.compute_network_snapshot()
                det_status = detection_engine.get_status()
                proxy_snap = traffic_logger.snapshot()
                await hub.broadcast({
                    "type": "telemetry_update",
                    "telemetry": snapshot,
                    "proxy": proxy_snap,
                    "threat_level": det_status["threat_level"],
                    "active_detections": det_status["active_detections"],
                })
            except Exception:
                pass

    broadcaster_task = asyncio.create_task(periodic_telemetry_broadcaster())
    yield
    broadcaster_task.cancel()
    await proxy_handler.close()


app = FastAPI(
    title="Sentinel Flow API",
    version="2.0.0",
    description="Real-Time Network Intrusion & Behavioural Anomaly Detection Platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(proxy_router)
app.include_router(webhook_router)
app.include_router(pipeline_router)
app.include_router(identity_router)
app.include_router(detection_router)
app.include_router(orchestrator_router)




# Request schemas
class CreateSessionRequest(BaseModel):
    pass


class JoinSessionRequest(BaseModel):
    join_code: Annotated[str, Field(min_length=4, max_length=12)]
    alias: Annotated[str, Field(min_length=1, max_length=32)]


class ActivityRequest(BaseModel):
    device_id: str
    action: str
    is_burst: bool = False
    bytes_in: int = 128
    bytes_out: int = 1024


class ControlledTargetRequest(BaseModel):
    device_id: str | None = None


# Helpers
def _hub() -> ConnectionHub:
    return app.state.hub


def _sessions() -> SessionService:
    return app.state.sessions


def _feature_pipeline() -> FeaturePipeline:
    return app.state.feature_pipeline


def _detection_engine() -> DetectionEngine:
    return app.state.detection_engine


def _academic() -> AcademicModelService:
    return app.state.academic


# Health & Core Overview
@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "platform": "Sentinel Flow 2.0"}


@app.get("/api/overview")
async def get_overview() -> dict[str, Any]:
    session = _sessions().get_current_session()
    participants = _sessions().get_participants()
    telemetry_snap = _feature_pipeline().compute_network_snapshot()
    detection_status = _detection_engine().get_status()
    academic_status = _academic().get_status()

    return {
        "session": session,
        "participants_count": len(participants),
        "threat_level": detection_status["threat_level"],
        "active_devices": telemetry_snap["active_devices"],
        "requests_per_sec": telemetry_snap["requests_per_sec"],
        "active_alerts": detection_status["active_detections"],
        "academic_model_ready": academic_status["ready"],
        "network_snapshot": telemetry_snap,
    }


# Session Management
@app.post("/api/sessions")
async def create_session() -> dict[str, Any]:
    session = _sessions().create_session()
    _hub().broadcast_nowait({"type": "session_created", "session": session})
    return session


@app.get("/api/session")
@app.get("/api/sessions/current")
async def get_current_session() -> dict[str, Any]:
    session = _sessions().get_current_session()
    participants = _sessions().get_participants()
    detection_status = _detection_engine().get_status()
    academic_status = _academic().get_status()
    telemetry_snap = _feature_pipeline().compute_network_snapshot()
    return {
        "session": session,
        "participants": participants,
        "threat_level": detection_status["threat_level"],
        "active_detections": detection_status["active_detections"],
        "baseline_stats": detection_status["baseline_stats"],
        "model": academic_status,
        "telemetry": telemetry_snap,
    }


@app.post("/api/sessions/join")
async def join_session(request: JoinSessionRequest) -> dict[str, Any]:
    try:
        participant = _sessions().join_participant(request.join_code, request.alias)
        # Log join activity into traffic logger
        app.state.traffic_logger.log(
            identity_id=participant["device_id"],
            method="POST",
            path="/session/join",
            status_code=200,
            request_size_bytes=128,
            response_size_bytes=512,
            latency_ms=15.0,
            target_origin=DEFAULT_TARGET_URL,
            user_agent="SentinelFlow-ParticipantApp",
        )
        _hub().broadcast_nowait({
            "type": "participant_joined",
            "participant": participant,
            "session": _sessions().get_current_session(),
        })
        return participant
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/sessions/participants")
async def get_participants() -> dict[str, Any]:
    return {"participants": _sessions().get_participants()}


@app.post("/api/sessions/controlled-target")
async def set_controlled_target(request: ControlledTargetRequest) -> dict[str, Any]:
    _sessions().set_controlled_target(request.device_id)
    session = _sessions().get_current_session()
    _hub().broadcast_nowait({"type": "session_phase_changed", "session": session})
    return {"status": "ok", "controlled_target": request.device_id}


# Participant Activity & Presence Ingestion (session bookkeeping only)
@app.post("/api/activity")
async def record_activity(request: ActivityRequest) -> dict[str, Any]:
    """Record participant activity for session presence tracking. Real traffic flows via /proxy/*."""
    device_id = request.device_id
    action = request.action

    p = _sessions().record_participant_activity(device_id, action)

    assessment = _detection_engine().get_assessment(device_id) or {
        "identity_id": device_id,
        "threat_score": 0.05,
        "threat_level": "LOW",
        "is_threat": False,
        "matched_rules": [],
        "human_summary": "Normal activity recorded.",
    }

    return {
        "status": "recorded",
        "participant": p,
        "assessment": assessment,
    }


# Telemetry Stats & Timeseries
@app.get("/api/telemetry/stats")
async def get_telemetry_stats() -> dict[str, Any]:
    return _feature_pipeline().compute_network_snapshot()


@app.get("/api/telemetry/timeseries")
async def get_telemetry_timeseries() -> dict[str, Any]:
    return {"timeseries": app.state.feature_store.get_history(limit=50)}


# Academic Supervised Model (UNSW-NB15)
@app.get("/api/academic-model/status")
async def get_academic_model_status() -> dict[str, Any]:
    return _academic().get_status()


@app.get("/api/academic-model/benchmark")
async def get_academic_model_benchmark() -> dict[str, Any]:
    return {"benchmark": _academic().get_status().get("metrics")}


@app.post("/api/academic-model/predict")
async def predict_academic_flow(features: dict[str, float]) -> dict[str, Any]:
    return _academic().predict(features)


# Past Sessions History
@app.get("/api/history")
async def get_history() -> dict[str, Any]:
    return {"history": _sessions().get_history()}


# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    hub = _hub()
    await hub.connect(websocket)
    try:
        session = _sessions().get_current_session()
        participants = _sessions().get_participants()
        status = _detection_engine().get_status()
        telemetry_snap = _feature_pipeline().compute_network_snapshot()
        await websocket.send_json({
            "type": "initial_state",
            "session": session,
            "participants": participants,
            "threat_level": status["threat_level"],
            "baseline_stats": status["baseline_stats"],
            "telemetry": telemetry_snap,
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(websocket)
    except Exception:
        hub.disconnect(websocket)

