"""Alert and incident lifecycle management with deduplication, grouping, hysteresis, and SLA timers."""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from app.repositories.detection_repo import DetectionRepository

logger = logging.getLogger("sentinel_flow.detection.alert_manager")

SEVERITY_RANKS = {"LOW": 0, "ELEVATED": 1, "HIGH": 2, "CRITICAL": 3}
RANK_TO_SEVERITY = {0: "LOW", 1: "ELEVATED", 2: "HIGH", 3: "CRITICAL"}

# SLA response targets by severity level (seconds)
SLA_TARGETS_SECONDS: dict[str, float] = {
    "CRITICAL": 15 * 60.0,   # 15 minutes
    "HIGH": 30 * 60.0,       # 30 minutes
    "ELEVATED": 60 * 60.0,   # 1 hour
    "LOW": 120 * 60.0,       # 2 hours
}

# De-escalation hysteresis thresholds (must fall below these to step down)
DEESCALATION_THRESHOLDS: dict[str, float] = {
    "CRITICAL": 0.78,  # Must fall below 0.78 for H consecutive windows to drop from CRITICAL to HIGH
    "HIGH": 0.62,      # Must fall below 0.62 for H consecutive windows to drop from HIGH to ELEVATED
    "ELEVATED": 0.40,  # Must fall below 0.40 for H consecutive windows to resolve/clear
}
HYSTERESIS_COUNT = 3


@dataclass
class IncidentRecord:
    """Consolidated security incident representing grouped, deduplicated detection events."""

    incident_id: str
    identity_id: str
    primary_technique: str  # e.g. T1110, T1046, T1499, T1190, ANOMALY
    threat_level: str  # ELEVATED, HIGH, CRITICAL
    threat_score: float
    peak_threat_score: float
    matched_rules: list[str]
    mitre_attack_techniques: list[str]
    title: str
    summary: str
    evidence: list[dict[str, Any]]
    event_count: int = 1
    status: str = "ACTIVE"  # ACTIVE, SUPPRESSED, ACKNOWLEDGED, RESOLVED
    first_seen_epoch: float = field(default_factory=time.time)
    first_seen_iso: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    )
    last_seen_epoch: float = field(default_factory=time.time)
    last_seen_iso: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    )
    sla_deadline_epoch: float = 0.0
    sla_deadline_iso: str = ""
    time_to_detect_seconds: float = 0.0
    model_version: str = "2.0.0"
    feature_snapshot: dict[str, Any] = field(default_factory=dict)
    evidence_chain: list[dict[str, Any]] = field(default_factory=list)
    deescalation_counter: int = 0
    analyst: str | None = None
    analyst_notes: str | None = None

    @property
    def alert_id(self) -> str:
        """Alias for incident_id for backward compatibility with AlertRecord."""
        return self.incident_id

    @property
    def created_at_epoch(self) -> float:
        return self.first_seen_epoch

    @property
    def created_at_iso(self) -> str:
        return self.first_seen_iso

    @property
    def sla_status(self) -> str:
        now = time.time()
        if now > self.sla_deadline_epoch:
            return "BREACHED"
        if self.sla_deadline_epoch - now < 300.0:
            return "NEAR_BREACH"
        return "WITHIN_SLA"

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["alert_id"] = self.incident_id
        data["created_at_epoch"] = self.first_seen_epoch
        data["created_at_iso"] = self.first_seen_iso
        data["sla_status"] = self.sla_status
        return data


# Backward-compatible alias
AlertRecord = IncidentRecord


