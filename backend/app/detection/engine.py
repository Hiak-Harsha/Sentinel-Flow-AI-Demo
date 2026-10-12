"""Unified Detection Engine coordinator for Sentinel Flow v2."""

from __future__ import annotations

import logging
from typing import Any, Callable

from app.detection.alert_manager import AlertManager, AlertRecord
from app.detection.rule_correlator import RuleCorrelator
from app.detection.score_fusion import fuse_signals
from app.detection.supervised_model import SupervisedClassifier
from app.detection.unsupervised_model import OnlineAnomalyDetector
from app.pipeline.feature_store import IdentityFeatureVector

logger = logging.getLogger("sentinel_flow.detection.engine")


class DetectionEngine:
    """Coordinates supervised, unsupervised, and rule-based intrusion detection layers."""

    def __init__(
        self,
        supervised: SupervisedClassifier | None = None,
        unsupervised: OnlineAnomalyDetector | None = None,
        rule_correlator: RuleCorrelator | None = None,
        alert_manager: AlertManager | None = None,
    ) -> None:
        self.supervised = supervised or SupervisedClassifier()
        self.unsupervised = unsupervised or OnlineAnomalyDetector()
        self.rules = rule_correlator or RuleCorrelator()
        self.alerts = alert_manager or AlertManager()

        # identity_id -> latest fused assessment dict
        self._latest_assessments: dict[str, dict[str, Any]] = {}

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

        # Store latest assessment
        self._latest_assessments[vector.identity_id] = assessment
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
