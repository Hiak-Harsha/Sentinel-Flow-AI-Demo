"""Phase 5 verification tests: Detection Fusion Redesign, MITRE ATT&CK rules,
per-identity adaptive baselines, incident lifecycle with hysteresis, and zero flapping.
"""

from __future__ import annotations

import random
import time
import pytest

from app.detection.alert_manager import AlertManager, IncidentRecord, HYSTERESIS_COUNT
from app.detection.engine import DetectionEngine
from app.detection.rule_correlator import RuleCorrelator, RuleMatch
from app.detection.score_fusion import fuse_signals
from app.detection.supervised_model import SupervisedClassifier
from app.detection.unsupervised_model import IdentityAdaptiveBaseline, OnlineAnomalyDetector
from app.pipeline.feature_store import IdentityFeatureVector


def test_benign_burst_does_not_alert():
    """Verify that a legitimate asset burst (e.g., 8 parallel asset loads on page open) does not alert."""
    engine = DetectionEngine()

    # Normal browser parallel asset load: 8 requests in 2 seconds, all successful (status 200), low latency
    burst_vector = IdentityFeatureVector(
        identity_id="user_browser_burst",
        timestamp_epoch=time.time(),
        timestamp_iso="2026-10-15T02:00:00Z",
        request_count_5s=8,
        request_rate_5s=4.0,
        request_count_30s=8,
        request_rate_30s=0.27,
        status_2xx_count_30s=8,
        error_ratio_30s=0.0,
        auth_failures_30s=0,
        distinct_ports_10s=1,
        canary_hits_30s=0,
        p95_latency_30s=18.5,
        target_error_ratio_30s=0.0,
        endpoint_entropy_30s=1.2,
        byte_volume_in_5s=1200,
        byte_volume_out_5s=45000,
    )

    assessment = engine.evaluate_vector(burst_vector)

    assert assessment["is_threat"] is False, "Benign asset burst must not be flagged as a threat"
    assert assessment["threat_level"] in ("LOW", "ELEVATED"), f"Expected LOW/ELEVATED, got {assessment['threat_level']}"
    assert "raised_alert" not in assessment, "No alert should be raised for benign burst"
    assert len(engine.alerts.get_active_alerts()) == 0, "Active alerts should remain 0"


def test_brute_force_alerts_within_n_seconds_with_mitre_mapping():
    """Verify credential stuffing triggers T1110 incident with SLA timer and hard floor."""
    engine = DetectionEngine()

    now = time.time()
    bf_vector = IdentityFeatureVector(
        identity_id="attacker_brute_force",
        timestamp_epoch=now,
        timestamp_iso="2026-10-15T02:00:00Z",
        auth_failures_30s=6,
        account_churn_5m=4,
        error_ratio_30s=1.0,
        request_rate_5s=5.0,
        request_count_5s=10,
        request_count_30s=15,
        inter_request_interval_mean_30s=200.0,
    )

    assessment = engine.evaluate_vector(bf_vector)

    assert assessment["is_threat"] is True, "Brute force attack must be flagged as a threat"
    assert assessment["threat_level"] in ("HIGH", "CRITICAL")
    assert "credential_stuffing" in assessment["matched_rules"]
    assert "T1110" in assessment["mitre_attack_techniques"]
    assert assessment["rule_floor_applied"] is True, "High-confidence T1110 rule should apply hard floor"
    assert "T1110" in (assessment["rule_floor_reason"] or "")

    # Alert/incident lifecycle assertions
    alert = assessment.get("raised_alert")
    assert alert is not None, "An alert must be raised immediately"
    assert alert["primary_technique"] == "T1110"
    assert alert["status"] == "ACTIVE"
    assert alert["time_to_detect_seconds"] <= 1.0, "Time to detect must be within 1.0s window"
    assert alert["sla_deadline_epoch"] > now, "SLA deadline must be set in the future"
    assert alert["sla_status"] == "WITHIN_SLA"
    assert alert["event_count"] == 1


