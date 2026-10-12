"""Comprehensive verification test suite for Sentinel Flow v2 backend (Phases 1-5)."""

import asyncio
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).parent))

from fastapi.testclient import TestClient

from app.config import TARGET_CONFIG_PATH
from app.detection.engine import DetectionEngine
from app.detection.rule_correlator import RuleCorrelator
from app.detection.score_fusion import fuse_signals
from app.detection.supervised_model import SupervisedClassifier
from app.detection.unsupervised_model import OnlineAnomalyDetector
from app.identity.fingerprint import compute_server_fingerprint
from app.identity.identity_resolver import IdentityResolver
from app.identity.session_manager import SessionManager
from app.main import app
from app.orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer, SecurityError
from app.orchestrator.consent_gate import ConsentGate
from app.orchestrator.credential_driver import CredentialStuffingDriver
from app.orchestrator.run_manager import RunManager
from app.pipeline.feature_pipeline import FeaturePipeline
from app.pipeline.feature_store import FeatureStore, IdentityFeatureVector
from app.proxy.allowlist import AllowlistViolation, TargetAllowlist, load_allowlist_from_config
from app.proxy.session_bridge import SessionBridge
from app.proxy.traffic_logger import TrafficLogger


def test_phase1_proxy_and_allowlist():
    print("=== [PHASE 1] Reverse Proxy & Hard Allowlist ===")
    al = load_allowlist_from_config(TARGET_CONFIG_PATH)
    assert al.is_allowed("http://localhost:3000")
    assert not al.is_allowed("http://external-malicious-site.com")
    print("  [OK] Hard allowlist correctly validated.")

    logger = TrafficLogger(max_records=50)
    rec = logger.log(
        identity_id="user_1",
        method="GET",
        path="/items",
        status_code=200,
        request_size_bytes=100,
        response_size_bytes=1200,
        latency_ms=14.2,
        target_origin="http://localhost:3000",
    )
    assert logger.total_count == 1
    assert rec.status_code == 200
    print("  [OK] Server-side TrafficLogger recorded accurately.")

    bridge = SessionBridge()
    bridge.update_cookies_from_response("user_1", ["session_id=tok999; Path=/"])
    assert bridge.get_cookies_for_identity("user_1").get("session_id") == "tok999"
    print("  [OK] SessionBridge cookie jar works.")


def test_phase2_feature_pipeline():
    print("=== [PHASE 2] Streaming Feature Pipeline ===")
    logger = TrafficLogger()
    store = FeatureStore()
    pipeline = FeaturePipeline(traffic_logger=logger, feature_store=store)

    # Simulate normal requests
    for i in range(5):
        logger.log(
            identity_id="normal_user",
            method="GET",
            path=f"/page/{i}",
            status_code=200,
            request_size_bytes=200,
            response_size_bytes=800,
            latency_ms=25.0,
            target_origin="http://localhost:3000",
        )

    vec = pipeline.compute_features_for_identity("normal_user")
    assert vec.request_count_5s == 5
    assert vec.error_ratio_30s == 0.0
    assert vec.endpoint_entropy_30s > 1.0
    print("  [OK] Normal browsing features computed correctly.")

    # Simulate high error burst
    for i in range(10):
        logger.log(
            identity_id="brute_force_bot",
            method="POST",
            path="/login",
            status_code=401,
            request_size_bytes=150,
            response_size_bytes=50,
            latency_ms=10.0,
            target_origin="http://localhost:3000",
        )

    vec_bot = pipeline.compute_features_for_identity("brute_force_bot")
    assert vec_bot.request_count_5s == 10
    assert vec_bot.error_ratio_30s == 1.0  # 100% 401s
    assert vec_bot.request_rate_5s >= 2.0
    print("  [OK] Attack burst feature divergence verified.")


