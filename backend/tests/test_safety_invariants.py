"""Comprehensive Safety Invariants Test Suite for Sentinel Flow.

Non-negotiable constraints enforced by this suite:
1. Public host rejection (private network RFC1918 / loopback allowlist boundary).
2. No attack scenario execution without explicit, verified operator consent.
3. Emergency stop halts active runs within 2s and state persists across backend restarts.
4. Tamper-evident evidence ledger maintains SHA-256 cryptographic chain integrity.
5. Production mode (SENTINEL_ENV=production) strictly refuses default/placeholder secrets.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.config import (
    DEFAULT_OPERATOR_PASSCODE,
    DEFAULT_OPERATOR_SECRET,
    DEFAULT_WEBHOOK_SECRET,
    is_private_or_loopback_host,
    validate_safety_configuration,
)
from app.database import EventStore
from app.orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer, SecurityError
from app.orchestrator.consent_gate import ConsentGate
from app.orchestrator.run_manager import RunManager
from app.proxy.allowlist import AllowlistViolation, TargetAllowlist


# ============================================================================
# Invariant 1: Public Host Rejected
# ============================================================================

def test_safety_invariant_public_hosts_rejected():
    """Ensure non-private/non-loopback hosts and public domains are strictly rejected."""
    # Public Internet IPs must be rejected
    public_ips = ["8.8.8.8", "1.1.1.1", "142.250.190.46", "93.184.216.34", "104.244.42.1"]
    for ip in public_ips:
        assert not is_private_or_loopback_host(ip), f"Expected public IP {ip} to be rejected"

    # Public domain names must be rejected
    public_domains = ["google.com", "example.com", "api.github.com", "target.vercel.app"]
    for domain in public_domains:
        assert not is_private_or_loopback_host(domain), f"Expected public domain {domain} to be rejected"

    # Private network (RFC 1918) and loopback addresses must be permitted
    allowed_hosts = [
        "localhost",
        "127.0.0.1",
        "::1",
        "10.0.0.1",
        "192.168.1.100",
        "172.16.5.10",
        "testserver",
        "testclient",
    ]
    for host in allowed_hosts:
        assert is_private_or_loopback_host(host), f"Expected private/loopback host {host} to be allowed"

    # Allowlist must reject disallowed external targets
    allowlist = TargetAllowlist(["http://127.0.0.1:8000", "http://localhost:3000"])
    with pytest.raises(AllowlistViolation):
        allowlist.validate("https://evil-attacker.example.com/exploit")

    with pytest.raises(AllowlistViolation):
        allowlist.validate("http://142.250.190.46:8080/admin")

    # Orchestrator Allowlist Enforcer must reject unapproved targets
    enforcer = OrchestratorAllowlistEnforcer(allowlist)
    with pytest.raises(SecurityError):
        enforcer.validate_target("https://unauthorized-victim.org/api")


# ============================================================================
# Invariant 2: No Run Without Consent
# ============================================================================

@pytest.mark.asyncio
async def test_safety_invariant_no_run_without_consent(tmp_path: Path):
    """Ensure orchestrator refuses scenario execution without explicit consent gate authorization."""
    target = "http://127.0.0.1:8000/lab-target"
    allowlist = TargetAllowlist([target])
    enforcer = OrchestratorAllowlistEnforcer(allowlist)
    consent_gate = ConsentGate(enforcer)
    state_file = tmp_path / "stop_state.json"
    manager = RunManager(enforcer, consent_gate, state_file=state_file)

    # 1. Without consent, consent_gate reports False
    assert not consent_gate.has_consent_for_target(target)

    # 2. Starting run without consent must fail with SecurityError
    with pytest.raises(SecurityError) as exc_info:
        await manager.start_run(
            scenario="credential_stuffing",
            target_origin=target,
            launched_by="unauthorized_actor",
        )
    assert "consent" in str(exc_info.value).lower()

    # 3. Grant verified consent
    consent_gate.grant_consent(
        target_origin=target,
        operator_name="Lead Security Instructor",
        confirmed_ownership=True,
    )
    assert consent_gate.has_consent_for_target(target)

    # 4. With consent granted, run start succeeds
    run = await manager.start_run(
        scenario="credential_stuffing",
        target_origin=target,
        launched_by="instructor",
    )
    assert run.status in ("RUNNING", "COMPLETED", "STOPPED")
    manager.emergency_stop()


# ============================================================================
# Invariant 3: Emergency Stop Halts and Persists
# ============================================================================

@pytest.mark.asyncio
async def test_safety_invariant_emergency_stop_halts_and_persists(tmp_path: Path):
    """Ensure emergency stop halts execution within 2s and survives backend restart."""
    target = "http://127.0.0.1:8000/lab-target"
    allowlist = TargetAllowlist([target])
    enforcer = OrchestratorAllowlistEnforcer(allowlist)
    consent_gate = ConsentGate(enforcer)
    consent_gate.grant_consent(target_origin=target, operator_name="Admin", confirmed_ownership=True)

    state_file = tmp_path / "emergency_stop.json"
    manager = RunManager(enforcer, consent_gate, state_file=state_file)

    # Start a run
    run = await manager.start_run(
        scenario="credential_stuffing",
        target_origin=target,
        launched_by="admin",
    )

    t0 = time.time()
    stop_result = manager.emergency_stop()
    duration = time.time() - t0

    # Invariant: Must halt execution within 2 seconds
    assert duration < 2.0, f"Emergency stop took too long: {duration:.3f}s (must be < 2s)"
    assert stop_result["emergency_stop_tripped"] is True
    assert manager.emergency_stop_tripped is True
    assert run.status == "STOPPED"

    # Further run attempts are immediately blocked
    with pytest.raises(SecurityError) as exc_info:
        await manager.start_run(
            scenario="credential_stuffing",
            target_origin=target,
            launched_by="admin",
        )
    assert "emergency stop" in str(exc_info.value).lower() or "circuit breaker" in str(exc_info.value).lower()

    # INVARIANT: Emergency stop state must survive backend restart!
    # Simulate restart by creating a new RunManager instance with the same persistent state
    restarted_manager = RunManager(enforcer, consent_gate, state_file=state_file)
    assert restarted_manager.emergency_stop_tripped is True, "Emergency stop state did not survive restart!"

    # New runs on restarted instance are still rejected
    with pytest.raises(SecurityError):
        await restarted_manager.start_run(
            scenario="credential_stuffing",
            target_origin=target,
            launched_by="admin",
        )

    # Reset circuit breaker
    reset_res = restarted_manager.reset_emergency_stop()
    assert reset_res["emergency_stop_tripped"] is False
    assert restarted_manager.emergency_stop_tripped is False

    # Simulate another restart: state remains reset
    third_manager = RunManager(enforcer, consent_gate, state_file=state_file)
    assert third_manager.emergency_stop_tripped is False


# ============================================================================
# Invariant 4: Evidence Chain Verifies and Detects Tampering
# ============================================================================

def test_safety_invariant_evidence_chain_verifies():
    """Ensure cryptographic hash chain integrity passes and detects unauthorized tampering."""
    store = EventStore(":memory:")

    # Initial empty chain is valid
    init_check = store.verify_chain_integrity()
    assert init_check["valid"] is True
    assert init_check["chain_valid"] is True

    # Record legitimate events
    for i in range(5):
        store.record_event(
            event_type="soc_alert",
            session_id="class_session_01",
            source="lab_sensor",
            actor_principal=f"analyst_{i}",
            evidence_payload={"alert_index": i, "severity": "HIGH"},
        )

    valid_check = store.verify_chain_integrity()
    assert valid_check["valid"] is True
    assert valid_check["chain_valid"] is True
    assert valid_check["total_events"] == 5

    # TAMPERING TEST: Modify an event payload directly in SQLite
    conn = store._connect()
    conn.execute("UPDATE evidence_events SET payload_hash = 'tampered_hash_000000' WHERE rowid = 3")
    conn.commit()

    tampered_check = store.verify_chain_integrity()
    assert tampered_check["valid"] is False
    assert tampered_check["chain_valid"] is False
    assert tampered_check["failed_at_index"] == 2  # 0-indexed rowid 3 is index 2


# ============================================================================
# Invariant 5: Production Refuses Default Secrets
# ============================================================================

def test_safety_invariant_production_refuses_default_secrets():
    """Ensure SENTINEL_ENV=production strictly refuses startup with default dev secrets."""
    # 1. Under default environment variables in production, validation must raise RuntimeError
    with patch.dict(os.environ, {"SENTINEL_ENV": "production"}):
        with pytest.raises(RuntimeError) as exc_info:
            validate_safety_configuration()
        msg = str(exc_info.value)
        assert "Production refuses startup with default secrets" in msg

    # 2. When partial default secrets remain in production, it still raises
    with patch.dict(os.environ, {
        "SENTINEL_ENV": "production",
        "SENTINEL_OPERATOR_PASSCODE": "custom-secure-passcode-99",
        # OPERATOR_SECRET and WEBHOOK_SECRET omitted -> defaults remain
    }):
        with pytest.raises(RuntimeError) as exc_info:
            validate_safety_configuration()
        assert "SENTINEL_OPERATOR_SECRET" in str(exc_info.value)

    # 3. When all secure secrets are supplied in production, validation passes cleanly
    with patch.dict(os.environ, {
        "SENTINEL_ENV": "production",
        "SENTINEL_OPERATOR_PASSCODE": "MyStrongProductionPasscode2026!#",
        "SENTINEL_OPERATOR_SECRET": "a93bf834c979d37e6b01f92e412c1b2c4e5a6f7b8c9d0e1f2a3b4c5d6e7f8a9b",
        "SENTINEL_WEBHOOK_SECRET": "c71a39d84e20b5f190e32b49c017d84a3f5c9e2b810d7a46e13f95b28c01d47a",
    }):
        validate_safety_configuration()  # Should not raise
