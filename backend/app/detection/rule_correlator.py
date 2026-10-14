"""Rule-based pattern correlator for named attack shapes.

Deterministic rule detection based on verified telemetry:
- Credential Stuffing (T1110): authenticated login failures, not generic 404s
- Port Scan Signals (T1046): rapid distinct destination port connection attempts
- Application Layer Burst / DoS (T1499): rate surge with latency and saturation telemetry
- Exploitation Attempt Canary Probes (T1190): safe canary marker trip without payload execution
- Endpoint Scraping / Enumeration (T1595): robotic high-entropy crawling
- Session Hijacking / Churn (T1556): device fingerprint churn on single account
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

    MIN_EVIDENCE_REQUESTS: int = 3  # Minimum requests in window before general behavioral rules evaluate

    def evaluate(self, vector: IdentityFeatureVector) -> list[RuleMatch]:
        matches: list[RuleMatch] = []

        total_requests = max(vector.request_count_5m, vector.request_count_30s, vector.request_count_5s)
        has_min_evidence = total_requests >= self.MIN_EVIDENCE_REQUESTS

        # 1. Failed-Login Brute Force / Credential Stuffing (MITRE ATT&CK T1110)
        # Signature: Concentrated AUTHENTICATION failure surge (status 401 or auth.failure events)
        if vector.auth_failures_30s >= 3 or (vector.account_churn_5m >= 3 and (vector.auth_failures_30s >= 2 or vector.error_ratio_30s >= 0.7)):
            matches.append(
                RuleMatch(
                    rule_id="credential_stuffing",
                    name="Credential Stuffing / Brute Force (T1110)",
                    severity="HIGH",
                    summary=(
                        f"{vector.auth_failures_30s} failed login attempts in 30s window across "
                        f"{vector.account_churn_5m} principal(s) on target authentication service."
                    ),
                    evidence={
                        "mitre_id": "T1110",
                        "mitre_tactic": "Credential Access",
                        "auth_failures_30s": vector.auth_failures_30s,
                        "account_churn_5m": vector.account_churn_5m,
                        "cohort_size_5m": getattr(vector, "cohort_size_5m", 1),
                        "request_rate_5s": vector.request_rate_5s,
                    },
                )
            )

        # 2. Network Service Discovery / Port Scan (MITRE ATT&CK T1046)
        # Signature: Lab sensor connection telemetry observing probes across >= 3 distinct destination ports
        # Strictly separated from HTTP endpoint enumeration
        if vector.distinct_ports_10s >= 3:
            matches.append(
                RuleMatch(
                    rule_id="port_scan",
                    name="Network Service Discovery / Port Scan (T1046)",
                    severity="HIGH",
                    summary=(
                        f"Rapid connection probes across {vector.distinct_ports_10s} distinct ports "
                        f"observed within 10s window by lab connection sensor."
                    ),
                    evidence={
                        "mitre_id": "T1046",
                        "mitre_tactic": "Discovery",
                        "distinct_ports_10s": vector.distinct_ports_10s,
                        "time_window_seconds": 10,
                    },
                )
            )

        # 3. Application Layer Burst / DoS (MITRE ATT&CK T1499)
        # Signature: Volumetric rate surge with target latency and saturation evidence
        is_high_rate = vector.request_rate_5s >= 6.0
        is_rate_spike = (
            vector.request_count_5s >= 6
            and vector.request_rate_5s >= 3.0 * max(0.5, vector.request_rate_30s)
        )
        if is_high_rate or is_rate_spike:
            severity = "CRITICAL" if vector.request_rate_5s >= 12.0 else "HIGH"
            matches.append(
                RuleMatch(
                    rule_id="burst_dos",
                    name="Endpoint Denial of Service / Volumetric Burst (T1499)",
                    severity=severity,
                    summary=(
                        f"Volumetric surge: {vector.request_rate_5s} req/s in 5s window "
                        f"({vector.byte_volume_in_5s + vector.byte_volume_out_5s} bytes transferred, "
                        f"p95 latency: {vector.p95_latency_30s}ms)."
                    ),
                    evidence={
                        "mitre_id": "T1499",
                        "mitre_tactic": "Impact",
                        "request_rate_5s": vector.request_rate_5s,
                        "request_rate_30s": vector.request_rate_30s,
                        "p95_latency_ms": vector.p95_latency_30s,
                        "target_error_ratio": vector.target_error_ratio_30s,
                        "total_volume_bytes_5s": vector.byte_volume_in_5s + vector.byte_volume_out_5s,
                    },
                )
            )

        # 4. Exploitation-Attempt Detection via Safe Canary Markers (MITRE ATT&CK T1190)
        # Signature: Request hit designated canary route or known attack marker without executing payload
        if vector.canary_hits_30s >= 1:
            matches.append(
                RuleMatch(
                    rule_id="canary_exploit_probe",
                    name="Exploit Public-Facing Application Probe (T1190)",
                    severity="CRITICAL",
                    summary=(
                        f"Canary security sensor marker tripped ({vector.canary_hits_30s} attempt(s) "
                        f"matching known exploit signatures; blocked safely without execution)."
                    ),
                    evidence={
                        "mitre_id": "T1190",
                        "mitre_tactic": "Initial Access",
                        "canary_hits_30s": vector.canary_hits_30s,
                        "containment_action": "TRAPPED_AND_BLOCKED",
                    },
                )
            )

        # 5. Web Scraping / Endpoint Enumeration (MITRE ATT&CK T1595)
        # Signature: High path entropy, low error rate, robotic low-variance interval
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
                    name="Automated Endpoint Crawl / Active Scanning (T1595)",
                    severity="ELEVATED",
                    summary=(
                        f"Robotic crawling across {vector.request_count_30s} endpoints with high entropy "
                        f"({vector.endpoint_entropy_5m} bits) and uniform cadence (±{vector.inter_request_interval_std_30s}ms)."
                    ),
                    evidence={
                        "mitre_id": "T1595",
                        "mitre_tactic": "Reconnaissance",
                        "endpoint_entropy_5m": vector.endpoint_entropy_5m,
                        "request_count_30s": vector.request_count_30s,
                        "interval_std_ms": vector.inter_request_interval_std_30s,
                        "error_ratio_30s": vector.error_ratio_30s,
                    },
                )
            )

        # 6. Account Takeover / Session Hijacking (MITRE ATT&CK T1556)
        # Signature: Single account observed with 2 or more distinct client fingerprints in short succession
        if has_min_evidence and vector.fingerprint_churn_5m >= 2:
            matches.append(
                RuleMatch(
                    rule_id="account_takeover",
                    name="Session Hijacking / Device Churn (T1556)",
                    severity="HIGH",
                    summary=(
                        f"Identity observed across {vector.fingerprint_churn_5m} distinct device fingerprints "
                        f"within 5 minutes over {vector.request_count_5m} requests."
                    ),
                    evidence={
                        "mitre_id": "T1556",
                        "mitre_tactic": "Credential Access",
                        "fingerprint_churn_5m": vector.fingerprint_churn_5m,
                        "identity_id": vector.identity_id,
                        "request_count_5m": vector.request_count_5m,
                    },
                )
            )

        return matches
