"""Alert lifecycle management with database persistence for Sentinel Flow v2."""

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


@dataclass
class AlertRecord:
    alert_id: str
    identity_id: str
    threat_level: str  # ELEVATED, HIGH, CRITICAL
    threat_score: float
    matched_rules: list[str]
    title: str
    summary: str
    evidence: list[dict[str, Any]]
    created_at_epoch: float = field(default_factory=time.time)
    created_at_iso: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    )
    status: str = "ACTIVE"  # ACTIVE, ACKNOWLEDGED, RESOLVED

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class AlertManager:
    """Stores, deduplicates, and tracks lifecycle of security alerts with database backing."""

    def __init__(
        self,
        debounce_seconds: float = 15.0,
        max_history: int = 500,
        repo: DetectionRepository | None = None,
    ) -> None:
        self.debounce_seconds = debounce_seconds
        self.repo = repo or DetectionRepository()
        self._history: deque[AlertRecord] = deque(maxlen=max_history)
        self._active_alerts: dict[str, AlertRecord] = {}
        # key (identity_id, rule_key) -> last_alert_time
        self._last_alert_times: dict[tuple[str, str], float] = {}
        self._listeners: list[Callable[[AlertRecord], None]] = []

    def _persist_async(self, coro) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            try:
                asyncio.run(coro)
            except Exception as e:
                logger.debug("Failed running sync persistence fallback in AlertManager: %s", e)

    async def load_from_db(self) -> None:
        """Hydrate alerts from database on startup."""
        try:
            alerts = await self.repo.get_alerts(limit=100)
            for a in reversed(alerts):
                rec = AlertRecord(
                    alert_id=a.alert_id,
                    identity_id=a.identity_id,
                    threat_level=a.severity,
                    threat_score=a.threat_score,
                    matched_rules=[a.rule_id],
                    title=a.name,
                    summary=a.name,
                    evidence=a.evidence_json if isinstance(a.evidence_json, list) else [],
                    created_at_epoch=a.created_at.timestamp(),
                    created_at_iso=a.created_at.isoformat().replace("+00:00", "Z"),
                    status="ACTIVE" if a.status in ("open", "acknowledged", "investigating") else "RESOLVED",
                )
                self._history.append(rec)
                if rec.status == "ACTIVE":
                    self._active_alerts[rec.alert_id] = rec
            logger.info("Restored %d alerts (%d active) from database", len(alerts), len(self._active_alerts))
        except Exception:
            logger.exception("Failed loading alerts from database")

    def add_listener(self, callback: Callable[[AlertRecord], None]) -> None:
        self._listeners.append(callback)

    def process_assessment(self, assessment: dict[str, Any]) -> AlertRecord | None:
        """Evaluate fused assessment and raise alert if warranted."""
        if not assessment.get("is_threat"):
            return None

        identity_id = assessment["identity_id"]
        matched_rules = assessment.get("matched_rules", [])
        rule_key = ":".join(sorted(matched_rules)) if matched_rules else "anomaly"
        dedup_key = (identity_id, rule_key)

        now = time.time()
        last_time = self._last_alert_times.get(dedup_key, 0.0)
        if now - last_time < self.debounce_seconds:
            return None

        self._last_alert_times[dedup_key] = now

        alert_id = f"alt_{int(now * 1000)}_{identity_id[:8]}"
        title = (
            assessment.get("rule_details", [{}])[0].get("name", "Anomalous Behaviour Detected")
            if assessment.get("rule_details")
            else "Behavioural Anomaly Detected"
        )

        alert = AlertRecord(
            alert_id=alert_id,
            identity_id=identity_id,
            threat_level=assessment["threat_level"],
            threat_score=assessment["threat_score"],
            matched_rules=matched_rules,
            title=title,
            summary=assessment["human_summary"],
            evidence=assessment.get("explanation", []),
        )

        self._active_alerts[alert_id] = alert
        self._history.append(alert)

        logger.warning(
            "RAISED ALERT [%s] %s for %s (Score: %.2f)",
            alert.threat_level,
            alert.title,
            identity_id,
            alert.threat_score,
        )

        self._persist_async(
            self.repo.save_alert(
                alert_id=alert_id,
                identity_id=identity_id,
                rule_id=matched_rules[0] if matched_rules else "ANOMALY",
                name=title,
                severity=alert.threat_level,
                threat_score=alert.threat_score,
                status="open",
                evidence_json=alert.evidence,
            )
        )

        for listener in self._listeners:
            try:
                listener(alert)
            except Exception:
                logger.exception("Alert listener error")

        return alert

    def get_active_alerts(self) -> list[dict[str, Any]]:
        return [a.to_dict() for a in self._active_alerts.values() if a.status == "ACTIVE"]

    def get_history(self, limit: int = 50) -> list[dict[str, Any]]:
        items = list(self._history)
        return [a.to_dict() for a in reversed(items[-limit:])]

    def resolve_alert(self, alert_id: str, analyst: str = "operator", notes: str | None = None) -> bool:
        alert = self._active_alerts.get(alert_id)
        if alert:
            alert.status = "RESOLVED"
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