def test_low_and_slow_attack_detected_by_adaptive_unsupervised_layer():
    """Verify low-and-slow reconnaissance is caught by per-identity adaptive baseline."""
    unsup = OnlineAnomalyDetector()
    engine = DetectionEngine(unsupervised=unsup)
    target_id = "stealth_recon_target"

    # Step 1: Establish mature baseline over 25 benign windows
    for i in range(25):
        vec = IdentityFeatureVector(
            identity_id=target_id,
            timestamp_epoch=time.time(),
            timestamp_iso="2026-10-15T02:00:00Z",
            request_count_5s=1,
            request_rate_5s=0.05,
            request_count_30s=2,
            request_rate_30s=0.04,
            endpoint_entropy_30s=0.3,
            error_ratio_30s=0.0,
            byte_volume_in_5s=100,
            byte_volume_out_5s=300,
            inter_request_interval_mean_30s=4500.0,
        )
        engine.evaluate_vector(vec)

    baseline = unsup.get_identity_baseline(target_id)
    assert baseline.baseline_maturity >= 0.8, f"Expected mature baseline, got {baseline.baseline_maturity}"
    assert baseline.maturity_state == "MATURE"

    # Step 2: Inject low-and-slow reconnaissance
    # Request rate is only 0.45 req/s (far below volumetric DoS threshold of 6.0 req/s, so NO volumetric rule triggers)
    # But 0.45 req/s is 9x higher than this identity's established baseline!
    stealth_vec = IdentityFeatureVector(
        identity_id=target_id,
        timestamp_epoch=time.time(),
        timestamp_iso="2026-10-15T02:01:00Z",
        request_count_5s=3,
        request_rate_5s=0.55,
        request_count_30s=12,
        request_rate_30s=0.40,
        endpoint_entropy_30s=2.8,  # Probing across multiple hidden endpoints
        error_ratio_30s=0.05,
        byte_volume_in_5s=400,
        byte_volume_out_5s=1500,
        inter_request_interval_mean_30s=800.0,
    )

    assessment = engine.evaluate_vector(stealth_vec)

    # Caught by unsupervised divergence from identity's learned normal
    assert assessment["unsupervised_score"] >= 0.65, (
        f"Unsupervised score {assessment['unsupervised_score']} should reflect anomaly distance"
    )
    assert assessment["baseline_maturity"] >= 0.8
    assert assessment["baseline_maturity_state"] == "MATURE"
    # Verify explanation highlights the elevated features
    contributions = assessment["explanation"]
    assert any("request_rate" in exp.get("feature", "") or "entropy" in exp.get("feature", "") for exp in contributions)


def test_no_flapping_across_1000_benign_windows():
    """Verify zero alert flapping and zero spurious state transitions across 1,000 benign windows."""
    engine = DetectionEngine()
    random.seed(42)

    alerts_raised = 0
    threat_flag_count = 0

    for i in range(1000):
        # Realistic noisy benign browsing telemetry
        rate_5s = max(0.05, random.gauss(0.4, 0.15))
        rate_30s = max(0.05, random.gauss(0.35, 0.10))
        entropy = max(0.1, min(1.4, random.gauss(0.6, 0.2)))
        errors = 0.0 if random.random() > 0.05 else 0.02
        vol_in = int(max(100, random.gauss(400, 100)))
        vol_out = int(max(500, random.gauss(2000, 500)))

        vec = IdentityFeatureVector(
            identity_id=f"benign_user_{i % 5}",  # 5 rotating benign identities
            timestamp_epoch=time.time() + i,
            timestamp_iso="2026-10-15T02:00:00Z",
            request_count_5s=max(1, int(rate_5s * 5)),
            request_rate_5s=round(rate_5s, 2),
            request_count_30s=max(1, int(rate_30s * 30)),
            request_rate_30s=round(rate_30s, 2),
            endpoint_entropy_30s=round(entropy, 2),
            error_ratio_30s=errors,
            byte_volume_in_5s=vol_in,
            byte_volume_out_5s=vol_out,
            p95_latency_30s=random.gauss(25.0, 5.0),
            inter_request_interval_mean_30s=random.gauss(2500.0, 300.0),
        )

        assessment = engine.evaluate_vector(vec)
        if assessment.get("is_threat"):
            threat_flag_count += 1
        if "raised_alert" in assessment:
            alerts_raised += 1

    assert alerts_raised == 0, f"Expected 0 alerts raised across 1000 benign windows, got {alerts_raised}"
    assert threat_flag_count == 0, f"Expected 0 threat flags across 1000 benign windows, got {threat_flag_count}"
    assert len(engine.alerts.get_active_alerts()) == 0


