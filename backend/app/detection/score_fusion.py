"""Score fusion engine — merges calibrated supervised probability, unsupervised baselines, and MITRE rules."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from app.detection.rule_correlator import RuleMatch
from app.pipeline.feature_store import IdentityFeatureVector

logger = logging.getLogger("sentinel_flow.detection.score_fusion")

RULE_FLOORS: dict[str, float] = {
    "CRITICAL": 0.92,
    "HIGH": 0.78,
    "ELEVATED": 0.55,
    "LOW": 0.30,
}


def fuse_signals(
    *,
    vector: IdentityFeatureVector,
    supervised_res: dict[str, Any],
    unsupervised_res: dict[str, Any],
    rule_matches: list[RuleMatch],
) -> dict[str, Any]:
    """Fuse multi-layer detection signals into a transparent, calibrated, and audit-traceable risk assessment.

    1. Calibrated Stacker: Blends supervised model probability (P_sup) and adaptive unsupervised
       anomaly score (P_unsup) weighted by baseline maturity.
    2. Explicit MITRE Evidence: Deterministic rules act as explainable evidence and provide hard floors
       only for high-confidence signatures (e.g. T1110, T1046, T1190).
    3. Conformal & Concordance Confidence: Measures cross-layer alignment without fabricated certainty.
    """
    rule_ids = [m.rule_id for m in rule_matches]
    mitre_ids = [m.mitre_id for m in rule_matches if getattr(m, "mitre_id", None)]

    sup_available = bool(supervised_res.get("available", False))
    sup_prob = float(supervised_res.get("attack_probability", 0.0))
    unsup_score = float(unsupervised_res.get("anomaly_score", 0.0))
    is_calibrated = bool(unsupervised_res.get("is_calibrated", False))
    baseline_maturity = float(unsupervised_res.get("baseline_maturity", 0.0))
    maturity_state = str(unsupervised_res.get("baseline_maturity_state", "COLD_START"))

    # 1. Calibrated Continuous Stacker Score
    if sup_available and vector.request_count_30s > 0:
        # Weight by baseline maturity: mature baselines get equal trust; cold starts trust supervised model more
        if baseline_maturity >= 0.75:
            w_sup, w_unsup = 0.50, 0.50
        elif baseline_maturity >= 0.25:
            w_sup, w_unsup = 0.60, 0.40
        else:
            w_sup, w_unsup = 0.70, 0.30

        p_stack = w_sup * sup_prob + w_unsup * unsup_score
    elif vector.request_count_30s == 0:
        p_stack = 0.0
    else:
        p_stack = unsup_score

    p_stack = round(max(0.0, min(1.0, p_stack)), 4)

    # 2. Hard Floors for High-Confidence MITRE Signatures
    rule_floor_applied = False
    rule_floor_reason: str | None = None
    hard_floor_val = 0.0

    hard_matches = [m for m in rule_matches if getattr(m, "is_hard_floor", False)]
    if hard_matches:
        severities = [m.severity for m in hard_matches]
        top_sev = "CRITICAL" if "CRITICAL" in severities else ("HIGH" if "HIGH" in severities else "ELEVATED")
        hard_floor_val = RULE_FLOORS.get(top_sev, 0.50)
        
        top_rule = next(m for m in hard_matches if m.severity == top_sev)
        rule_floor_applied = True
        threat_score = max(p_stack, hard_floor_val)
        rule_floor_reason = (
            f"High-confidence signature floor ({hard_floor_val:.2f}) active for {top_rule.name} "
            f"[{getattr(top_rule, 'mitre_id', top_rule.rule_id)}]"
        )
    else:
        threat_score = p_stack

    threat_score = round(max(0.0, min(1.0, threat_score)), 4)

    # 3. Detection Confidence Calculation
    # Combines conformal prediction intervals, cross-layer concordance, and maturity
    concordance = 0
    if rule_matches:
        concordance += 1
    if unsup_score >= 0.60:
        concordance += 1
    if is_calibrated or baseline_maturity >= 0.5:
        concordance += 1
    if sup_available and sup_prob >= 0.60:
        concordance += 1

    conformal_status = supervised_res.get("conformal_status", "NORMAL")
    if rule_floor_applied or (concordance >= 3 and conformal_status == "ATTACK"):
        confidence_level = "HIGH"
        confidence_value = 0.95
    elif concordance >= 2:
        confidence_level = "MEDIUM"
        confidence_value = 0.80
    elif concordance == 1:
        confidence_level = "MODERATE"
        confidence_value = 0.60
    else:
        confidence_level = "LOW"
        confidence_value = 0.35

    # 4. Threat Level Mapping
    if threat_score >= 0.85:
        threat_level = "CRITICAL"
    elif threat_score >= 0.70:
        threat_level = "HIGH"
    elif threat_score >= 0.45:
        threat_level = "ELEVATED"
    else:
        threat_level = "LOW"

    is_threat = threat_score >= 0.70 or (len(rule_matches) > 0 and threat_score >= 0.50)

    # 5. Explanatory Human Summary
    if rule_matches:
        top_rule = rule_matches[0]
        prefix = f"[{top_rule.mitre_id}] " if getattr(top_rule, "mitre_id", None) else ""
        human_summary = f"{prefix}{top_rule.name}: {top_rule.summary}"
    elif threat_score >= 0.70:
        human_summary = (
            f"Statistical behavioral divergence: metrics diverge from learned baseline "
            f"(calibrated risk {int(threat_score * 100)}%, maturity: {maturity_state})."
        )
    else:
        human_summary = "Normal operational traffic patterns."

    explanation = list(unsupervised_res.get("contributions", []))
    if supervised_res.get("explanation"):
        explanation.extend([
            {
                "feature": exp["feature"],
                "value": exp.get("observed_value"),
                "baseline": exp.get("baseline_median"),
                "contribution": "high" if exp.get("relative_elevation", 0) > 3 else "medium",
                "reason": exp.get("human_reason"),
            }
            for exp in supervised_res.get("explanation", [])
        ])

    evidence_snapshot = {
        "request_rate_5s": vector.request_rate_5s,
        "request_rate_30s": vector.request_rate_30s,
        "auth_failures_30s": vector.auth_failures_30s,
        "distinct_ports_10s": vector.distinct_ports_10s,
        "byte_volume_in_5s": vector.byte_volume_in_5s,
        "byte_volume_out_5s": vector.byte_volume_out_5s,
        "endpoint_entropy_30s": vector.endpoint_entropy_30s,
        "error_ratio_30s": vector.error_ratio_30s,
        "p95_latency_30s": vector.p95_latency_30s,
        "fingerprint_churn_5m": vector.fingerprint_churn_5m,
    }

    return {
        "identity_id": vector.identity_id,
        "threat_score": threat_score,
        "threat_level": threat_level,
        "fused_score": threat_score,
        "rule_score": hard_floor_val,
        "ml_score": sup_prob,
        "flow_score": unsup_score,
        "detection_confidence": confidence_value,
        "confidence_level": confidence_level,
        "confidence": confidence_value,
        "is_threat": is_threat,
        "fusion_method": "calibrated_stacker_with_mitre_evidence_floor",
        "stacker_base_score": p_stack,
        "rule_floor_applied": rule_floor_applied,
        "rule_floor_reason": rule_floor_reason,
        "mitre_attack_techniques": mitre_ids,
        "matched_rules": rule_ids,
        "rule_details": [
            {
                "rule_id": m.rule_id,
                "name": m.name,
                "severity": m.severity,
                "mitre_id": getattr(m, "mitre_id", ""),
                "mitre_tactic": getattr(m, "mitre_tactic", ""),
                "confidence": getattr(m, "confidence", 0.85),
                "is_hard_floor": getattr(m, "is_hard_floor", False),
                "summary": m.summary,
                "evidence": m.evidence,
            }
            for m in rule_matches
        ],
        "supervised_label": supervised_res.get("label", 0),
        "supervised_confidence": supervised_res.get("confidence", 0.0),
        "supervised_attack_prob": sup_prob,
        "supervised_conformal_status": conformal_status,
        "supervised_explanation": supervised_res.get("explanation", []),
        "unsupervised_score": unsup_score,
        "is_baseline_calibrated": is_calibrated,
        "baseline_maturity": baseline_maturity,
        "baseline_maturity_state": maturity_state,
        "explanation": explanation,
        "evidence_snapshot": evidence_snapshot,
        "human_summary": human_summary,
        "timestamp_epoch": time.time(),
        "timestamp_iso": datetime.now(timezone.utc).isoformat(),
    }

