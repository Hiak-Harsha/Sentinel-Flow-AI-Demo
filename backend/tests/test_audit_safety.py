"""Comprehensive Security, Audit, and Safety Verification Test Suite for Sentinel Flow.
Tests:
  - Private network isolation (RFC 1918 / loopback enforcement; rejection of external hosts)
  - Operator authentication & authorization gate
  - Webhook HMAC-SHA256 signature & replay window verification
  - Emergency Stop kill switch functionality
  - All 4 scenario detection contracts (Brute Force, Port Scan, Service DoS, Canary Exploit)
  - Forward SHA-256 tamper-evident cryptographic ledger integrity
"""

import hashlib
import hmac
import time
import pytest
from fastapi.testclient import TestClient

from app.config import OPERATOR_SECRET_KEY, WEBHOOK_SHARED_SECRET
from app.database import EventStore
from app.detection.rule_correlator import RuleCorrelator
from app.main import app
from app.pipeline.feature_store import IdentityFeatureVector
from app.proxy.allowlist import AllowlistViolation, TargetAllowlist


def test_allowlist_private_network_enforcement():
    """Verify that public internet hosts are strictly rejected and only private/loopback hosts are allowed."""
    allowlist = TargetAllowlist(
        allowed_origins=["http://127.0.0.1:8000", "http://localhost:3000"],
        authorization_record={
            "authorized_by": "Test Operator",
            "environment": "isolated_local_lab",
            "expires_at": "2099-01-01T00:00:00Z",
            "confirmed_ownership": True,
        },
    )

    # 1. Allowed private targets
    assert allowlist.is_allowed("http://127.0.0.1:8000") is True
    assert allowlist.is_allowed("http://localhost:3000") is True

    # 2. Public / External targets must fail allowlist check
    assert allowlist.is_allowed("https://kee-crochet-shop.vercel.app") is False
    assert allowlist.is_allowed("https://example.com") is False
    assert allowlist.is_allowed("https://8.8.8.8") is False

    # 3. Validation must raise AllowlistViolation on public domains
    with pytest.raises(AllowlistViolation):
        allowlist.validate("https://kee-crochet-shop.vercel.app")

    with pytest.raises(AllowlistViolation):
        allowlist.validate("https://google.com")


def test_operator_login_and_token_validation():
    """Verify operator passcode exchange and JWT/token generation."""
    with TestClient(app) as client:
        # Invalid passcode fails
        bad_res = client.post("/api/identity/operator-login", json={"passcode": "wrong-secret-123"})
        assert bad_res.status_code == 401

        # Valid passcode succeeds
        good_res = client.post("/api/identity/operator-login", json={"passcode": OPERATOR_SECRET_KEY})
        assert good_res.status_code == 200
        data = good_res.json()
        assert data["authenticated"] is True
        assert data["role"] == "operator"
        assert "token" in data

        # Token validation
        token = data["token"]
        val_res = client.post("/api/identity/validate", json={"token": token})
        assert val_res.status_code == 200
        assert val_res.json()["valid"] is True


def test_webhook_hmac_signature_and_replay_protection():
    """Verify webhook receiver validates HMAC-SHA256 and timestamps."""
    with TestClient(app) as client:
        payload = {
            "event_type": "security_canary",
            "identity_id": "auditor_probe",
            "path": "/lab-target/canary/sql_injection",
            "status_code": 200,
            "metadata": {"source": "unit_test"},
        }
        body_bytes = b'{"event_type":"security_canary","identity_id":"auditor_probe","path":"/lab-target/canary/sql_injection","status_code":200,"metadata":{"source":"unit_test"}}'

        # 1. Unsigned request -> 403 Forbidden
        res_unsigned = client.post(
            "/api/webhook/target-event",
            content=body_bytes,
            headers={"Content-Type": "application/json"},
        )
        assert res_unsigned.status_code == 403

        # 2. Expired timestamp (>60s old) -> 403 Forbidden
        old_ts = str(int(time.time()) - 120)
        old_sig = hmac.new(WEBHOOK_SHARED_SECRET.encode("utf-8"), old_ts.encode("utf-8") + body_bytes, hashlib.sha256).hexdigest()
        res_expired = client.post(
            "/api/webhook/target-event",
            content=body_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Sentinel-Timestamp": old_ts,
                "X-Sentinel-Signature": old_sig,
            },
        )
        assert res_expired.status_code == 403

        # 3. Valid timestamp & HMAC signature -> 202 Accepted
        curr_ts = str(int(time.time()))
        valid_sig = hmac.new(WEBHOOK_SHARED_SECRET.encode("utf-8"), curr_ts.encode("utf-8") + body_bytes, hashlib.sha256).hexdigest()
        res_valid = client.post(
            "/api/webhook/target-event",
            content=body_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Sentinel-Timestamp": curr_ts,
                "X-Sentinel-Signature": valid_sig,
            },
        )
        assert res_valid.status_code == 202
        assert res_valid.json()["status"] == "accepted"


