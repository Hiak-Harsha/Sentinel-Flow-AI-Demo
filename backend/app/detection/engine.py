"""Unified Detection Engine coordinator with database persistence for Sentinel Flow v2."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

from app.detection.alert_manager import AlertManager, AlertRecord
from app.detection.rule_correlator import RuleCorrelator
from app.detection.score_fusion import fuse_signals
from app.detection.supervised_model import SupervisedClassifier
from app.detection.unsupervised_model import OnlineAnomalyDetector
from app.pipeline.feature_store import IdentityFeatureVector
from app.repositories.detection_repo import DetectionRepository

logger = logging.getLogger("sentinel_flow.detection.engine")


class DetectionEngine:
    """Coordinates supervised, unsupervised, and rule-based intrusion detection layers."""

    def __init__(
        self,
        supervised: SupervisedClassifier | None = None,
        unsupervised: OnlineAnomalyDetector | None = None,
        rule_correlator: RuleCorrelator | None = None,
        alert_manager: AlertManager | None = None,
        repo: DetectionRepository | None = None,
    ) -> None:
        self.supervised = supervised or SupervisedClassifier()
        self.unsupervised = unsupervised or OnlineAnomalyDetector()
        self.rules = rule_correlator or RuleCorrelator()
        self.repo = repo or DetectionRepository()
        self.alerts = alert_manager or AlertManager(repo=self.repo)

        # identity_id -> latest fused assessment dict
        self._latest_assessments: dict[str, dict[str, Any]] = {}

    def _persist_async(self, coro) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            try:
                asyncio.run(coro)
            except Exception as e:
                logger.debug("Failed running sync persistence fallback in DetectionEngine: %s", e)

    async def load_from_db(self) -> None:
        """Hydrate latest assessments and alerts from database on startup."""
        await self.alerts.load_from_db()
        try:
            assessments = await self.repo.get_all_latest_assessments()
            for a in assessments:
                self._latest_assessments[a.identity_id] = {
                    "identity_id": a.identity_id,
                    "threat_score": a.threat_score,
                    "threat_level": a.threat_level,
                    "rule_score": a.rule_score,
                    "ml_score": a.ml_score,
                    "flow_score": a.flow_score,
                    "fused_score": a.fused_score,
                    "matched_rules": a.matched_rules or [],
                    "explanation": a.explanation_json or {},
                    "model_version": a.model_version,
                    "timestamp": a.ts.timestamp(),
                }
            logger.info("Restored latest assessments for %d identities from database", len(self._latest_assessments))
        except Exception:
            logger.exception("Failed loading assessments from database")

    def evaluate_vector(self, vector: IdentityFeatureVector) -> dict[str, Any]:
        """Perform end-to-end multi-layer detection on a feature vector."""
        # 1. Supervised prediction (UNSW-NB15)
        sup_res = self.supervised.predict_vector(vector)

        # 2. Unsupervised online anomaly scoring
        unsup_res = self.unsupervised.score_vector(vector)

        # 3. Rule correlation
        rule_matches = self.rules.evaluate(vector)

        # 4. Score fusion
        assessment = fuse_signals(
            vector=vector,
            supervised_res=sup_res,
            unsupervised_res=unsup_res,
            rule_matches=rule_matches,
        )

        # 5. Alert lifecycle check
        alert = self.alerts.process_assessment(assessment)
        if alert:
            assessment["raised_alert"] = alert.to_dict()

        # Store latest assessment in-memory
        self._latest_assessments[vector.identity_id] = assessment

        # Persist assessment to database
        self._persist_async(
            self.repo.save_assessment(
                identity_id=vector.identity_id,
                threat_score=assessment.get("threat_score", 0.0),
                threat_level=assessment.get("threat_level", "LOW"),
                rule_score=assessment.get("rule_score", 0.0),
                ml_score=assessment.get("ml_score", 0.0),
                flow_score=assessment.get("flow_score", 0.0),
                fused_score=assessment.get("fused_score", 0.0),
                matched_rules=assessment.get("matched_rules"),
                explanation_json=assessment.get("explanation"),
            )
        )

        return assessment

    def get_assessment(self, identity_id: str) -> dict[str, Any] | None:
        return self._latest_assessments.get(identity_id)

    def get_all_assessments(self) -> dict[str, dict[str, Any]]:
        return dict(self._latest_assessments)

    def get_global_threat_level(self) -> str:
        """Calculate highest active threat level across all monitored identities."""
        levels = [a.get("threat_level", "LOW") for a in self._latest_assessments.values()]
        if "CRITICAL" in levels:
            return "CRITICAL"
        if "HIGH" in levels:
            return "HIGH"
        if "ELEVATED" in levels:
            return "ELEVATED"
        return "LOW"

    def get_status(self) -> dict[str, Any]:
        """High-level detection subsystem status for dashboard."""
        return {
            "threat_level": self.get_global_threat_level(),
            "active_detections": len(self.alerts.get_active_alerts()),
            "monitored_identities": len(self._latest_assessments),
            "supervised_ready": self.supervised.is_ready,
            "baseline_calibrated": self.unsupervised.is_calibrated,
            "baseline_stats": self.unsupervised.get_stats(),
        }
