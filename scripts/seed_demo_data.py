"""Seed database with sample classroom and SOC demonstration records tagged as 'replay'."""

from __future__ import annotations

import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(backend_dir))

from app.config import DATABASE_PATH, ensure_runtime_directories
from app.database import EventStore


def seed_demo_data() -> None:
    ensure_runtime_directories()
    print(f"Initializing EventStore at {DATABASE_PATH}...")
    store = EventStore(DATABASE_PATH)

    # 1. Seed baseline replay events with valid hash chain
    print("Recording replay evidence events...")
    sample_events = [
        {
            "event_type": "proxy_traffic_observed",
            "source": "lab_proxy",
            "actor_principal": "participant_harsha",
            "identity_id": "usr_harsha_01",
            "target_service": "lab-target",
            "metadata": {"provenance": "replay", "client_ip": "127.0.0.1", "path": "/api/products", "status": 200},
            "evidence_payload": {"bytes_in": 128, "bytes_out": 2400, "latency_ms": 14.2},
        },
        {
            "event_type": "proxy_traffic_observed",
            "source": "lab_proxy",
            "actor_principal": "participant_maya",
            "identity_id": "usr_maya_02",
            "target_service": "lab-target",
            "metadata": {"provenance": "replay", "client_ip": "127.0.0.1", "path": "/api/profile", "status": 200},
            "evidence_payload": {"bytes_in": 256, "bytes_out": 1820, "latency_ms": 11.5},
        },
        {
            "event_type": "anomaly_alert_raised",
            "source": "detection_engine",
            "actor_principal": "attacker_sim",
            "identity_id": "usr_sim_burst",
            "target_service": "lab-target",
            "metadata": {"provenance": "replay", "scenario": "credential_stuffing", "severity": "HIGH"},
            "evidence_payload": {"threat_score": 0.88, "rule_matches": ["R-CRED-STUFFING"], "burst_rate": 32.5},
        },
        {
            "event_type": "operator_action_logged",
            "source": "command_center",
            "actor_principal": "operator_admin",
            "identity_id": "op_admin_01",
            "target_service": "orchestrator",
            "metadata": {"provenance": "replay", "action": "acknowledge_alert"},
            "evidence_payload": {"disposition": "INVESTIGATING", "notes": "Observed rapid failed logins from single IP"},
        },
    ]

    for ev in sample_events:
        store.record_event(
            event_type=ev["event_type"],
            source=ev["source"],
            actor_principal=ev["actor_principal"],
            identity_id=ev["identity_id"],
            target_service=ev["target_service"],
            metadata=ev["metadata"],
            evidence_payload=ev["evidence_payload"],
        )

    # 2. Seed a sample alert
    print("Recording replay security alert...")
    store.save_alert({
        "alert_id": "ALT-REPLAY-001",
        "session_id": "class_session_demo",
        "rule_id": "R-CRED-STUFFING",
        "name": "Credential Stuffing Burst Pattern",
        "severity": "HIGH",
        "identity_id": "usr_sim_burst",
        "threat_score": 0.88,
        "disposition": "OPEN",
        "evidence": {
            "provenance": "replay",
            "observed_rate": 32.5,
            "failed_attempts": 18,
            "target": "/api/auth/login",
        },
        "analyst_notes": "Demo replay event seeded for testing and verification.",
    })

    # 3. Seed a completed lab run record
    print("Recording replay lab run record...")
    store.save_lab_run({
        "run_id": "run_replay_demo_01",
        "scenario": "credential_stuffing",
        "target_origin": "http://127.0.0.1:8000/lab-target",
        "launched_by": "instructor_demo",
        "status": "COMPLETED",
        "duration_seconds": 15,
        "quota_requests": 25,
        "executed_requests": 25,
        "ground_truth_assertion": "ATTACK_PRESENT: Credential stuffing pattern across 25 accounts",
    })

    # 4. Verify evidence chain
    integrity = store.verify_chain_integrity()
    print(f"Chain integrity verification: valid={integrity['valid']}, total_events={integrity['total_events']}")
    assert integrity["valid"], "Integrity check failed on seeded database!"
    print("Seeding completed successfully.")


if __name__ == "__main__":
    seed_demo_data()