def test_phase3_detection_engine():
    print("=== [PHASE 3] Multi-Layer Detection Engine ===")
    # 1. Supervised model
    sup = SupervisedClassifier()
    assert sup.is_ready, "UNSW-NB15 Random Forest model should be loaded and ready"

    # 2. Unsupervised detector
    unsup = OnlineAnomalyDetector()
    assert not unsup.is_calibrated

    # Idle vector produces 0 anomaly score
    idle_vec = IdentityFeatureVector(identity_id="idle", timestamp_epoch=0.0, timestamp_iso="")
    res_idle = unsup.score_vector(idle_vec)
    assert res_idle["anomaly_score"] == 0.0
    print("  [OK] Idle session produces 0.0 anomaly score.")

    # 3. Rule Correlator: Credential Stuffing
    correlator = RuleCorrelator()
    cred_vec = IdentityFeatureVector(
        identity_id="attacker_1",
        timestamp_epoch=0.0,
        timestamp_iso="",
        account_churn_5m=6,
        error_ratio_30s=0.85,
        request_count_30s=12,
        request_rate_5s=4.0,
        inter_request_interval_mean_30s=150.0,
    )
    matches = correlator.evaluate(cred_vec)
    rule_ids = [m.rule_id for m in matches]
    assert "credential_stuffing" in rule_ids
    print("  [OK] Credential stuffing rule matched correctly.")

    # 4. Rule Correlator: Scraping
    scraping_vec = IdentityFeatureVector(
        identity_id="scraper_1",
        timestamp_epoch=0.0,
        timestamp_iso="",
        endpoint_entropy_5m=3.2,
        error_ratio_30s=0.05,
        request_count_30s=15,
        inter_request_interval_std_30s=80.0,
    )
    matches_scrape = correlator.evaluate(scraping_vec)
    assert any(m.rule_id == "scraping" for m in matches_scrape)
    print("  [OK] Web scraping rule matched correctly.")

    # 5. Rule Correlator: Burst DoS
    burst_vec = IdentityFeatureVector(
        identity_id="dos_bot",
        timestamp_epoch=0.0,
        timestamp_iso="",
        request_rate_5s=14.0,
        request_rate_30s=2.0,
        request_count_5s=14,
    )
    matches_burst = correlator.evaluate(burst_vec)
    assert any(m.rule_id == "burst_dos" for m in matches_burst)
    print("  [OK] Burst DoS rule matched correctly.")

    # 6. Score Fusion
    engine = DetectionEngine(supervised=sup, unsupervised=unsup, rule_correlator=correlator)
    fused_assessment = engine.evaluate_vector(cred_vec)
    assert fused_assessment["is_threat"] is True
    assert fused_assessment["threat_level"] in ("HIGH", "CRITICAL")
    assert "credential_stuffing" in fused_assessment["matched_rules"]
    print("  [OK] Score fusion produces unified threat assessment.")