def test_emergency_stop_kill_switch():
    """Verify that emergency stop halts execution immediately and sets kill switch flag."""
    with TestClient(app) as client:
        # Authenticate as operator
        login_res = client.post("/api/identity/operator-login", json={"passcode": OPERATOR_SECRET_KEY})
        assert login_res.status_code == 200
        op_headers = {"Authorization": f"Bearer {login_res.json()['token']}"}

        # Trip emergency stop
        stop_res = client.post("/api/orchestrator/emergency-stop", headers=op_headers)
        assert stop_res.status_code == 200
        stop_data = stop_res.json()
        assert stop_data["emergency_stop"] is True

        # Attempt to start scenario while emergency stop active -> rejected with 403
        run_res = client.post(
            "/api/orchestrator/runs",
            headers=op_headers,
            json={
                "scenario": "credential_stuffing",
                "target_origin": "http://127.0.0.1:8000/lab-target",
            },
        )
        assert run_res.status_code == 403
        assert "Emergency stop" in run_res.json()["detail"]

        # Reset emergency stop
        reset_res = client.post("/api/orchestrator/emergency-stop/reset", headers=op_headers)
        assert reset_res.status_code == 200
        assert reset_res.json()["emergency_stop"] is False


def test_scenario_detection_rules_contracts():
    """Verify exact MITRE ATT&CK rules trigger on authentic telemetry evidence."""
    correlator = RuleCorrelator()

    # 1. Failed-Login Brute Force (T1110)
    auth_vec = IdentityFeatureVector(
        identity_id="attacker_brute",
        timestamp_epoch=time.time(),
        timestamp_iso="",
        auth_failures_30s=4,
        account_churn_5m=3,
        request_count_30s=8,
    )
    auth_matches = correlator.evaluate(auth_vec)
    assert any(m.rule_id == "credential_stuffing" for m in auth_matches)

    # 2. Network Service Discovery / Port Scan (T1046)
    port_vec = IdentityFeatureVector(
        identity_id="attacker_scanner",
        timestamp_epoch=time.time(),
        timestamp_iso="",
        distinct_ports_10s=4,
        request_count_30s=10,
    )
    port_matches = correlator.evaluate(port_vec)
    assert any(m.rule_id == "port_scan" for m in port_matches)

    # 3. Endpoint Denial of Service (T1499)
    dos_vec = IdentityFeatureVector(
        identity_id="attacker_dos",
        timestamp_epoch=time.time(),
        timestamp_iso="",
        request_rate_5s=25.0,
        request_count_5s=30,
        request_count_30s=80,
        p95_latency_30s=450.0,
        target_error_ratio_30s=0.35,
    )
    dos_matches = correlator.evaluate(dos_vec)
    assert any(m.rule_id == "burst_dos" for m in dos_matches)

    # 4. Exploit Public-Facing Application Canary Probe (T1190)
    canary_vec = IdentityFeatureVector(
        identity_id="attacker_exploit",
        timestamp_epoch=time.time(),
        timestamp_iso="",
        canary_hits_30s=2,
        request_count_30s=5,
    )
    canary_matches = correlator.evaluate(canary_vec)
    assert any(m.rule_id == "canary_exploit_probe" for m in canary_matches)


def test_tamper_evident_cryptographic_evidence_chain():
    """Verify SHA-256 forward hash chaining and tamper-evident integrity."""
    store = EventStore()

    # Record 5 sequential audit events
    for i in range(5):
        store.record_event(
            event_type="auth.failure" if i % 2 == 0 else "canary.hit",
            identity_id=f"principal_{i}",
            target_service="lab-target",
            evidence_payload={"attempt": i, "path": f"/test/{i}"},
        )

    # Verify chain integrity
    verification = store.verify_chain_integrity()
    assert verification["chain_valid"] is True
    assert verification["total_events"] == 5
    assert verification["chain_tail_hash"] != "0" * 64

    # Tamper with an event record directly in the database table
    with store._connect() as conn:
        conn.execute("UPDATE evidence_events SET actor_principal = 'tampered_spoofed_principal' WHERE rowid = 3")

    # Re-verify -> must detect corruption
    corrupt_check = store.verify_chain_integrity()
    assert corrupt_check["chain_valid"] is False
    assert corrupt_check["corrupted_at_index"] == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
