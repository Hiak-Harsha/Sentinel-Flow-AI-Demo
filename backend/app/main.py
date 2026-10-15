"""Sentinel Flow: Cybersecurity AI Intrusion & Behavioural Anomaly Detection API."""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .api.v1 import v1_router
from .config import (
    ALLOWED_ORIGINS,
    ARTIFACT_DIR,
    DATABASE_PATH,
    DEFAULT_TARGET_URL,
    EVIDENCE_LEDGER_PATH,
    PROXY_TIMEOUT_SECONDS,
    TARGET_CONFIG_PATH,
    ensure_runtime_directories,
    settings,
    validate_safety_configuration,
)
from .logging_config import setup_structured_logging
from .middleware.request_context import register_error_handlers, request_id_middleware
from .middleware.security import request_size_limit_middleware, security_headers_middleware
from .ws.connection_manager import WebSocketManager

logger = setup_structured_logging(json_format=settings.is_production)
from .database import EventStore
from .detection.engine import DetectionEngine
from .detection.routes import (
    router as detection_router,
    set_detection_engine,
    set_event_store_for_detection,
    set_feature_store_for_detection,
    set_session_service,
)
from .identity.identity_resolver import IdentityResolver
from .identity.routes import router as identity_router, init_identity_system
from .identity.session_manager import SessionManager
from .lab_target import router as lab_target_router, set_lab_event_emitter
from .orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer
from .orchestrator.consent_gate import ConsentGate
from .orchestrator.routes import router as orchestrator_router, set_run_manager
from .orchestrator.run_manager import RunManager
from .pipeline.event_bus import HybridEventBus
from .pipeline.feature_pipeline import FeaturePipeline
from .pipeline.feature_store import FeatureStore
from .pipeline.replay import ReplayEngine
from .pipeline.routes import router as pipeline_router, set_feature_pipeline
from .proxy.allowlist import TargetAllowlist, load_allowlist_from_config
from .proxy.reverse_proxy import get_proxy_handler, init_proxy_handler, proxy_router
from .proxy.session_bridge import SessionBridge
from .proxy.traffic_logger import TrafficLogger
from .proxy.webhook_receiver import router as webhook_router, set_webhook_traffic_logger
from .schemas.events import NormalizedEvent
from .sensors.host_flow import HostFlowSensor
from .db.session import close_db, init_db
from .repositories import (
    DetectionRepository,
    EventRepository,
    IdentityRepository,
    OrchestratorRepository,
    SessionRepository,
)
from .ml.registry import ModelRegistry
from .services.academic_model_service import AcademicModelService
from .services.rollup_worker import start_rollup_worker, stop_rollup_worker
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
    validate_safety_configuration()
    ensure_runtime_directories()
    await init_db()

    session_repo = SessionRepository()
    identity_repo = IdentityRepository()
    event_repo = EventRepository()
    detection_repo = DetectionRepository()
    orch_repo = OrchestratorRepository()

    hub = ConnectionHub()
    ws_manager = WebSocketManager()
    sessions = SessionService(repo=session_repo)
    await sessions.load_from_db()
    academic = AcademicModelService(ARTIFACT_DIR)
    model_registry = ModelRegistry(ARTIFACT_DIR)
    await model_registry.sync_from_db()
    event_store = EventStore(EVIDENCE_LEDGER_PATH)

    # Initialize EventBus (Redis Streams with automatic In-Memory fallback)
    event_bus = HybridEventBus(redis_url=settings.redis_url)
    await event_bus.initialize()

    # Initialize Scenario Replay Engine
    replay_engine = ReplayEngine(
        event_callback=lambda ev: asyncio.create_task(event_bus.publish(ev))
    )

    # Initialize Host Flow Sensor (local socket counters, strict opt-in)
    host_sensor = HostFlowSensor(
        enabled=settings.enable_host_sensor,
        event_callback=lambda ev: asyncio.create_task(event_bus.publish(ev)),
    )
    if host_sensor.enabled:
        host_sensor.start()

    # 1. Initialize Reverse Proxy & Safety Allowlist (Private Network Boundary)
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
    feature_store = FeatureStore(repo=event_repo)
    await feature_store.load_from_db()
    feature_pipeline = FeaturePipeline(traffic_logger=traffic_logger, feature_store=feature_store)
    set_feature_pipeline(feature_pipeline)

    # 3. Initialize Multi-Layer Detection Engine
    detection_engine = DetectionEngine(repo=detection_repo)
    await detection_engine.load_from_db()
    detection_engine.supervised.set_registry(model_registry)
    set_detection_engine(detection_engine)
    set_session_service(sessions)
    set_feature_store_for_detection(feature_store)
    set_event_store_for_detection(event_store)

    # 4. Initialize Identity & Device Fingerprint Resolver
    session_manager, identity_resolver = init_identity_system(repo=identity_repo)
    await session_manager.load_from_db()

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

    # Record verified authorization consent from config if signed record exists
    auth_rec = getattr(allowlist, "authorization_record", {})
    if auth_rec and auth_rec.get("confirmed_ownership"):
        consent_gate.grant_consent(
            target_origin=DEFAULT_TARGET_URL,
            operator_name=auth_rec.get("operator_name", "Lab Administrator"),
            confirmed_ownership=True,
        )

    # Initialize active session
    if not sessions.active_session:
        await sessions.create_session_async()
    curr_sess = sessions.get_current_session()

    # Connect Built-In Disposable Lab Target Event Emitter
    def on_lab_event(event_dict: dict[str, Any]) -> None:
        event_type = event_dict["event_type"]
        actor = event_dict["actor_id"]
        path = event_dict["path"]
        st_code = event_dict["status_code"]
        meta = event_dict["metadata"]

        ev_rec = event_store.record_event(
            session_id=curr_sess.get("id", "session_default"),
            event_type=event_type,
            source="lab_target",
            actor_principal=actor,
            target_service=DEFAULT_TARGET_URL,
            metadata=meta,
        )

        traffic_logger.log(
            identity_id=actor,
            method="LAB_EVENT",
            path=path,
            status_code=st_code,
            request_size_bytes=len(str(meta)),
            response_size_bytes=128,
            latency_ms=1.5,
            target_origin=DEFAULT_TARGET_URL,
            user_agent="SentinelFlow-DisposableTarget/1.0",
        )

        norm_event = NormalizedEvent(
            identity_id=actor,
            method="LAB_EVENT",
            path_template=path,
            status_code=st_code,
            bytes_in=len(str(meta)),
            bytes_out=128,
            latency_ms=1.5,
            source="lab_target",
            provenance="live",
            session_id=curr_sess.get("id"),
            metadata=meta,
        )
        asyncio.create_task(event_bus.publish(norm_event))

        hub.broadcast_nowait({
            "type": "causal_activity",
            "event": ev_rec,
        })

    set_lab_event_emitter(on_lab_event)

    # Wire Feature Pipeline -> Detection Engine -> WebSocket Hub & EventStore
    def on_feature_vector(vec):
        assessment = detection_engine.evaluate_vector(vec)
        threat_level = detection_engine.get_global_threat_level()
        data = {
            "identity_id": vec.identity_id,
            "assessment": assessment,
            "features": vec.to_dict(),
            "threat_level": threat_level,
        }
        ws_manager.broadcast(
            event_type="assessment.updated",
            channel="operator",
            data=data,
            provenance="live",
        )
        ws_manager.broadcast(
            event_type="assessment.updated",
            channel=f"participant:{vec.identity_id}",
            data=data,
            provenance="live",
        )
        hub.broadcast_nowait({
            "type": "assessment_update",
            **data,
        })
        if assessment.get("is_threat"):
            raised = assessment.get("raised_alert") or {
                "id": f"alt_{vec.identity_id}_{int(vec.timestamp_epoch)}",
                "alert_id": f"alt_{vec.identity_id}_{int(vec.timestamp_epoch)}",
                "identity_id": vec.identity_id,
                "threat_score": assessment.get("threat_score", 0.8),
                "severity": assessment.get("threat_level", "HIGH"),
                "name": assessment.get("human_summary", "Security Anomaly"),
                "rule_id": assessment.get("matched_rules", ["ANOMALY"])[0] if assessment.get("matched_rules") else "ANOMALY",
                "evidence": assessment.get("rule_details", []),
            }
            event_store.save_alert(raised)
            ws_manager.broadcast(
                event_type="alert.raised",
                channel="operator",
                data={"alert": raised, "assessment": assessment},
                provenance="live",
            )
            hub.broadcast_nowait({
                "type": "alert_raised",
                "alert": raised,
                "assessment": assessment,
            })

    feature_pipeline.add_listener(on_feature_vector)

    # Connect traffic_logger listener to also record events into tamper-evident ledger
    def on_raw_traffic(record):
        ev_rec = event_store.record_event(
            session_id=curr_sess.get("id", "session_default"),
            event_type="http_request",
            source="reverse_proxy",
            actor_principal=record.identity_id,
            target_service=record.target_origin or DEFAULT_TARGET_URL,
            metadata={
                "method": record.method,
                "path": record.path,
                "status_code": record.status_code,
                "latency_ms": record.latency_ms,
                "attack_run_id": record.attack_run_id,
            },
        )
        norm_event = NormalizedEvent(
            identity_id=record.identity_id,
            method=record.method,
            path_template=record.path,
            status_code=record.status_code,
            bytes_in=record.request_size_bytes,
            bytes_out=record.response_size_bytes,
            latency_ms=record.latency_ms,
            source="reverse_proxy",
            provenance="simulated" if record.attack_run_id else "live",
            client_fingerprint=record.fingerprint_hash,
            user_agent=record.user_agent,
            session_id=curr_sess.get("id"),
            metadata={"attack_run_id": record.attack_run_id} if record.attack_run_id else {},
        )
        asyncio.create_task(event_bus.publish(norm_event))

        ws_manager.broadcast(
            event_type="causal.activity",
            channel="operator",
            data=ev_rec,
            provenance="live",
        )
        hub.broadcast_nowait({
            "type": "causal_activity",
            "event": ev_rec,
        })

    traffic_logger.add_listener(on_raw_traffic)

    # Wire Attack Orchestrator Progress -> WebSocket Manager & Hub
    def on_orchestrator_event(data):
        ws_type = data.get("type", "attack.progress")
        if ws_type == "attack_progress":
            ev_type = "attack.progress"
        elif ws_type == "attack_effect":
            ev_type = "attack.effect"
        elif ws_type == "attack_finished":
            ev_type = "attack.finished"
        elif ws_type == "emergency_stop":
            ev_type = "emergency_stop.engaged"
        elif ws_type == "emergency_stop_reset":
            ev_type = "emergency_stop.reset"
        else:
            ev_type = ws_type

        ws_manager.broadcast(
            event_type=ev_type,
            channel="public" if "emergency_stop" in ev_type else "operator",
            data=data,
            provenance="simulated" if "attack" in ev_type else "live",
        )
        hub.broadcast_nowait(data)

    run_manager.add_listener(on_orchestrator_event)

    # EventBus background consumer tasks
    async def feature_builder_consumer():
        async for event in event_bus.subscribe(consumer_group="feature-builder", consumer_name="worker-1"):
            try:
                if event.source != "reverse_proxy":
                    feature_pipeline.on_normalized_event(event)
            except Exception:
                logger.exception("Error in feature_builder_consumer")

    async def ws_fanout_consumer():
        async for event in event_bus.subscribe(consumer_group="ws-fanout", consumer_name="worker-1"):
            try:
                if event.source in ("replay", "host_sensor"):
                    ev_dict = {
                        "id": event.id,
                        "timestamp": event.ts.isoformat(),
                        "source": event.source,
                        "actor_principal": event.identity_id,
                        "method": event.method,
                        "path": event.path_template,
                        "status_code": event.status_code,
                        "bytes_in": event.bytes_in,
                        "bytes_out": event.bytes_out,
                        "latency_ms": event.latency_ms,
                    }
                    ws_manager.broadcast(
                        event_type="causal.activity",
                        channel="operator",
                        data=ev_dict,
                        provenance=event.provenance,
                    )
                    hub.broadcast_nowait({
                        "type": "causal_activity",
                        "event": ev_dict,
                    })
            except Exception:
                logger.exception("Error in ws_fanout_consumer")

    fb_consumer_task = asyncio.create_task(feature_builder_consumer())
    ws_fanout_task = asyncio.create_task(ws_fanout_consumer())

    app.state.hub = hub
    app.state.ws_manager = ws_manager
    app.state.sessions = sessions
    app.state.academic = academic
    app.state.allowlist = allowlist
    app.state.traffic_logger = traffic_logger
    app.state.session_bridge = session_bridge
    app.state.proxy_handler = proxy_handler
    app.state.feature_store = feature_store
    app.state.feature_pipeline = feature_pipeline
    app.state.detection_engine = detection_engine
    app.state.academic = academic
    app.state.model_registry = model_registry
    app.state.session_manager = session_manager
    app.state.identity_resolver = identity_resolver
    app.state.run_manager = run_manager
    app.state.event_store = event_store
    app.state.session_repo = session_repo
    app.state.identity_repo = identity_repo
    app.state.event_repo = event_repo
    app.state.detection_repo = detection_repo
    app.state.orch_repo = orch_repo
    app.state.event_bus = event_bus
    app.state.host_sensor = host_sensor
    app.state.replay_engine = replay_engine

    # Start periodic telemetry broadcaster background task
    health_tick_counter = 0

    async def periodic_telemetry_broadcaster():
        nonlocal health_tick_counter
        while True:
            await asyncio.sleep(1.0)
            try:
                snapshot = feature_pipeline.compute_network_snapshot()
                det_status = detection_engine.get_status()
                proxy_snap = traffic_logger.snapshot()
                payload = {
                    "telemetry": snapshot,
                    "proxy": proxy_snap,
                    "threat_level": det_status["threat_level"],
                    "active_detections": det_status["active_detections"],
                }
                ws_manager.broadcast(
                    event_type="telemetry.tick",
                    channel="public",
                    data=payload,
                    provenance="live",
                )
                await hub.broadcast({
                    "type": "telemetry_update",
                    **payload,
                })

                health_tick_counter += 1
                if health_tick_counter % 5 == 0:
                    bus_metrics = await event_bus.get_metrics()
                    ws_manager.broadcast(
                        event_type="system.health",
                        channel="operator",
                        data={
                            "status": "healthy",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "event_bus": bus_metrics,
                            "threat_level": det_status["threat_level"],
                            "active_devices": snapshot["active_devices"],
                        },
                        provenance="live",
                    )
            except Exception:
                pass

    broadcaster_task = asyncio.create_task(periodic_telemetry_broadcaster())
    rollup_task = start_rollup_worker(event_repo=event_repo, retention_days=7)

    yield

    replay_engine.stop()
    if host_sensor.enabled:
        await host_sensor.stop()
    fb_consumer_task.cancel()
    ws_fanout_task.cancel()
    broadcaster_task.cancel()
    try:
        await asyncio.gather(
            fb_consumer_task,
            ws_fanout_task,
            broadcaster_task,
            return_exceptions=True,
        )
    except Exception:
        pass
    await event_bus.close()
    await stop_rollup_worker()
    await proxy_handler.close()
    await close_db()


