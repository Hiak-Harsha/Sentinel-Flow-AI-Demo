"""Contract tests verifying OpenAPI alignment, X-Request-ID headers, and error envelopes."""

from __future__ import annotations

import re
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def test_openapi_contains_frontend_endpoints():
    """Asserts that all routes called by the frontend exist in the FastAPI OpenAPI specification."""
    spec = app.openapi()
    spec_paths = set(spec.get("paths", {}).keys())

    # Key core API endpoints used by frontend
    core_frontend_routes = [
        "/api/overview",
        "/api/sessions/current",
        "/api/sessions",
        "/api/sessions/join",
        "/api/sessions/participants",
        "/api/identity/whoami",
        "/api/identity/operator-login",
        "/api/identity/register",
        "/api/proxy/status",
        "/api/proxy/logs",
        "/api/features",
        "/api/features/network/snapshot",
        "/api/detection/status",
        "/api/detection/alerts",
        "/api/detection/alerts/history",
        "/api/detection/evidence/verify",
        "/api/academic-model/status",
        "/api/academic-model/benchmark",
        "/api/telemetry/timeseries",
        "/api/activity/stream",
        "/api/orchestrator/status",
        "/api/orchestrator/runs",
        "/api/orchestrator/emergency-stop",
        "/api/orchestrator/consent",
        "/api/orchestrator/consent/audit",
        # Canonical v1 routes
        "/api/v1/health",
        "/api/v1/overview",
        "/api/v1/activity/stream",
        "/api/v1/telemetry/stats",
        "/api/v1/telemetry/timeseries",
        "/api/v1/ws/ticket",
        "/api/v1/sessions/current",
        "/api/v1/sessions",
        "/api/v1/sessions/join",
        "/api/v1/sessions/participants",
        "/api/v1/detection/alerts",
        "/api/v1/detection/status",
        "/api/v1/detection/evidence/verify",
        "/api/v1/orchestrator/status",
        "/api/v1/orchestrator/runs",
        "/api/v1/orchestrator/emergency-stop",
        "/api/v1/orchestrator/emergency-stop/reset",
        "/api/v1/targets",
        "/api/v1/targets/authorize",
    ]

    for route in core_frontend_routes:
        assert route in spec_paths, f"Frontend route '{route}' missing from OpenAPI specification!"


def test_request_id_middleware_and_header():
    """Verify that every HTTP response includes an X-Request-ID header."""
    with TestClient(app) as client:
        # 1. Successful request
        res = client.get("/api/v1/health")
        assert res.status_code == 200
        req_id = res.headers.get("x-request-id") or res.headers.get("X-Request-ID")
        assert req_id is not None
        assert req_id.startswith("req_")

        # 2. Client-supplied custom Request ID is preserved
        custom_id = "req_custom_trace_98765"
        res_custom = client.get("/api/v1/health", headers={"X-Request-ID": custom_id})
        assert res_custom.status_code == 200
        echoed_id = res_custom.headers.get("x-request-id") or res_custom.headers.get("X-Request-ID")
        assert echoed_id == custom_id


def test_uniform_error_envelope_structure():
    """Verify that HTTP errors return the standardized ErrorEnvelope format."""
    with TestClient(app) as client:
        # 404 Not Found error
        res_404 = client.get("/api/v1/non-existent-endpoint")
        assert res_404.status_code == 404
        data = res_404.json()
        assert "error" in data
        err = data["error"]
        assert err["code"] == "NOT_FOUND"
        assert "message" in err
        assert "request_id" in err
        assert err["request_id"].startswith("req_")

        # 422 Validation Error
        res_422 = client.post("/api/v1/sessions/join", json={})
        assert res_422.status_code == 422
        data_422 = res_422.json()
        assert "error" in data_422
        err_422 = data_422["error"]
        assert err_422["code"] == "VALIDATION_ERROR"
        assert "request_id" in err_422
        assert err_422["details"] is not None
