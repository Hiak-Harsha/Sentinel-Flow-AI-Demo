"""Unit and integration test script for Sentinel Flow Phase 1."""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import TARGET_CONFIG_PATH
from app.proxy.allowlist import AllowlistViolation, TargetAllowlist, load_allowlist_from_config
from app.proxy.reverse_proxy import init_proxy_handler
from app.proxy.session_bridge import SessionBridge
from app.proxy.traffic_logger import TrafficLogger, TrafficRecord
from app.proxy.webhook_receiver import set_webhook_traffic_logger
from fastapi.testclient import TestClient
from app.main import app


def test_allowlist():
    print("Testing TargetAllowlist...")
    al = load_allowlist_from_config(TARGET_CONFIG_PATH)
    assert len(al.origins) >= 1
    assert "http://localhost:3000" in al.origins
    al.validate("http://localhost:3000/api/products")
    al.validate("http://127.0.0.1:3000/cart")
    print("  Allowed origins verified.")

    try:
        al.validate("http://evil-attacker.com/steal")
        assert False, "Should have raised AllowlistViolation!"
    except AllowlistViolation:
        print("  Blocked unauthorized target correctly.")


def test_traffic_logger():
    print("Testing TrafficLogger...")
    logger = TrafficLogger(max_records=100)
    received = []
    logger.add_listener(lambda r: received.append(r))

    rec = logger.log(
        identity_id="student_1",
        method="GET",
        path="/items",
        status_code=200,
        request_size_bytes=42,
        response_size_bytes=512,
        latency_ms=12.4,
        target_origin="http://localhost:3000",
    )

    assert logger.total_count == 1
    assert len(received) == 1
    assert received[0].identity_id == "student_1"
    snap = logger.snapshot()
    assert snap["total_logged"] == 1
    print("  TrafficLogger recorded and notified listeners successfully.")


def test_session_bridge():
    print("Testing SessionBridge...")
    bridge = SessionBridge()
    session = bridge.get_or_create_session("student_1")
    assert session.identity_id == "student_1"
    headers = bridge.get_headers_for_identity("student_1")
    assert headers["X-Sentinel-Identity"] == "student_1"

    bridge.update_cookies_from_response("student_1", ["session_token=abc123xyz; Path=/; HttpOnly"])
    cookies = bridge.get_cookies_for_identity("student_1")
    assert cookies.get("session_token") == "abc123xyz"
    print("  SessionBridge handled cookies and headers successfully.")


def test_api_integration():
    print("Testing FastAPI endpoints with TestClient...")
    with TestClient(app) as client:
        # Proxy status
        res = client.get("/api/proxy/status")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["status"] == "active"
        assert "http://localhost:3000" in data["allowed_origins"]
        print("  /api/proxy/status returned active with allowed origins.")

        # Test allowlist enforcement via proxy endpoint
        # Request with disallowed X-Target-Origin should be 403
        res = client.get("/proxy/test", headers={"X-Target-Origin": "http://unauthorized-domain.com"})
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        assert "not in operator allowlist" in res.text
        print("  /proxy/ blocked unauthorized target host with 403.")

        # Webhook event without signature should be rejected with 403
        webhook_payload = {
            "event_type": "auth_failed",
            "identity_id": "test_user_42",
            "path": "/login",
            "status_code": 401,
            "metadata": {"ip": "127.0.0.1", "attempts": 3},
        }
        res = client.post("/api/webhook/target-event", json=webhook_payload)
        assert res.status_code == 403, f"Expected 403 for unsigned webhook, got {res.status_code}"

        # Webhook event with valid HMAC-SHA256 signature should succeed
        import hmac, hashlib
        from app.config import WEBHOOK_SHARED_SECRET
        ts = str(int(time.time()))
        body_bytes = json.dumps(webhook_payload).encode("utf-8")
        sig = hmac.new(WEBHOOK_SHARED_SECRET.encode("utf-8"), ts.encode("utf-8") + b"." + body_bytes, hashlib.sha256).hexdigest()
        res = client.post(
            "/api/webhook/target-event",
            content=body_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Sentinel-Timestamp": ts,
                "X-Sentinel-Signature": sig,
            },
        )
        assert res.status_code == 202
        assert res.json()["status"] == "accepted"

        # Webhook events list
        res = client.get("/api/webhook/events")
        assert res.status_code == 200
        events = res.json()
        assert any(e["event_type"] == "auth_failed" for e in events)
        print("  /api/webhook/target-event recorded event successfully.")

        # Proxy logs endpoint
        res = client.get("/api/proxy/logs")
        assert res.status_code == 200
        logs = res.json()
        assert len(logs) >= 1
        print("  /api/proxy/logs returned real records successfully.")


if __name__ == "__main__":
    test_allowlist()
    test_traffic_logger()
    test_session_bridge()
    test_api_integration()
    print("\nALL PHASE 1 TESTS PASSED SUCCESSFULLY!")
