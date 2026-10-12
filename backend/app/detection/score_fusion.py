"""Score fusion engine — merges supervised, unsupervised, and rule signals into unified threat intelligence."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.detection.rule_correlator import RuleMatch
from app.pipeline.feature_store import IdentityFeatureVector

logger = logging.getLogger("sentinel_flow.detection.score_fusion")


def fuse_signals(
    *,
    vector: IdentityFeatureVector,
    supervised_res: dict[str, Any],
    unsupervised_res: dict[str, Any],
    rule_matches: list[RuleMatch],
) -> dict[str, Any]:
    """Fuse multi-layer detection signals into a single actionable assessment."""
    rule_ids = [m.rule_id for m in rule_matches]
    sup_prob = float(supervised_res.get("attack_probability", 0.0))
    unsup_score = float(unsupervised_res.get("anomaly_score", 0.0))

    # Weighting:
    # If deterministic attack rules match, threat score escalates decisively
    if rule_matches:
        severities = [m.severity for m in rule_matches]
        if "CRITICAL" in severities:
            threat_score = max(0.92, 0.4 * sup_prob + 0.3 * unsup_score + 0.35)
        elif "HIGH" in severities:
            threat_score = max(0.80, 0.4 * sup_prob + 0.3 * unsup_score + 0.25)
        else:
            threat_score = max(0.65, 0.4 * sup_prob + 0.4 * unsup_score + 0.15)
    else:
        # No explicit rule: blended ML score
        if supervised_res.get("available"):
            threat_score = 0.55 * sup_prob + 0.45 * unsup_score
        else:
            threat_score = unsup_score

    threat_score = round(max(0.0, min(1.0, threat_score)), 4)

    # Determine qualitative threat level
    if threat_score >= 0.85:
        threat_level = "CRITICAL"
    elif threat_score >= 0.70:
        threat_level = "HIGH"
    elif threat_score >= 0.45:
        threat_level = "ELEVATED"
    else:
        threat_level = "LOW"

    is_threat = threat_score >= 0.65

    # Human-readable summary
    if rule_matches:
        top_rule = rule_matches[0]
        human_summary = f"[{top_rule.name}] {top_rule.summary}"
    elif threat_score >= 0.70:
        human_summary = f"Multi-signal anomaly detected (ML confidence {int(threat_score * 100)}%)."
    else:
        human_summary = "Normal operational traffic patterns."

    explanation = unsupervised_res.get("contributions", [])

    return {
        "identity_id": vector.identity_id,
        "threat_score": threat_score,
        "threat_level": threat_level,
        "confidence": round(max(0.85 if rule_matches else 0.70, sup_prob, unsup_score), 2),
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
        "unsupervised_score": unsup_score,
        "explanation": explanation,
        "human_summary": human_summary,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
