"""Detection Engine: Evaluates telemetry through LiveAnomalyDetector and coordinates real-time alert states."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from collections import deque
from ..ml.anomaly_detector import LiveAnomalyDetector


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class DetectionService:
    def __init__(self, detector: LiveAnomalyDetector) -> None:
        self.detector = detector
        self.active_detections: dict[str, dict[str, Any]] = {}
        self.detection_history: deque[dict[str, Any]] = deque(maxlen=200)
        self.device_scores: dict[str, float] = {}
        self.device_states: dict[str, str] = {}
        self.threat_level = "LOW"

    def evaluate_device_telemetry(self, device_id: str, metrics: dict[str, float]) -> dict[str, Any]:
        """Score incoming device metrics and transition alert states."""
        assessment = self.detector.score_observation(metrics, device_id=device_id)
        score = assessment["anomaly_score"]
        state = assessment["state"]

        self.device_scores[device_id] = score
        self.device_states[device_id] = state

        now = _timestamp()
        event_payload = {
            "device_id": device_id,
            "anomaly_score": score,
            "threshold": assessment["threshold"],
            "state": state,
            "is_anomaly": assessment["is_anomaly"],
            "timestamp": now,
            "metrics": metrics,
            "explanations": assessment["explanations"],
            "algorithm": assessment["algorithm"],
        }

        # Update threat level
        if any(s in ("ANOMALOUS", "CONFIRMED_ANOMALY") for s in self.device_states.values()):
            self.threat_level = "ELEVATED"
            if any(s == "CONFIRMED_ANOMALY" for s in self.device_states.values()):
                self.threat_level = "ANOMALOUS"
        elif any(s in ("WATCH", "RECOVERING") for s in self.device_states.values()):
            self.threat_level = "ELEVATED"
        else:
            self.threat_level = "LOW"

        # Record detections
        if state in ("ANOMALOUS", "CONFIRMED_ANOMALY"):
            self.active_detections[device_id] = event_payload
            self.detection_history.append(event_payload)
        elif state == "RECOVERING" and device_id in self.active_detections:
            self.active_detections.pop(device_id, None)
            recovery_event = {
                **event_payload,
                "event_type": "anomaly_recovered",
                "message": f"{device_id} behaviour returned to baseline.",
            }
            self.detection_history.append(recovery_event)

        return event_payload

    def get_device_assessment(self, device_id: str) -> dict[str, Any]:
        score = self.device_scores.get(device_id, 0.1)
        state = self.device_states.get(device_id, "NORMAL")
        active = self.active_detections.get(device_id)

        return {
            "device_id": device_id,
            "anomaly_score": score,
            "state": state,
            "threshold": self.detector.threshold,
            "is_anomaly": state in ("ANOMALOUS", "CONFIRMED_ANOMALY"),
            "active_alert": active,
            "baseline_stats": self.detector.baseline_stats,
        }

    def get_status(self) -> dict[str, Any]:
        return {
            "threat_level": self.threat_level,
            "active_alerts_count": len(self.active_detections),
            "active_detections": list(self.active_detections.values()),
            "recent_detections": list(self.detection_history)[-10:],
            "baseline_stats": self.detector.baseline_stats,
            "detector_algorithm": "Isolation Forest (100 Trees) + Baseline Z-Score Tracker",
        }