def test_phase4_identity_and_fingerprint():
    print("=== [PHASE 4] Real Identity & Device Fingerprinting ===")
    fp1 = compute_server_fingerprint(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)", client_ip="192.168.1.50")
    fp2 = compute_server_fingerprint(user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", client_ip="192.168.1.99")
    assert fp1 != fp2
    print("  [OK] Server-side fingerprinting differentiates device profiles.")

    sm = SessionManager()
    resolver = IdentityResolver(sm)
    triple, session = resolver.bind_identity(identity_id="user_alice", alias="Alice", fingerprint_hash=fp1)
    assert session.is_valid
    assert sm.validate_token(session.token) is not None

    # Inspect from same fingerprint -> no ATO
    insp1 = resolver.inspect_request(identity_id="user_alice", token=session.token, current_fingerprint=fp1)
    assert insp1["is_token_valid"] is True
    assert insp1["ato_flag"] is False

    # Inspect from brand new fingerprint -> ATO flag raised!
    insp2 = resolver.inspect_request(identity_id="user_alice", token=session.token, current_fingerprint=fp2)
    assert insp2["ato_flag"] is True
    print("  [OK] Account Takeover (ATO) detected on mid-session fingerprint change.")


def test_phase5_attack_orchestrator():
    print("=== [PHASE 5] Operator-Gated Attack Orchestrator ===")
    al = load_allowlist_from_config(TARGET_CONFIG_PATH)
    enforcer = OrchestratorAllowlistEnforcer(al)

    # 1. Enforcer rejects external non-allowlisted targets
    try:
        enforcer.validate_target("http://victim-corp.com")
        assert False, "Should have failed with SecurityError!"
    except SecurityError:
        print("  [OK] Structural safety: non-allowlisted target rejected.")

    # 2. Consent Gate requires ownership confirmation
    gate = ConsentGate(enforcer)
    try:
        gate.grant_consent(
            target_origin="http://localhost:3000",
            operator_name="Admin",
            confirmed_ownership=False,
        )
        assert False, "Should require confirmed_ownership=True!"
    except SecurityError:
        print("  [OK] Consent gate strictly enforces confirmed ownership.")

    consent_rec = gate.grant_consent(
        target_origin="http://localhost:3000",
        operator_name="Lab Admin",
        confirmed_ownership=True,
    )
    assert gate.verify_consent(consent_rec.consent_token, "http://localhost:3000")
    print("  [OK] Consent recorded and audited.")

    # 3. Credential Stuffing driver enforces 50 account limit
    cred_driver = CredentialStuffingDriver(enforcer)
    huge_list = [{"username": f"user_{i}", "password": "p"} for i in range(51)]
    try:
        cred_driver.validate_accounts(huge_list)
        assert False, "Should have rejected account list > 50!"
    except SecurityError:
        print("  [OK] Credential driver rejected account list > 50 (demo safety limit).")


def test_api_integration():
    print("=== Integration Test with FastAPI TestClient ===")
    with TestClient(app) as client:
        # Overview
        res = client.get("/api/overview")
        assert res.status_code == 200
        data = res.json()
        assert "threat_level" in data
        assert "active_devices" in data
        assert data["academic_model_ready"] is True
        print("  [OK] /api/overview returned real metrics.")

        # Academic model status (Evaluation metrics - single source of truth)
        res = client.get("/api/academic-model/status")
        assert res.status_code == 200
        academic = res.json()
        metrics = academic.get("metrics")
        assert metrics is not None
        assert metrics["accuracy"] == 89.13  # Real evaluation.json metric!
        assert metrics["recall"] == 95.82   # Real evaluation.json metric!
        print("  [OK] /api/academic-model/status verified: 89.13% accuracy (no fake 93.47%).")

        # Identity Register
        res = client.post("/api/identity/register", json={"alias": "Pilot User"})
        assert res.status_code == 200
        id_info = res.json()
        assert "token" in id_info
        assert id_info["alias"] == "Pilot User"
        token = id_info["token"]
        print("  [OK] /api/identity/register issued secure token.")

        # Identity Validate
        res = client.post("/api/identity/validate", json={"token": token})
        assert res.status_code == 200
        assert res.json()["valid"] is True
        print("  [OK] /api/identity/validate validated session.")

        # Features Debug Endpoint
        res = client.get(f"/api/features/{id_info['identity_id']}")
        assert res.status_code == 200
        features = res.json()["features"]
        assert "request_rate_5s" in features
        assert "error_ratio_30s" in features
        print("  [OK] /api/features/{identity_id} returned real feature vector.")

        # Detection Status
        res = client.get("/api/detection/status")
        assert res.status_code == 200
        det = res.json()
        assert "threat_level" in det
        print("  [OK] /api/detection/status active.")

        # Orchestrator Scenarios List
        res = client.get("/api/orchestrator/scenarios")
        assert res.status_code == 200
        scenarios = res.json()
        assert len(scenarios) >= 4
        print("  [OK] /api/orchestrator/scenarios listed available attack profiles.")


def test_false_positive_prevention_and_attack_isolation():
    print("=== [PHASE 1.2 TEST] False Positive Prevention & Attacker Isolation ===")
    from app.proxy.traffic_logger import TrafficLogger
    from app.pipeline.feature_pipeline import FeaturePipeline
    from app.detection.engine import DetectionEngine

    traffic_logger = TrafficLogger()
    pipeline = FeaturePipeline(traffic_logger)
    engine = DetectionEngine()

    raised_alerts = []
    def on_vec(vec):
        assessment = engine.evaluate_vector(vec)
        if assessment.get("is_threat"):
            raised_alerts.append((vec.identity_id, assessment))

    pipeline.add_listener(on_vec)

    shared_fp = "fp_lab_classroom_pc_identical_image_123"

    # 1. Simulate 5 normal participants joining & light browsing from identical hardware
    for i in range(1, 6):
        user_id = f"student_user_{i}"
        for _ in range(4):
            traffic_logger.log(
                identity_id=user_id,
                method="GET",
                path="/catalog",
                status_code=200,
                request_size_bytes=100,
                response_size_bytes=1500,
                latency_ms=25.0,
                fingerprint_hash=shared_fp,
                target_origin="https://kee-crochet-shop.vercel.app",
            )

    # Assert no alerts raised for normal cohort
    assert len(raised_alerts) == 0, f"Expected 0 alerts for normal cohort, got {len(raised_alerts)}"
    for i in range(1, 6):
        assess = engine.get_assessment(f"student_user_{i}")
        assert assess is not None
        assert not assess.get("is_threat"), f"Student {i} should NOT be flagged as threat"
    print("  [OK] 5 normal participants on shared fingerprint produced 0 false positive alerts.")

    # 2. Simulate 1 bad actor on the same shared fingerprint doing rapid failed auth attempts
    attacker_id = "attacker_in_classroom"
    for _ in range(8):
        traffic_logger.log(
            identity_id=attacker_id,
            method="POST",
            path="/api/login",
            status_code=401,
            request_size_bytes=200,
            response_size_bytes=50,
            latency_ms=45.0,
            fingerprint_hash=shared_fp,
            target_origin="https://kee-crochet-shop.vercel.app",
        )

    # Assert alert IS raised for attacker
    attacker_assess = engine.get_assessment(attacker_id)
    assert attacker_assess is not None
    assert attacker_assess.get("is_threat") is True, "Attacker should be flagged as threat"
    print("  [OK] Attacker on shared fingerprint correctly flagged as threat.")

    # Assert normal students are STILL NOT flagged
    for i in range(1, 6):
        assess = engine.get_assessment(f"student_user_{i}")
        assert assess is not None
        assert not assess.get("is_threat"), f"Student {i} should remain non-threat despite attacker co-presence"
    print("  [OK] Normal cohort remained protected from false positive guilt-by-association.")


if __name__ == "__main__":
    test_phase1_proxy_and_allowlist()
    test_phase2_feature_pipeline()
    test_phase3_detection_engine()
    test_phase4_identity_and_fingerprint()
    test_phase5_attack_orchestrator()
    test_false_positive_prevention_and_attack_isolation()
    test_api_integration()
    print("\n*** ALL TESTS PASSED SUCCESSFULLY! ZERO FALSE POSITIVES. ATTACK LOOP CLOSED. ***")

