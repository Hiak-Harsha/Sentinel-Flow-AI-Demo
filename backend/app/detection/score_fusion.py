"""Score fusion engine — merges supervised, unsupervised, and rule signals into unified threat intelligence."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from app.detection.rule_correlator import RuleMatch
from app.pipeline.feature_store import IdentityFeatureVector

logger = logging.getLogger("sentinel_flow.detection.score_fusion")

SEVERITY_WEIGHTS = {
    "CRITICAL": 0.95,
    "HIGH": 0.80,
    "ELEVATED": 0.60,
    "LOW": 0.30,
}


def fuse_signals(
    *,
    vector: IdentityFeatureVector,
    supervised_res: dict[str, Any],
    unsupervised_res: dict[str, Any],
    rule_matches: list[RuleMatch],
) -> dict[str, Any]:
    """Fuse multi-layer detection signals into a transparent, audit-traceable risk assessment.

    Avoids forced confidence overrides; clearly distinguishes deterministic rule matches,
    empirical statistical anomaly distance, and offline academic benchmark references.
    """
    rule_ids = [m.rule_id for m in rule_matches]
    sup_prob = float(supervised_res.get("attack_probability", 0.0))
    unsup_score = float(unsupervised_res.get("anomaly_score", 0.0))
    is_calibrated = bool(unsupervised_res.get("is_calibrated", False))

    # 1. Deterministic Rule Score
    if rule_matches:
        severities = [m.severity for m in rule_matches]
        rule_score = max(SEVERITY_WEIGHTS.get(s, 0.5) for s in severities)
    else:
        rule_score = 0.0

    # 2. Combined Risk Score
    # If deterministic rules match, they anchor the risk score with statistical anomaly augmentation.
    # Otherwise, empirical unsupervised anomaly score governs live risk.
    if rule_matches:
        threat_score = 0.70 * rule_score + 0.30 * unsup_score
    else:
        threat_score = unsup_score

    threat_score = round(max(0.0, min(1.0, threat_score)), 4)

    # 3. Detection Confidence Calculation
    # Measures evidence concordance across layers, not a fabricated probability
    concordance = 0
    if rule_matches:
        concordance += 1
    if unsup_score >= 0.60:
        concordance += 1
    if is_calibrated:
        concordance += 1
    if supervised_res.get("available") and sup_prob >= 0.60:
        concordance += 1

    if concordance >= 3:
        confidence_level = "HIGH"
        confidence_value = 0.90
    elif concordance == 2:
        confidence_level = "MEDIUM"
        confidence_value = 0.75
    elif concordance == 1:
        confidence_level = "MODERATE"
        confidence_value = 0.55
    else:
        confidence_level = "LOW"
        confidence_value = 0.35

    # 4. Qualitative Threat Level
    if threat_score >= 0.85:
        threat_level = "CRITICAL"
    elif threat_score >= 0.70:
        threat_level = "HIGH"
    elif threat_score >= 0.45:
        threat_level = "ELEVATED"
    else:
        threat_level = "LOW"

    is_threat = threat_score >= 0.65 or (len(rule_matches) > 0 and threat_score >= 0.50)

    # 5. Explanatory Human Summary
    if rule_matches:
        top_rule = rule_matches[0]
        human_summary = f"[{top_rule.name}] {top_rule.summary}"
    elif threat_score >= 0.70:
        human_summary = f"Statistical behavioral anomaly: observed metrics diverge from baseline (risk {int(threat_score * 100)}%)."
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

    return {
        "identity_id": vector.identity_id,
        "threat_score": threat_score,
        "threat_level": threat_level,
        "detection_confidence": confidence_value,
        "confidence_level": confidence_level,
        "confidence": confidence_value,
        "is_threat": is_threat,
        "matched_rules": rule_ids,
        "rule_details": [
            {
                "rule_id": m.rule_id,
                "name": m.name,
                "severity": m.severity,
                "summary": m.summary,
                "evidence": m.evidence,
            }
            for m in rule_matches
        ],
        "supervised_label": supervised_res.get("label", 0),
        "supervised_confidence": supervised_res.get("confidence", 0.0),
        "supervised_attack_prob": sup_prob,
        "supervised_conformal_status": supervised_res.get("conformal_status", "NORMAL"),
        "supervised_explanation": supervised_res.get("explanation", []),
        "unsupervised_score": unsup_score,
        "is_baseline_calibrated": is_calibrated,
        "explanation": explanation,
        "human_summary": human_summary,
        "timestamp_epoch": time.time(),
        "timestamp_iso": datetime.now(timezone.utc).isoformat(),
    }