def test_incident_grouping_escalation_and_hysteresis():
    """Verify incident grouping within window, immediate escalation, and hysteresis de-escalation."""
    alert_mgr = AlertManager(grouping_window_seconds=60.0)

    # 1. Initial detection creates 1 Incident
    assessment_1 = {
        "identity_id": "attacker_hysteresis",
        "is_threat": True,
        "threat_level": "ELEVATED",
        "threat_score": 0.58,
        "matched_rules": ["scraping"],
        "mitre_attack_techniques": ["T1595"],
        "human_summary": "Automated endpoint scan",
        "explanation": [],
        "evidence_snapshot": {"request_count": 10},
        "model_version": "2.0.0",
    }

    inc_1 = alert_mgr.process_assessment(assessment_1)
    assert inc_1 is not None
    assert inc_1.event_count == 1
    assert inc_1.threat_level == "ELEVATED"
    assert len(alert_mgr.get_active_alerts()) == 1

    # 2. Subsequent detection within grouping window groups into same incident (no duplicate)
    assessment_2 = {
        "identity_id": "attacker_hysteresis",
        "is_threat": True,
        "threat_level": "ELEVATED",
        "threat_score": 0.60,
        "matched_rules": ["scraping"],
        "mitre_attack_techniques": ["T1595"],
        "human_summary": "Automated endpoint scan",
        "explanation": [],
        "evidence_snapshot": {"request_count": 15},
        "model_version": "2.0.0",
    }

    inc_2 = alert_mgr.process_assessment(assessment_2)
    assert inc_2 is not None
    assert inc_2.incident_id == inc_1.incident_id, "Must group into same incident ID"
    assert inc_2.event_count == 2
    assert len(alert_mgr.get_active_alerts()) == 1, "Must not duplicate active alert count"

    # 3. Escalation: Threat level rises to CRITICAL -> immediate escalation
    assessment_3 = {
        "identity_id": "attacker_hysteresis",
        "is_threat": True,
        "threat_level": "CRITICAL",
        "threat_score": 0.92,
        "matched_rules": ["scraping"],
        "mitre_attack_techniques": ["T1595"],
        "human_summary": "Critical endpoint flood",
        "explanation": [],
        "evidence_snapshot": {"request_count": 50},
        "model_version": "2.0.0",
    }

    inc_3 = alert_mgr.process_assessment(assessment_3)
    assert inc_3.threat_level == "CRITICAL", "Incident must escalate immediately to CRITICAL"
    assert inc_3.event_count == 3
    assert inc_3.peak_threat_score == 0.92

    # 4. Hysteresis Test: Score dips to 0.70 (below CRITICAL 0.85 threshold)
    # Window 1 below threshold: does NOT de-escalate yet (counter = 1)
    assessment_low_1 = dict(assessment_3, threat_level="HIGH", threat_score=0.70)
    inc_4 = alert_mgr.process_assessment(assessment_low_1)
    assert inc_4.threat_level == "CRITICAL", "Hysteresis must prevent premature de-escalation on 1st dip"
    assert inc_4.deescalation_counter == 1

    # Window 2 below threshold: does NOT de-escalate yet (counter = 2)
    inc_5 = alert_mgr.process_assessment(assessment_low_1)
    assert inc_5.threat_level == "CRITICAL", "Hysteresis must prevent premature de-escalation on 2nd dip"
    assert inc_5.deescalation_counter == 2

    # Window 3 below threshold: counter reaches HYSTERESIS_COUNT (3) -> de-escalates to HIGH!
    inc_6 = alert_mgr.process_assessment(assessment_low_1)
    assert inc_6.threat_level == "HIGH", "Hysteresis safely de-escalates after 3 consecutive low windows"
    assert inc_6.deescalation_counter == 0

    # 5. Resolve incident
    resolved = alert_mgr.resolve_alert(inc_1.incident_id, analyst="soc_lead", notes="Verified containment")
    assert resolved is True
    assert len(alert_mgr.get_active_alerts()) == 0