app = FastAPI(
    title="Sentinel Flow API",
    version="3.0.0",
    description="Real-Time Network Intrusion & Behavioural Anomaly Detection Platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_origin_regex=settings.get_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(request_id_middleware)
app.middleware("http")(security_headers_middleware)
app.middleware("http")(request_size_limit_middleware)


@app.middleware("http")
async def metrics_middleware(request, call_next):
    from app.observability.metrics import record_http_request
    t0 = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - t0
    record_http_request(request.method, request.url.path, response.status_code, duration)
    return response


register_error_handlers(app)


@app.get("/metrics", include_in_schema=False)
def prometheus_metrics():
    from app.observability.metrics import get_metrics_payload
    from fastapi import Response
    content, content_type = get_metrics_payload()
    return Response(content=content, media_type=content_type)


# Canonical API v1
app.include_router(v1_router)

# Supporting & Legacy Domain Routers
app.include_router(lab_target_router)
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


def _event_store() -> EventStore:
    return app.state.event_store


# Health & Core Overview
@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "platform": "Sentinel Flow 2.0 (Verified Lab Architecture)"}


@app.get("/api/overview")
async def get_overview() -> dict[str, Any]:
    session = _sessions().get_current_session()
    participants = _sessions().get_participants()
    telemetry_snap = _feature_pipeline().compute_network_snapshot()
    detection_status = _detection_engine().get_status()
    academic_status = _academic().get_status()
    recent_events = _event_store().list_recent_events(limit=20)
    integrity = _event_store().verify_chain_integrity()

    return {
        "session": session,
        "participants_count": len(participants),
        "threat_level": detection_status["threat_level"],
        "active_devices": telemetry_snap["active_devices"],
        "requests_per_sec": telemetry_snap["requests_per_sec"],
        "active_alerts": detection_status["active_detections"],
        "academic_model_ready": academic_status["ready"],
        "network_snapshot": telemetry_snap,
        "recent_activity": recent_events,
        "evidence_integrity": integrity,
    }


