"""Unit and integration tests for Phase 3: Real-Time Event Pipeline."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.pipeline.event_bus import DeduplicationCache, HybridEventBus, InMemoryEventBus
from app.pipeline.feature_pipeline import FeaturePipeline
from app.pipeline.feature_store import FeatureStore
from app.pipeline.replay import BUILTIN_REPLAY_SCENARIOS, ReplayEngine
from app.proxy.traffic_logger import TrafficLogger
from app.schemas.events import NormalizedEvent, compute_idempotency_key
from app.sensors.host_flow import HostFlowSensor


# ---------------------------------------------------------------------------
# 1. NormalizedEvent Schema & Deduplication
# ---------------------------------------------------------------------------


def test_normalized_event_creation_and_idempotency():
    ev1 = NormalizedEvent(
        identity_id="device_alpha",
        method="GET",
        path_template="/api/data",
        status_code=200,
        bytes_in=100,
        bytes_out=500,
    )
    assert ev1.id is not None
    assert len(ev1.id) > 10
    assert ev1.idempotency_key is not None
    assert len(ev1.idempotency_key) == 24

    # Serialization to and from Redis stream dict
    stream_dict = ev1.to_stream_dict()
    assert stream_dict["identity_id"] == "device_alpha"
    assert stream_dict["method"] == "GET"
    assert stream_dict["status_code"] == "200"

    ev2 = NormalizedEvent.from_stream_dict(stream_dict)
    assert ev2.id == ev1.id
    assert ev2.identity_id == ev1.identity_id
    assert ev2.idempotency_key == ev1.idempotency_key
    assert ev2.status_code == 200


def test_deduplication_cache():
    cache = DeduplicationCache(ttl_seconds=2.0, max_size=100)
    key = "test_key_12345"
    assert cache.is_duplicate(key) is False
    assert cache.is_duplicate(key) is True
    assert cache.is_duplicate("other_key") is False


# ---------------------------------------------------------------------------
# 2. InMemoryEventBus & HybridEventBus
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_in_memory_event_bus_pub_sub_and_dedupe():
    bus = InMemoryEventBus(consumer_groups=["feature-builder", "alerter"])
    ev = NormalizedEvent(
        identity_id="device_beta",
        method="POST",
        path_template="/auth/login",
        status_code=401,
    )

    published = await bus.publish(ev)
    assert published is True

    # Duplicate with same idempotency key should be dropped
    duplicate = await bus.publish(ev)
    assert duplicate is False

    # Consume from consumer group
    consumer = bus.subscribe("feature-builder", "worker-1")
    received = await anext(consumer)
    assert received.id == ev.id
    assert received.identity_id == "device_beta"

    metrics = await bus.get_metrics()
    assert metrics["backend"] == "in_memory"
    assert metrics["published_total"] == 1
    assert metrics["deduped_total"] == 1

    await bus.close()


@pytest.mark.asyncio
async def test_hybrid_event_bus_fallback():
    # Provide an invalid Redis port to verify graceful fallback to InMemoryEventBus
    bus = HybridEventBus(redis_url="redis://127.0.0.1:59999/0")
    active = await bus.initialize()
    assert isinstance(active, InMemoryEventBus)

    ev = NormalizedEvent(
        identity_id="device_gamma",
        method="GET",
        path_template="/status",
    )
    published = await bus.publish(ev)
    assert published is True

    metrics = await bus.get_metrics()
    assert metrics["backend"] == "in_memory"
    assert metrics["published_total"] == 1

    await bus.close()


# ---------------------------------------------------------------------------
# 3. Host Flow Sensor (Strict Opt-in & Safety)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_host_sensor_safety_invariants():
    # Strict opt-in: disabled by default
    sensor_disabled = HostFlowSensor(enabled=False)
    assert sensor_disabled.enabled is False
    assert sensor_disabled.start() is False

    # When enabled, samples instantaneous local host metrics only
    sensor_enabled = HostFlowSensor(enabled=True)
    assert sensor_enabled.enabled is True
    metrics = sensor_enabled.sample_now()

    assert "total_connections" in metrics
    assert "cpu_percent" in metrics
    assert "bytes_sent_rate_per_sec" in metrics
    assert "bytes_recv_rate_per_sec" in metrics
    assert metrics["total_connections"] >= 0


# ---------------------------------------------------------------------------
# 4. Replay Engine
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_replay_engine_emission():
    emitted_events: list[NormalizedEvent] = []

    def on_event(ev: NormalizedEvent):
        emitted_events.append(ev)

    engine = ReplayEngine(event_callback=on_event)
    assert "benign_baseline" in BUILTIN_REPLAY_SCENARIOS
    assert "credential_stuffing_replay" in BUILTIN_REPLAY_SCENARIOS

    engine.start(scenario="credential_stuffing_replay", speed_multiplier=25.0, loop=False)
    # Allow replay task to emit
    await asyncio.sleep(0.3)
    engine.stop()

    assert len(emitted_events) > 0
    first = emitted_events[0]
    assert first.provenance == "replay"
    assert first.source == "replay"
    assert first.method == "POST"
    assert "/api/auth/login" in first.path_template


# ---------------------------------------------------------------------------
# 5. Incremental Streaming Feature Pipeline (v2.0.0)
# ---------------------------------------------------------------------------


def test_feature_pipeline_v2_features():
    logger = TrafficLogger()
    store = FeatureStore()
    pipeline = FeaturePipeline(traffic_logger=logger, feature_store=store)

    t0 = time.time()
    # Log 10 requests with specific timestamps to test burstiness (Fano factor) & CV
    for i in range(10):
        logger.log(
            identity_id="perf_test_actor",
            method="POST" if i % 2 == 0 else "GET",
            path=f"/resource/{i % 3}",
            status_code=200 if i < 8 else 500,
            request_size_bytes=100 + i * 10,
            response_size_bytes=500 + i * 20,
            latency_ms=10.0 + i,
            target_origin="http://localhost:8000",
        )

    vec = pipeline.compute_features_for_identity("perf_test_actor")

    # Feature schema version
    assert vec.feature_schema_version == "2.0.0"

    # Status breakdown
    assert vec.status_2xx_count_30s == 8
    assert vec.status_5xx_count_30s == 2
    assert vec.status_4xx_count_30s == 0

    # Method mix
    assert vec.method_post_ratio_30s == 0.5
    assert vec.method_get_ratio_30s == 0.5

    # Unique endpoints & burstiness
    assert vec.unique_path_count_30s == 3
    assert vec.inter_request_interval_cv_30s >= 0.0
    assert vec.fano_factor_30s >= 0.0


# ---------------------------------------------------------------------------
# 6. Health & Readiness API Probes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_live_and_ready_probes():
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Liveness probe
            res_live = await client.get("/api/v1/health/live")
            assert res_live.status_code == 200
            live_data = res_live.json()
            assert live_data["status"] == "alive"

            # Readiness probe
            res_ready = await client.get("/api/v1/health/ready")
            assert res_ready.status_code == 200, res_ready.json()
            ready_data = res_ready.json()
            assert ready_data["status"] == "ready"
            assert "database" in ready_data["components"]
            assert "event_bus" in ready_data["components"]
            assert "safety_boundary" in ready_data["components"]


# ---------------------------------------------------------------------------
# 7. Replay & Host Sensor API Endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_replay_and_sensor_api_endpoints():
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Replay status
            res = await client.get("/api/v1/replay/status")
            assert res.status_code == 200
            data = res.json()
            assert "available_scenarios" in data
            assert "benign_baseline" in data["available_scenarios"]

            # Start and stop replay
            start_res = await client.post(
                "/api/v1/replay/start",
                json={"scenario": "benign_baseline", "speed_multiplier": 5.0, "loop": False},
            )
            assert start_res.status_code == 200

            stop_res = await client.post("/api/v1/replay/stop")
            assert stop_res.status_code == 200

            # Host sensor status and sample
            sensor_status = await client.get("/api/v1/sensor/status")
            assert sensor_status.status_code == 200
            assert "enabled" in sensor_status.json()

            sample_res = await client.post("/api/v1/sensor/sample")
            assert sample_res.status_code == 200
            assert "metrics" in sample_res.json()
            assert "total_connections" in sample_res.json()["metrics"]
