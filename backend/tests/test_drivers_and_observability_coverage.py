"""Unit and integration coverage tests for orchestrator drivers, metrics, and detection routes."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.observability.metrics import (
    record_alert_raised,
    record_event_ingested,
    record_http_request,
    record_inference_latency,
    record_queue_lag,
    record_ws_connection,
    get_metrics_payload,
)
from app.orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer, SecurityError
from app.orchestrator.credential_driver import CredentialStuffingDriver
from app.orchestrator.load_driver import LoadBurstDriver
from app.orchestrator.zap_driver import ZapDriver
from app.proxy.allowlist import TargetAllowlist
from app.pipeline.event_bus import (
    DeduplicationCache,
    InMemoryEventBus,
)
from app.schemas.events import NormalizedEvent



@pytest.mark.asyncio
async def test_observability_metrics_helpers_and_endpoint():
    """Verify Prometheus metrics recording helpers and /metrics endpoint."""
    record_event_ingested("test_proxy", "live")
    record_queue_lag("events_raw", 42)
    record_inference_latency("calibrated_rf", "production", 0.0035)
    record_ws_connection("operator", "operator", 1)
    record_ws_connection("operator", "operator", -1)
    record_alert_raised("CRITICAL", "credential_stuffing")
    record_http_request("GET", "/api/v1/health", 200, 0.002)

    payload, content_type = get_metrics_payload()
    assert b"sentinel_events_total" in payload
    assert b"sentinel_event_queue_lag" in payload
    assert b"sentinel_inference_latency_seconds" in payload
    assert b"sentinel_alerts_total" in payload
    assert "text/plain" in content_type

    # Verify via HTTP GET
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/metrics")
        assert res.status_code == 200
        assert "sentinel_events_total" in res.text

        res_v1 = await client.get("/api/v1/metrics")
        assert res_v1.status_code == 200
        assert "sentinel_events_total" in res_v1.text


@pytest.mark.asyncio
async def test_credential_driver_validation_and_execution():
    """Verify CredentialStuffingDriver validation and simulated execution."""
    allowlist = TargetAllowlist(["http://127.0.0.1:8000"])
    enforcer = OrchestratorAllowlistEnforcer(allowlist)
    mock_traffic_logger = MagicMock()
    driver = CredentialStuffingDriver(enforcer=enforcer, traffic_logger=mock_traffic_logger)

    # Empty list rejected
    with pytest.raises(SecurityError, match="Account list cannot be empty"):
        driver.validate_accounts([])

    # Excessive accounts rejected (> 25)
    excessive = [{"username": f"user_{i}", "password": "pwd"} for i in range(30)]
    with pytest.raises(SecurityError, match="exceeding the maximum safe limit"):
        driver.validate_accounts(excessive)

    # Valid account execution
    valid = [{"username": "test_admin", "password": "wrong_password"}]
    progress_calls = []
    effect_calls = []

    summary = await driver.execute_run(
        run_id="run_cred_test_01",
        target_origin="http://127.0.0.1:8000/lab-target",
        accounts=valid,
        rate_per_sec=100.0,
        stop_event=asyncio.Event(),
        progress_callback=lambda p: progress_calls.append(p),
        effect_callback=lambda e: effect_calls.append(e),
    )

    assert summary["run_id"] == "run_cred_test_01"
    assert summary["attempts_sent"] == 1
    assert mock_traffic_logger.log.called
    assert len(progress_calls) >= 1
    assert len(effect_calls) >= 1


@pytest.mark.asyncio
async def test_load_burst_driver_execution_flows():
    """Verify LoadBurstDriver burst and scraping execution paths."""
    allowlist = TargetAllowlist(["http://127.0.0.1:8000"])
    enforcer = OrchestratorAllowlistEnforcer(allowlist)
    mock_traffic_logger = MagicMock()
    driver = LoadBurstDriver(enforcer=enforcer, traffic_logger=mock_traffic_logger)

    # 1. Burst scenario execution
    progress_burst = []
    effect_burst = []
    summary_burst = await driver.execute_burst(
        run_id="run_burst_test_01",
        target_origin="http://127.0.0.1:8000",
        duration_seconds=1,
        requests_per_sec=2,
        stop_event=asyncio.Event(),
        progress_callback=lambda p: progress_burst.append(p),
        effect_callback=lambda e: effect_burst.append(e),
    )
    assert summary_burst["run_id"] == "run_burst_test_01"
    assert summary_burst["sent"] == 2
    assert mock_traffic_logger.log.called

    # 2. Scraping scenario execution
    mock_traffic_logger.reset_mock()
    progress_scrape = []
    effect_scrape = []
    summary_scrape = await driver.execute_scraping(
        run_id="run_scrape_test_01",
        target_origin="http://127.0.0.1:8000",
        iterations=1,
        interval_ms=1,
        stop_event=asyncio.Event(),
        progress_callback=lambda p: progress_scrape.append(p),
        effect_callback=lambda e: effect_scrape.append(e),
    )
    assert summary_scrape["run_id"] == "run_scrape_test_01"
    assert summary_scrape["sent"] > 0
    assert mock_traffic_logger.log.called


@pytest.mark.asyncio
async def test_zap_driver_execution_flows():
    """Verify ZapDriver canary probe and port scan execution paths."""
    allowlist = TargetAllowlist(["http://127.0.0.1:8000"])
    enforcer = OrchestratorAllowlistEnforcer(allowlist)
    mock_traffic_logger = MagicMock()
    driver = ZapDriver(enforcer=enforcer, traffic_logger=mock_traffic_logger)

    # 1. Canary probes execution
    progress_probes = []
    effect_probes = []
    summary_probe = await driver.execute_probe_scan(
        run_id="run_probe_test_01",
        target_origin="http://127.0.0.1:8000/lab-target",
        stop_event=asyncio.Event(),
        progress_callback=lambda p: progress_probes.append(p),
        effect_callback=lambda e: effect_probes.append(e),
    )
    assert summary_probe["run_id"] == "run_probe_test_01"
    assert summary_probe["probes_sent"] > 0
    assert mock_traffic_logger.log.called

    # 2. Port scan execution
    mock_traffic_logger.reset_mock()
    progress_ports = []
    effect_ports = []
    summary_port = await driver.execute_port_scan(
        run_id="run_port_test_01",
        target_origin="http://127.0.0.1:8000",
        stop_event=asyncio.Event(),
        progress_callback=lambda p: progress_ports.append(p),
        effect_callback=lambda e: effect_ports.append(e),
    )
    assert summary_port["run_id"] == "run_port_test_01"
    assert summary_port["ports_probed"] > 0


def test_orchestrator_routes_full_lifecycle():
    """Verify orchestrator API route coverage under TestClient lifespan."""
    from app.config import OPERATOR_SECRET_KEY

    with TestClient(app) as client:
        # Authenticate as operator
        login_res = client.post("/api/identity/operator-login", json={"passcode": OPERATOR_SECRET_KEY})
        assert login_res.status_code == 200
        op_headers = {"Authorization": f"Bearer {login_res.json()['token']}"}

        # 1. Status and scenarios
        res_status = client.get("/api/orchestrator/status", headers=op_headers)
        assert res_status.status_code == 200

        res_scenarios = client.get("/api/orchestrator/scenarios", headers=op_headers)
        assert res_scenarios.status_code == 200
        assert len(res_scenarios.json()) >= 4

        # 2. Grant operator consent
        res_consent = client.post(
            "/api/orchestrator/consent",
            headers=op_headers,
            json={
                "target_origin": "http://127.0.0.1:8000/lab-target",
                "operator_name": "Lab Instructor",
                "confirmed_ownership": True,
            },
        )
        assert res_consent.status_code == 200
        assert res_consent.json()["status"] == "granted"

        # 3. View consent audit
        res_audit = client.get("/api/orchestrator/consent/audit", headers=op_headers)
        assert res_audit.status_code == 200
        assert len(res_audit.json()) >= 1

        # 4. Operator attempting to launch attack via POST /api/orchestrator/runs is strictly forbidden (Phase 3 invariant)
        res_run = client.post(
            "/api/orchestrator/runs",
            headers=op_headers,
            json={
                "scenario": "port_scan",
                "target_origin": "http://127.0.0.1:8000/lab-target",
                "launched_by": "test_instructor",
            },
        )
        assert res_run.status_code == 403
        assert "participant" in res_run.json()["detail"].lower()

        # 5. List runs
        res_runs = client.get("/api/orchestrator/runs", headers=op_headers)
        assert res_runs.status_code == 200

        # 6. Emergency stop cycle
        res_estop = client.post("/api/orchestrator/emergency-stop", headers=op_headers)
        assert res_estop.status_code == 200
        assert res_estop.json()["emergency_stop"] is True

        res_reset = client.post("/api/orchestrator/emergency-stop/reset", headers=op_headers)
        assert res_reset.status_code == 200
        assert res_reset.json()["emergency_stop"] is False


def test_detection_routes_full_lifecycle():
    """Verify detection API route coverage under TestClient lifespan."""
    with TestClient(app) as client:
        # 1. Detection engine status
        res_status = client.get("/api/detection/status")
        assert res_status.status_code == 200

        # 2. Alerts query & history
        res_alerts = client.get("/api/detection/alerts")
        assert res_alerts.status_code == 200

        res_history = client.get("/api/detection/alerts/history")
        assert res_history.status_code == 200

        # 3. Baseline & calibration
        res_baseline = client.get("/api/detection/baseline")
        assert res_baseline.status_code == 200

        res_cal = client.post("/api/detection/baseline/calibrate")
        assert res_cal.status_code == 200
        assert "status" in res_cal.json()

        # 4. Evidence hash chain verification
        res_ev = client.get("/api/detection/evidence/verify")
        assert res_ev.status_code == 200
        assert "valid" in res_ev.json()

        # 5. Device assessment & operator grid
        res_dev = client.get("/api/detection/device/test_device_001")
        assert res_dev.status_code == 200
        assert res_dev.json()["identity_id"] == "test_device_001"

        res_grid = client.get("/api/detection/grid")
        assert res_grid.status_code == 200

        # 6. Alert disposition updates
        res_disp = client.post(
            "/api/detection/alerts/alert_sample_01/disposition",
            json={"disposition": "INVESTIGATING", "analyst_notes": "Triage verified in unit test"},
        )
        assert res_disp.status_code == 200
        assert res_disp.json()["status"] == "updated"


@pytest.mark.asyncio
async def test_event_bus_deduplication_and_in_memory_metrics():
    """Verify InMemoryEventBus pub/sub, deduplication cache, and metrics."""
    bus = InMemoryEventBus()
    dedupe = DeduplicationCache(ttl_seconds=5.0)

    # Test deduplication cache
    assert dedupe.is_duplicate("key_1") is False
    assert dedupe.is_duplicate("key_1") is True
    assert len(dedupe._entries) == 1

    # Test publish and subscribe
    test_event = NormalizedEvent(
        id="test_ev_01",
        identity_id="user_test",
        source="reverse_proxy",
        path_template="/auth/login",
        idempotency_key="key_bus_01",
    )

    published = await bus.publish(test_event)
    assert published is True

    # Duplicate publish rejected
    duplicate_published = await bus.publish(test_event)
    assert duplicate_published is False

    # Check metrics
    metrics = await bus.get_metrics()
    assert metrics["published_total"] >= 1
    assert metrics["deduped_total"] >= 1
    assert metrics["connected"] is True

    await bus.close()