# Session Management
@app.post("/api/sessions")
async def create_session() -> dict[str, Any]:
    session = await _sessions().create_session_async()
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
    recent_events = _event_store().list_recent_events(limit=25)
    return {
        "session": session,
        "participants": participants,
        "threat_level": detection_status["threat_level"],
        "active_detections": detection_status["active_detections"],
        "baseline_stats": detection_status["baseline_stats"],
        "model": academic_status,
        "telemetry": telemetry_snap,
        "recent_activity": recent_events,
    }


@app.post("/api/sessions/join")
async def join_session(request: JoinSessionRequest) -> dict[str, Any]:
    try:
        participant = await _sessions().join_participant_async(request.join_code, request.alias)
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


# Participant Activity & Presence Ingestion
@app.post("/api/activity")
async def record_activity(request: ActivityRequest) -> dict[str, Any]:
    device_id = request.device_id
    action = request.action

    p = _sessions().record_participant_activity(device_id, action)

    # Log to traffic logger
    app.state.traffic_logger.log(
        identity_id=device_id,
        method="POST",
        path=f"/activity/{action}",
        status_code=200,
        request_size_bytes=request.bytes_in,
        response_size_bytes=request.bytes_out,
        latency_ms=12.0,
        target_origin=DEFAULT_TARGET_URL,
        user_agent="SentinelFlow-ParticipantApp",
    )

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


