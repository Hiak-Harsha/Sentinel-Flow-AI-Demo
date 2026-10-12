"""Rule-based pattern correlator for named attack shapes.

Deterministic rule detection based on multi-window behavioural features:
- Credential Stuffing
- Endpoint Scraping / Enumeration
- Burst DoS / Rate Spikes
- Account Takeover / Session Hijacking (Fingerprint churn)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.pipeline.feature_store import IdentityFeatureVector

logger = logging.getLogger("sentinel_flow.detection.rule_correlator")


@dataclass
class RuleMatch:
    rule_id: str
    name: str
    severity: str  # HIGH, CRITICAL, ELEVATED
    summary: str
    evidence: dict[str, Any]


class RuleCorrelator:
    """Evaluates an IdentityFeatureVector against deterministic attack rules."""

    MIN_EVIDENCE_REQUESTS: int = 3  # Minimum requests in 5m before behavioral rules evaluate

    def evaluate(self, vector: IdentityFeatureVector) -> list[RuleMatch]:
        matches: list[RuleMatch] = []

        # Floor check: prevent 1-2 initial join/first-action requests from firing behavioral rules
        total_requests = max(vector.request_count_5m, vector.request_count_30s, vector.request_count_5s)
        has_min_evidence = total_requests >= self.MIN_EVIDENCE_REQUESTS

        # 1. Credential Stuffing
        # Signature: Multi-account churn on same client/fingerprint WITH elevated 4xx error ratio,
        # or concentrated auth failure surge from a single identity
        if has_min_evidence and (
            (vector.account_churn_5m >= 3 and vector.error_ratio_30s >= 0.3)
            or (vector.error_ratio_30s >= 0.70 and vector.request_count_30s >= 4)
        ):
            failed_count = max(1, int(vector.error_ratio_30s * vector.request_count_30s))
            matches.append(
                RuleMatch(
                    rule_id="credential_stuffing",
                    name="Credential Stuffing Attack",
                    severity="HIGH",
                    summary=(
                        f"{failed_count} failed auth attempts in 30s across {vector.account_churn_5m} "
                        f"co-located identities ({int(vector.error_ratio_30s * 100)}% 4xx failure rate)."
                    ),
                    evidence={
                        "account_churn_5m": vector.account_churn_5m,
                        "cohort_size_5m": getattr(vector, "cohort_size_5m", 1),
                        "error_ratio_30s": vector.error_ratio_30s,
                        "failed_requests_30s": failed_count,
                        "request_rate_5s": vector.request_rate_5s,
                        "mean_interval_ms": vector.inter_request_interval_mean_30s,
                    },
                )
            )

        # 2. Web Scraping / Endpoint Enumeration
        # Signature: High path entropy, low error rate, programmatic low-variance cadence
        if (
            has_min_evidence
            and vector.endpoint_entropy_5m >= 2.0
            and vector.error_ratio_30s <= 0.20
            and vector.request_count_30s >= 8
            and vector.inter_request_interval_std_30s < 350.0
        ):
            matches.append(
                RuleMatch(
                    rule_id="scraping",
                    name="Automated Scraping / Reconnaissance",
                    severity="ELEVATED",
                    summary=(
                        f"Robotic crawling across {vector.request_count_30s} endpoints with high entropy "
                        f"({vector.endpoint_entropy_5m} bits) and uniform interval (±{vector.inter_request_interval_std_30s}ms)."
                    ),
                    evidence={
                        "endpoint_entropy_5m": vector.endpoint_entropy_5m,
                        "request_count_30s": vector.request_count_30s,
                        "interval_std_ms": vector.inter_request_interval_std_30s,
                        "error_ratio_30s": vector.error_ratio_30s,
                    },
                )
            )

        # 3. Burst DoS / Volumetric Spike
        # Signature: High instantaneous rate (>= 6 req/s) or 3x spike over 30s baseline
        # Evaluates immediately because burst volume itself is the evidence
        is_high_rate = vector.request_rate_5s >= 6.0
        is_rate_spike = (
            vector.request_count_5s >= 6
            and vector.request_rate_5s >= 3.0 * max(0.5, vector.request_rate_30s)
        )
        if is_high_rate or is_rate_spike:
            matches.append(
                RuleMatch(
                    rule_id="burst_dos",
                    name="Application Layer Burst / DoS",
                    severity="CRITICAL" if vector.request_rate_5s >= 12.0 else "HIGH",
                    summary=(
                        f"Volumetric surge: {vector.request_rate_5s} req/s in 5s window "
                        f"({vector.byte_volume_in_5s + vector.byte_volume_out_5s} bytes transferred)."
                    ),
                    evidence={
                        "request_rate_5s": vector.request_rate_5s,
                        "request_rate_30s": vector.request_rate_30s,
                        "total_volume_bytes_5s": vector.byte_volume_in_5s + vector.byte_volume_out_5s,
                    },
                )
            )

        # 4. Account Takeover / Session Hijacking (Fingerprint Churn)
        # Signature: Single account observed with 2 or more distinct client fingerprints in short succession
        if has_min_evidence and vector.fingerprint_churn_5m >= 2:
            matches.append(
                RuleMatch(
                    rule_id="account_takeover",
                    name="Session Anomaly / Fingerprint Mismatch",
                    severity="HIGH",
                    summary=(
                        f"Identity observed across {vector.fingerprint_churn_5m} distinct device fingerprints "
                        f"within 5 minutes over {vector.request_count_5m} requests."
                    ),
                    evidence={
                        "fingerprint_churn_5m": vector.fingerprint_churn_5m,
                        "identity_id": vector.identity_id,
                        "request_count_5m": vector.request_count_5m,
                    },
                )
            )

        return matches