class AlertManager:
    """Stores, deduplicates, groups, and tracks lifecycle of security incidents with hysteresis."""

    def __init__(
        self,
        grouping_window_seconds: float = 60.0,
        debounce_seconds: float = 15.0,
        max_history: int = 500,
        repo: DetectionRepository | None = None,
    ) -> None:
        self.grouping_window_seconds = grouping_window_seconds
        self.debounce_seconds = debounce_seconds
        self.repo = repo or DetectionRepository()
        self._history: deque[IncidentRecord] = deque(maxlen=max_history)
        self._active_incidents: dict[str, IncidentRecord] = {}
        # Grouping key: (identity_id, primary_technique) -> incident_id
        self._group_index: dict[tuple[str, str], str] = {}
        self._listeners: list[Callable[[IncidentRecord], None]] = []

    def _persist_async(self, coro) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            coro.close()

    async def load_from_db(self) -> None:
        """Hydrate incidents from database on startup."""
        try:
            alerts = await self.repo.get_alerts(limit=100)
            for a in reversed(alerts):
                rec = IncidentRecord(
                    incident_id=a.alert_id,
                    identity_id=a.identity_id,
                    primary_technique=a.rule_id,
                    threat_level=a.severity,
                    threat_score=a.threat_score,
                    peak_threat_score=a.threat_score,
                    matched_rules=[a.rule_id],
                    mitre_attack_techniques=[a.rule_id] if a.rule_id.startswith("T1") else [],
                    title=a.name,
                    summary=a.name,
                    evidence=a.evidence_json if isinstance(a.evidence_json, list) else [],
                    first_seen_epoch=a.created_at.timestamp(),
                    first_seen_iso=a.created_at.isoformat().replace("+00:00", "Z"),
                    last_seen_epoch=a.created_at.timestamp(),
                    last_seen_iso=a.created_at.isoformat().replace("+00:00", "Z"),
                    sla_deadline_epoch=a.created_at.timestamp() + SLA_TARGETS_SECONDS.get(a.severity, 1800.0),
                    status="ACTIVE" if a.status in ("open", "acknowledged", "investigating") else "RESOLVED",
                )
                self._history.append(rec)
                if rec.status == "ACTIVE":
                    self._active_incidents[rec.incident_id] = rec
                    self._group_index[(rec.identity_id, rec.primary_technique)] = rec.incident_id
            logger.info("Restored %d incidents (%d active) from database", len(alerts), len(self._active_incidents))
        except Exception:
            logger.exception("Failed loading alerts from database")

    def add_listener(self, callback: Callable[[IncidentRecord], None]) -> None:
        self._listeners.append(callback)

    def process_assessment(self, assessment: dict[str, Any]) -> IncidentRecord | None:
        """Process fused assessment through incident grouping, suppression, and hysteresis."""
        if not assessment.get("is_threat"):
            return None

        identity_id = assessment["identity_id"]
        matched_rules = assessment.get("matched_rules", [])
        mitre_techniques = assessment.get("mitre_attack_techniques", [])
        
        # Primary technique for grouping (e.g. T1110, or matched rule name, or ANOMALY)
        primary_technique = mitre_techniques[0] if mitre_techniques else (matched_rules[0] if matched_rules else "ANOMALY")
        group_key = (identity_id, primary_technique)

        now = time.time()
        now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        new_threat_level = assessment["threat_level"]
        new_threat_score = assessment["threat_score"]

        # Check for existing active incident to group with
        existing_id = self._group_index.get(group_key)
        if existing_id and existing_id in self._active_incidents:
            incident = self._active_incidents[existing_id]
            time_since_last = now - incident.last_seen_epoch

            # If within grouping window, accumulate evidence into existing incident
            if time_since_last <= self.grouping_window_seconds and incident.status == "ACTIVE":
                incident.last_seen_epoch = now
                incident.last_seen_iso = now_iso
                incident.event_count += 1
                incident.threat_score = new_threat_score
                incident.peak_threat_score = max(incident.peak_threat_score, new_threat_score)
                
                # Append snapshot to evidence chain (bounded to 20 snapshots)
                if len(incident.evidence_chain) < 20:
                    incident.evidence_chain.append({
                        "epoch": now,
                        "score": new_threat_score,
                        "level": new_threat_level,
                        "snapshot": assessment.get("evidence_snapshot", {}),
                    })

                # Escalation check (immediate on severity increase)
                curr_rank = SEVERITY_RANKS.get(incident.threat_level, 1)
                new_rank = SEVERITY_RANKS.get(new_threat_level, 1)
                if new_rank > curr_rank:
                    incident.threat_level = new_threat_level
                    incident.deescalation_counter = 0
                    logger.warning(
                        "ESCALATED INCIDENT [%s] %s for %s (Peak: %.2f, Count: %d)",
                        incident.threat_level,
                        incident.title,
                        identity_id,
                        incident.peak_threat_score,
                        incident.event_count,
                    )
                    self._notify_listeners(incident)
                    return incident

                # De-escalation with hysteresis (requires HYSTERESIS_COUNT consecutive low scores)
                deescalate_floor = DEESCALATION_THRESHOLDS.get(incident.threat_level, 0.50)
                if new_threat_score < deescalate_floor:
                    incident.deescalation_counter += 1
                    if incident.deescalation_counter >= HYSTERESIS_COUNT and curr_rank > 0:
                        deescalated_level = RANK_TO_SEVERITY.get(curr_rank - 1, "LOW")
                        incident.threat_level = deescalated_level
                        incident.deescalation_counter = 0
                        logger.info(
                            "DE-ESCALATED INCIDENT to [%s] %s for %s",
                            incident.threat_level,
                            incident.title,
                            identity_id,
                        )
                else:
                    incident.deescalation_counter = 0

                # Suppress duplicate alert generation during grouping window
                return incident

        # Create brand-new Incident
        incident_id = f"inc_{int(now * 1000)}_{identity_id[:8]}"
        title = (
            assessment.get("rule_details", [{}])[0].get("name", "Anomalous Behaviour Detected")
            if assessment.get("rule_details")
            else "Behavioral Anomaly Detected"
        )

        sla_duration = SLA_TARGETS_SECONDS.get(new_threat_level, 1800.0)
        sla_deadline = now + sla_duration
        sla_deadline_iso = datetime.fromtimestamp(sla_deadline, tz=timezone.utc).isoformat().replace("+00:00", "Z")

        incident = IncidentRecord(
            incident_id=incident_id,
            identity_id=identity_id,
            primary_technique=primary_technique,
            threat_level=new_threat_level,
            threat_score=new_threat_score,
            peak_threat_score=new_threat_score,
            matched_rules=matched_rules,
            mitre_attack_techniques=mitre_techniques,
            title=title,
            summary=assessment["human_summary"],
            evidence=assessment.get("explanation", []),
            event_count=1,
            status="ACTIVE",
            first_seen_epoch=now,
            first_seen_iso=now_iso,
            last_seen_epoch=now,
            last_seen_iso=now_iso,
            sla_deadline_epoch=sla_deadline,
            sla_deadline_iso=sla_deadline_iso,
            time_to_detect_seconds=round(max(0.05, time.time() - assessment.get("timestamp_epoch", now)), 3),
            model_version=assessment.get("model_version", "2.0.0"),
            feature_snapshot=assessment.get("evidence_snapshot", {}),
            evidence_chain=[{
                "epoch": now,
                "score": new_threat_score,
                "level": new_threat_level,
                "snapshot": assessment.get("evidence_snapshot", {}),
            }],
        )

        self._active_incidents[incident_id] = incident
        self._group_index[group_key] = incident_id
        self._history.append(incident)
        try:
            from app.observability.metrics import record_alert_raised
            record_alert_raised(severity=new_threat_level, scenario=primary_technique)
        except Exception:
            pass

        logger.warning(
            "RAISED INCIDENT [%s] %s for %s (Score: %.2f, Technique: %s)",
            incident.threat_level,
            incident.title,
            identity_id,
            incident.threat_score,
            incident.primary_technique,
        )

        self._persist_async(
            self.repo.save_alert(
                alert_id=incident_id,
                identity_id=identity_id,
                rule_id=primary_technique,
                name=title,
                severity=incident.threat_level,
                threat_score=incident.threat_score,
                status="open",
                evidence_json=incident.evidence,
            )
        )

        self._notify_listeners(incident)
        return incident

    def _notify_listeners(self, incident: IncidentRecord) -> None:
        for listener in self._listeners:
            try:
                listener(incident)
            except Exception:
                logger.exception("Alert listener error")

    def get_active_alerts(self) -> list[dict[str, Any]]:
        return [a.to_dict() for a in self._active_incidents.values() if a.status == "ACTIVE"]

    def get_history(self, limit: int = 50) -> list[dict[str, Any]]:
        items = list(self._history)
        return [a.to_dict() for a in reversed(items[-limit:])]

    def resolve_alert(self, alert_id: str, analyst: str = "operator", notes: str | None = None) -> bool:
        incident = self._active_incidents.get(alert_id)
        if incident:
            incident.status = "RESOLVED"
            incident.analyst = analyst
            incident.analyst_notes = notes or "Resolved by analyst"
            
            # Clean up group index if it maps to this incident
            group_key = (incident.identity_id, incident.primary_technique)
            if self._group_index.get(group_key) == alert_id:
                self._group_index.pop(group_key, None)

            self._persist_async(
                self.repo.transition_alert_status(
                    alert_id=alert_id,
                    to_status="resolved",
                    analyst=analyst,
                    notes=notes or "Resolved by analyst",
                )
            )
            return True
        return False
