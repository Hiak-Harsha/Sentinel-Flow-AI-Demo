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
    severity: str  # HIGH, CRITICAL, ELEVATED, LOW
    summary: str
    evidence: dict[str, Any]
    mitre_id: str = ""
    mitre_tactic: str = ""
    confidence: float = 0.85
    is_hard_floor: bool = False


class RuleCorrelator:
    """Evaluates an IdentityFeatureVector against deterministic attack rules mapped to MITRE ATT&CK."""

    MIN_EVIDENCE_REQUESTS: int = 3  # Minimum requests in window before general behavioral rules evaluate

    def evaluate(self, vector: IdentityFeatureVector) -> list[RuleMatch]:
        matches: list[RuleMatch] = []

        total_requests = max(vector.request_count_5m, vector.request_count_30s, vector.request_count_5s)
        has_min_evidence = total_requests >= self.MIN_EVIDENCE_REQUESTS

        # 1. Failed-Login Brute Force / Credential Stuffing (MITRE ATT&CK T1110)
        # Signature: Concentrated AUTHENTICATION failure surge (status 401 or auth.failure events)
        if vector.auth_failures_30s >= 3 or (
            vector.account_churn_5m >= 3 and (vector.auth_failures_30s >= 2 or vector.error_ratio_30s >= 0.7)
        ) or getattr(vector, "cross_identity_credential_reuse_count_30s", 0) >= 2:
            severity = "CRITICAL" if vector.auth_failures_30s >= 8 else "HIGH"
            matches.append(
                RuleMatch(
                    rule_id="credential_stuffing",
                    name="Credential Stuffing / Brute Force (T1110)",
                    severity=severity,
                    mitre_id="T1110",
                    mitre_tactic="Credential Access",
                    confidence=0.95,
                    is_hard_floor=True,
                    summary=(
                        f"{vector.auth_failures_30s} failed login attempts in 30s window across "
                        f"{vector.account_churn_5m} principal(s) on target authentication service."
                    ),
                    evidence={
                        "mitre_id": "T1110",
                        "mitre_tactic": "Credential Access",
                        "technique": "Brute Force: Credential Stuffing",
                        "auth_failures_30s": vector.auth_failures_30s,
                        "account_churn_5m": vector.account_churn_5m,
                        "cohort_size_5m": getattr(vector, "cohort_size_5m", 1),
                        "request_rate_5s": vector.request_rate_5s,
                        "threshold_observed": vector.auth_failures_30s,
                        "threshold_limit": 3,
                    },
                )
            )

        # 2. Network Service Discovery / Port Scan (MITRE ATT&CK T1046)
        # Signature: Lab sensor connection telemetry observing probes across >= 3 distinct destination ports
        if vector.distinct_ports_10s >= 3:
            matches.append(
                RuleMatch(
                    rule_id="port_scan",
                    name="Network Service Discovery / Port Scan (T1046)",
                    severity="HIGH",
                    mitre_id="T1046",
                    mitre_tactic="Discovery",
                    confidence=0.90,
                    is_hard_floor=True,
                    summary=(
                        f"Rapid connection probes across {vector.distinct_ports_10s} distinct ports "
                        f"observed within 10s window by lab connection sensor."
                    ),
                    evidence={
                        "mitre_id": "T1046",
                        "mitre_tactic": "Discovery",
                        "technique": "Network Service Discovery",
                        "distinct_ports_10s": vector.distinct_ports_10s,
                        "threshold_limit": 3,
                        "time_window_seconds": 10,
                    },
                )
            )

        # 3. Application Layer Burst / DoS (MITRE ATT&CK T1499)
        # Signature: Volumetric rate surge with target latency and saturation evidence
        is_high_rate = vector.request_rate_5s >= 8.0
        is_rate_spike = (
            vector.request_count_5s >= 12
            and vector.request_rate_5s >= 3.5 * max(1.0, vector.request_rate_30s)
        )
        if is_high_rate or is_rate_spike:
            # Distinguish damaging DoS attacks from benign asset bursts:
            # True DoS causes latency degradation, error spikes, or extreme volume.
            has_damage_signals = (
                vector.p95_latency_30s >= 200.0
                or vector.target_error_ratio_30s >= 0.15
                or vector.error_ratio_30s >= 0.20
                or vector.request_count_5s >= 15
            )
            is_extreme = vector.request_rate_5s >= 12.0
            
            if is_extreme:
                severity = "CRITICAL"
                is_hard = True
                conf = 0.92
            elif has_damage_signals:
                severity = "HIGH"
                is_hard = True
                conf = 0.85
            else:
                severity = "ELEVATED"
                is_hard = False
                conf = 0.60

            matches.append(
                RuleMatch(
                    rule_id="burst_dos",
                    name="Endpoint Denial of Service / Volumetric Burst (T1499)",
                    severity=severity,
                    mitre_id="T1499",
                    mitre_tactic="Impact",
                    confidence=conf,
                    is_hard_floor=is_hard,
                    summary=(
                        f"Volumetric surge: {vector.request_rate_5s} req/s in 5s window "
                        f"({vector.byte_volume_in_5s + vector.byte_volume_out_5s} bytes transferred, "
                        f"p95 latency: {vector.p95_latency_30s}ms)."
                    ),
                    evidence={
                        "mitre_id": "T1499",
                        "mitre_tactic": "Impact",
                        "technique": "Endpoint Denial of Service",
                        "request_rate_5s": vector.request_rate_5s,
                        "request_rate_30s": vector.request_rate_30s,
                        "p95_latency_ms": vector.p95_latency_30s,
                        "target_error_ratio": vector.target_error_ratio_30s,
                        "total_volume_bytes_5s": vector.byte_volume_in_5s + vector.byte_volume_out_5s,
                        "is_extreme_rate": is_extreme,
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
                    mitre_id="T1190",
                    mitre_tactic="Initial Access",
                    confidence=0.99,
                    is_hard_floor=True,
                    summary=(
                        f"Canary security sensor marker tripped ({vector.canary_hits_30s} attempt(s) "
                        f"matching known exploit signatures; blocked safely without execution)."
                    ),
                    evidence={
                        "mitre_id": "T1190",
                        "mitre_tactic": "Initial Access",
                        "technique": "Exploit Public-Facing Application",
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
                    mitre_id="T1595",
                    mitre_tactic="Reconnaissance",
                    confidence=0.75,
                    is_hard_floor=False,
                    summary=(
                        f"Robotic crawling across {vector.request_count_30s} endpoints with high entropy "
                        f"({vector.endpoint_entropy_5m} bits) and uniform cadence (±{vector.inter_request_interval_std_30s}ms)."
                    ),
                    evidence={
                        "mitre_id": "T1595",
                        "mitre_tactic": "Reconnaissance",
                        "technique": "Active Scanning: Scanning IP Blocks",
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
                    mitre_id="T1556",
                    mitre_tactic="Credential Access",
                    confidence=0.88,
                    is_hard_floor=True,
                    summary=(
                        f"Identity observed across {vector.fingerprint_churn_5m} distinct device fingerprints "
                        f"within 5 minutes over {vector.request_count_5m} requests."
                    ),
                    evidence={
                        "mitre_id": "T1556",
                        "mitre_tactic": "Credential Access",
                        "technique": "Modify Authentication Process",
                        "fingerprint_churn_5m": vector.fingerprint_churn_5m,
                        "identity_id": vector.identity_id,
                        "request_count_5m": vector.request_count_5m,
                    },
                )
            )

        # 7. Automated Data Exfiltration (MITRE ATT&CK T1020)
        # Signature: Abnormally large outbound egress volume dominating inbound traffic
        is_exfil_5s = (
            vector.byte_volume_out_5s >= 250000
            and vector.byte_volume_out_5s >= 8 * max(1000, vector.byte_volume_in_5s)
        )
        is_exfil_30s = (
            vector.byte_volume_out_30s >= 1000000
            and vector.byte_volume_out_30s >= 8 * max(2000, vector.byte_volume_in_30s)
        )
        if has_min_evidence and (is_exfil_5s or is_exfil_30s):
            vol_out = max(vector.byte_volume_out_5s, vector.byte_volume_out_30s)
            vol_in = max(vector.byte_volume_in_5s, vector.byte_volume_in_30s)
            matches.append(
                RuleMatch(
                    rule_id="data_exfiltration",
                    name="Automated Data Exfiltration (T1020)",
                    severity="HIGH",
                    mitre_id="T1020",
                    mitre_tactic="Exfiltration",
                    confidence=0.85,
                    is_hard_floor=True,
                    summary=(
                        f"Asymmetric outbound data transfer: {vol_out} bytes outbound vs "
                        f"{vol_in} bytes inbound (egress ratio: {round(vol_out / max(1, vol_in), 1)}x)."
                    ),
                    evidence={
                        "mitre_id": "T1020",
                        "mitre_tactic": "Exfiltration",
                        "technique": "Automated Exfiltration",
                        "byte_volume_out_5s": vector.byte_volume_out_5s,
                        "byte_volume_in_5s": vector.byte_volume_in_5s,
                        "byte_volume_out_30s": vector.byte_volume_out_30s,
                        "byte_volume_in_30s": vector.byte_volume_in_30s,
                        "egress_ratio": round(vol_out / max(1, vol_in), 2),
                    },
                )
            )

        return matches