# Live Causal Activity Stream
@app.get("/api/activity/stream")
async def get_activity_stream(limit: int = 50) -> list[dict[str, Any]]:
    """Return genuine chronological activity stream from tamper-evident event ledger."""
    return _event_store().list_recent_events(limit=limit)


# Telemetry Stats & Timeseries
@app.get("/api/telemetry/stats")
async def get_telemetry_stats() -> dict[str, Any]:
    return _feature_pipeline().compute_network_snapshot()


@app.get("/api/telemetry/timeseries")
async def get_telemetry_timeseries() -> dict[str, Any]:
    return {"timeseries": app.state.feature_store.get_history(limit=50)}


# Academic Supervised Model (UNSW-NB15) - Explicitly Academic Benchmark Only
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


# WebSocket Protocol v1 Endpoint
@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    ticket: str | None = Query(default=None),
) -> None:
    ws_mgr: WebSocketManager | None = getattr(app.state, "ws_manager", None)
    if not ws_mgr:
        await websocket.close(code=1011, reason="WebSocket manager not initialized")
        return

    client = await ws_mgr.authenticate_and_connect(websocket, ticket)
    if not client:
        return

    # Prepare initial state snapshot
    session = _sessions().get_current_session()
    participants = _sessions().get_participants()
    status = _detection_engine().get_status()
    telemetry_snap = _feature_pipeline().compute_network_snapshot()
    recent_events = _event_store().list_recent_events(limit=25)

    initial_payload = {
        "session": session,
        "participants": participants,
        "threat_level": status["threat_level"],
        "baseline_stats": status["baseline_stats"],
        "telemetry": telemetry_snap,
        "recent_activity": recent_events,
        "client_role": client.role,
        "client_channels": list(client.channels),
    }

    # Asynchronous queue worker delivering outbound envelopes
    async def outbound_sender():
        try:
            while client.is_active:
                msg = await client.queue.get()
                await websocket.send_json(msg)
                client.queue.task_done()
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
        except Exception:
            pass

    sender_task = asyncio.create_task(outbound_sender())

    # Send initial state event
    await client.enqueue_message({
        "v": 1,
        "type": "initial_state",
        "channel": "public",
        "seq": ws_mgr.seq,
        "ts": datetime.now(timezone.utc).isoformat(),
        "provenance": "live",
        "data": initial_payload,
    }, high_priority=True)

    # Inbound frame loop
    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                msg_data = json.loads(raw_text)
                msg_type = msg_data.get("type")
                if msg_type == "ping":
                    await client.enqueue_message({
                        "v": 1,
                        "type": "pong",
                        "channel": "public",
                        "seq": ws_mgr.seq,
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "provenance": "live",
                        "data": {"time": time.time()},
                    }, high_priority=True)
                elif msg_type == "resume":
                    last_seq = int(msg_data.get("last_seq", 0))
                    ws_mgr.resume(client, last_seq)
                elif msg_type == "subscribe":
                    channel = msg_data.get("channel")
                    if channel:
                        if client.can_access_channel(channel):
                            client.channels.add(channel)
                            await client.enqueue_message({
                                "v": 1,
                                "type": "subscription_success",
                                "channel": channel,
                                "seq": ws_mgr.seq,
                                "ts": datetime.now(timezone.utc).isoformat(),
                                "provenance": "live",
                                "data": {"channel": channel, "status": "subscribed"},
                            }, high_priority=True)
                        else:
                            await client.enqueue_message({
                                "v": 1,
                                "type": "subscription_denied",
                                "channel": channel,
                                "seq": ws_mgr.seq,
                                "ts": datetime.now(timezone.utc).isoformat(),
                                "provenance": "live",
                                "data": {"channel": channel, "reason": "Unauthorized channel access"},
                            }, high_priority=True)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        client.is_active = False
        sender_task.cancel()
        try:
            await sender_task
        except (asyncio.CancelledError, Exception):
            pass
        ws_mgr.disconnect(client)
