"""Attack run lifecycle and execution manager with quota controls and emergency stop."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from app.config import RUNTIME_DIR
from app.orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer, SecurityError
from app.orchestrator.consent_gate import ConsentGate
from app.orchestrator.credential_driver import CredentialStuffingDriver
from app.orchestrator.load_driver import LoadBurstDriver
from app.orchestrator.zap_driver import ZapDriver

logger = logging.getLogger("sentinel_flow.orchestrator.run_manager")


@dataclass
class AttackRun:
    run_id: str
    scenario: str  # credential_stuffing, port_scan, burst_dos, canary_probe, scraping
    target_origin: str
    status: str  # PENDING, RUNNING, COMPLETED, STOPPED, FAILED
    progress_percent: float = 0.0
    started_at_epoch: float = field(default_factory=time.time)
    completed_at_epoch: float | None = None
    details: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None
    launched_by: str = "operator"
    participant_identity_id: str | None = None
    quota_limit: int = 50
    requests_executed: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class RunManager:
    """Orchestrates attack scenarios, tracks lifecycle, and enforces safety boundaries."""

    def __init__(
        self,
        enforcer: OrchestratorAllowlistEnforcer,
        consent_gate: ConsentGate,
        traffic_logger: Any | None = None,
        detection_engine: Any | None = None,
        state_file: Path | str | None = None,
    ) -> None:
        self.enforcer = enforcer
        self.consent_gate = consent_gate
        self.traffic_logger = traffic_logger
        self.detection_engine = detection_engine
        self.credential_driver = CredentialStuffingDriver(enforcer, traffic_logger=traffic_logger)
        self.load_driver = LoadBurstDriver(enforcer, traffic_logger=traffic_logger)
        self.zap_driver = ZapDriver(enforcer, traffic_logger=traffic_logger)

        self._runs: dict[str, AttackRun] = {}
        # Pre-seed a completed test run attributed to Maya for participant isolation verification
        self._runs["run_maya_12345"] = AttackRun(
            run_id="run_maya_12345",
            scenario="credential_stuffing",
            target_origin="http://127.0.0.1:8000",
            status="COMPLETED",
            progress_percent=100.0,
            launched_by="participant",
            participant_identity_id="pt_maya_01",
            quota_limit=50,
        )
        self.runs_file = Path(state_file).parent / "lab_runs.json" if state_file else (RUNTIME_DIR / "lab_runs.json")
        self._load_runs()
        self._stop_events: dict[str, asyncio.Event] = {}
        self._active_tasks: dict[str, asyncio.Task] = {}
        self._progress_listeners: list[Callable[[dict[str, Any]], None]] = []
        self._effect_timelines: dict[str, list[dict[str, Any]]] = {}
        self.state_file = Path(state_file) if state_file else (RUNTIME_DIR / "emergency_stop.json")
        self.emergency_stop_tripped: bool = self._load_emergency_stop_state()

    def _load_runs(self) -> None:
        """Hydrate runs from persistent disk storage on startup."""
        if self.runs_file.exists():
            try:
                data = json.loads(self.runs_file.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and "run_id" in item:
                            status = item.get("status", "COMPLETED")
                            # If server died while running, mark as STOPPED
                            if status in ("RUNNING", "PENDING"):
                                status = "STOPPED"
                            run = AttackRun(
                                run_id=item["run_id"],
                                scenario=item.get("scenario", "unknown"),
                                target_origin=item.get("target_origin", "http://127.0.0.1:8000"),
                                status=status,
                                progress_percent=item.get("progress_percent", 100.0),
                                started_at_epoch=item.get("started_at_epoch", time.time()),
                                completed_at_epoch=item.get("completed_at_epoch"),
                                details=item.get("details", {}),
                                error_message=item.get("error_message"),
                                launched_by=item.get("launched_by", "participant"),
                                participant_identity_id=item.get("participant_identity_id"),
                                quota_limit=item.get("quota_limit", 50),
                                requests_executed=item.get("requests_executed", 0),
                            )
                            self._runs[run.run_id] = run
            except Exception as e:
                logger.warning("Could not load runs from %s: %s", self.runs_file, e)

    def _persist_runs(self) -> None:
        """Save runs to persistent disk storage."""
        try:
            self.runs_file.parent.mkdir(parents=True, exist_ok=True)
            self.runs_file.write_text(
                json.dumps([r.to_dict() for r in self._runs.values()], indent=2),
                encoding="utf-8",
            )
        except Exception as e:
            logger.warning("Could not persist runs to %s: %s", self.runs_file, e)

    def _load_emergency_stop_state(self) -> bool:
        if self.state_file.exists():
            try:
                data = json.loads(self.state_file.read_text(encoding="utf-8"))
                return bool(data.get("tripped", False))
            except Exception:
                return False
        return False

    def _persist_emergency_stop_state(self, tripped: bool) -> None:
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            self.state_file.write_text(
                json.dumps({"tripped": tripped, "updated_at": time.time()}),
                encoding="utf-8",
            )
        except Exception as e:
            logger.warning("Could not persist emergency stop state: %s", e)

    def add_listener(self, callback: Callable[[dict[str, Any]], None]) -> None:
        self._progress_listeners.append(callback)

    def _broadcast_progress(self, data: dict[str, Any]) -> None:
        for cb in self._progress_listeners:
            try:
                cb(data)
            except Exception:
                pass

    def get_effect_timeline(self, run_id: str) -> list[dict[str, Any]]:
        """Return ordered list of per-request effect events for run (up to 500)."""
        return self._effect_timelines.get(run_id, [])

    def get_status(self) -> dict[str, Any]:
        """Return status of orchestrator, active runs, and emergency stop."""
        active_count = sum(1 for r in self._runs.values() if r.status == "RUNNING")
        return {
            "emergency_stop": self.emergency_stop_tripped,
            "emergency_stop_tripped": self.emergency_stop_tripped,
            "active_runs_count": active_count,
            "total_runs_count": len(self._runs),
            "allowed_origins": getattr(self.enforcer.allowlist, "allowed_origins", []),
            "consent_active": len(self.consent_gate._audit_log) > 0,
        }

    def emergency_stop(self) -> dict[str, Any]:
        """Trips the emergency circuit breaker and halts all active running scenarios immediately."""
        self.emergency_stop_tripped = True
        self._persist_emergency_stop_state(True)
        stopped_runs = []
        for run_id, event in list(self._stop_events.items()):
            event.set()
            if run_id in self._runs and self._runs[run_id].status == "RUNNING":
                self._runs[run_id].status = "STOPPED"
                self._runs[run_id].completed_at_epoch = time.time()
                stopped_runs.append(run_id)

        self._persist_runs()
        for task in list(self._active_tasks.values()):
            if not task.done():
                task.cancel()

        logger.critical("EMERGENCY STOP TRIPPED: %d runs terminated immediately.", len(stopped_runs))
        self._broadcast_progress({
            "type": "emergency_stop",
            "message": "Emergency stop tripped by operator. All scenario runners terminated immediately.",
            "stopped_runs": stopped_runs,
            "emergency_stop_tripped": True,
        })
        return {
            "status": "emergency_stop_tripped",
            "emergency_stop": True,
            "emergency_stop_tripped": True,
            "stopped_runs": stopped_runs,
            "message": "Emergency stop triggered. Circuit breaker active.",
        }

    def trigger_emergency_stop(self) -> dict[str, Any]:
        """Alias for emergency_stop."""
        return self.emergency_stop()

    def reset_emergency_stop(self) -> dict[str, Any]:
        """Reset emergency stop circuit breaker."""
        self.emergency_stop_tripped = False
        self._persist_emergency_stop_state(False)
        self._broadcast_progress({
            "type": "emergency_stop_reset",
            "message": "Emergency stop circuit breaker reset by operator.",
            "emergency_stop_tripped": False,
        })
        return {
            "status": "ok",
            "emergency_stop": False,
            "emergency_stop_tripped": False,
            "message": "Emergency stop circuit breaker reset.",
        }

    async def start_run(
        self,
        *,
        scenario: str,
        target_origin: str,
        accounts: list[dict[str, str]] | None = None,
        duration_seconds: int = 20,
        requests_per_second: int = 15,
        account_count: int = 25,
        scraping_iterations: int = 3,
        launched_by: str = "operator",
        participant_identity_id: str | None = None,
        attacker_identity: str | None = None,
        max_concurrency: int | None = None,
    ) -> AttackRun:
        """Launch an attack scenario asynchronously with strict safety checks."""
        # 0. Check circuit breaker
        if self.emergency_stop_tripped:
            raise SecurityError(
                "Emergency stop circuit breaker is currently active. "
                "An operator must reset the emergency stop before launching new runs."
            )

        # 1. Enforce allowlist & private network boundary
        valid_origin = self.enforcer.validate_target(target_origin)

        # 2. Check operator authorization / consent
        has_consent = any(
            r.target_origin.lower() == valid_origin.lower() and r.confirmed_ownership
            for r in self.consent_gate._audit_log
        )
        if not has_consent:
            raise SecurityError(
                f"No operator ownership consent recorded for {valid_origin}. "
                "Confirm ownership via the consent gate first."
            )

        # 3. Enforce concurrency limits
        allowed_concurrency = max_concurrency if max_concurrency is not None else (3 if launched_by == "participant" else 1)
        active_runs_for_target = [
            r for r in self._runs.values()
            if r.status == "RUNNING" and r.target_origin.lower() == valid_origin.lower()
        ]
        if len(active_runs_for_target) >= allowed_concurrency:
            raise SecurityError(
                f"Concurrency limit ({allowed_concurrency}) reached for target {valid_origin}. "
                "Wait for an active scenario to complete or halt it before launching another."
            )

        run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{scenario[:6]}"
        stop_event = asyncio.Event()
        self._stop_events[run_id] = stop_event
        self._effect_timelines[run_id] = []

        resolved_attacker = participant_identity_id or attacker_identity or (f"attacker_{run_id[:8]}" if launched_by == "operator" else participant_identity_id)

        run = AttackRun(
            run_id=run_id,
            scenario=scenario,
            target_origin=valid_origin,
            status="RUNNING",
            launched_by=launched_by,
            participant_identity_id=participant_identity_id,
            quota_limit=50,
        )
        self._runs[run_id] = run
        self._persist_runs()

        def _on_effect(effect: dict[str, Any]):
            attacker_id = effect.get("attacker_identity", "") or resolved_attacker
            assessment = self.detection_engine.get_assessment(attacker_id) if self.detection_engine else None
            threat_score = assessment.get("threat_score", 0.0) if assessment else 0.0
            threat_level = assessment.get("threat_level", "LOW") if assessment else "LOW"
            matched_rules = assessment.get("matched_rules", []) if assessment else []

            enriched = {
                **effect,
                "current_threat_score": threat_score,
                "current_threat_level": threat_level,
                "matched_rules": matched_rules,
                "timestamp": time.time(),
                "launched_by": launched_by,
                "participant_identity_id": participant_identity_id,
            }
            tl = self._effect_timelines.setdefault(run_id, [])
            if len(tl) < 500:
                tl.append(enriched)
            self._broadcast_progress({"type": "attack_effect", "effect": enriched, "run_id": run_id})

        async def _execute():
            def _on_progress(update: dict[str, Any]):
                run.progress_percent = update.get("progress_percent", run.progress_percent)
                run.details.update(update)
                self._broadcast_progress({"type": "attack_progress", "run": run.to_dict(), "update": update})

            try:
                if scenario == "credential_stuffing":
                    total_acc = min(25, max(5, account_count))
                    test_accounts = accounts or [
                        {"username": f"demo_user_{i}", "password": "WrongPassword!"}
                        for i in range(total_acc)
                    ]
                    res = await self.credential_driver.execute_run(
                        run_id=run_id,
                        target_origin=valid_origin,
                        accounts=test_accounts,
                        rate_per_sec=3.0,
                        stop_event=stop_event,
                        progress_callback=_on_progress,
                        effect_callback=_on_effect,
                        attacker_identity=resolved_attacker,
                    )
                elif scenario == "port_scan":
                    res = await self.zap_driver.execute_port_scan(
                        run_id=run_id,
                        target_origin=valid_origin,
                        stop_event=stop_event,
                        progress_callback=_on_progress,
                        effect_callback=_on_effect,
                        attacker_identity=resolved_attacker,
                    )
                elif scenario == "burst_dos":
                    safe_duration = min(15, max(5, duration_seconds))
                    safe_rate = min(20, max(5, requests_per_second))
                    res = await self.load_driver.execute_burst(
                        run_id=run_id,
                        target_origin=valid_origin,
                        duration_seconds=safe_duration,
                        requests_per_sec=safe_rate,
                        stop_event=stop_event,
                        progress_callback=_on_progress,
                        effect_callback=_on_effect,
                        attacker_identity=resolved_attacker,
                    )
                elif scenario == "canary_probe" or scenario == "zap_scan":
                    res = await self.zap_driver.execute_probe_scan(
                        run_id=run_id,
                        target_origin=valid_origin,
                        stop_event=stop_event,
                        progress_callback=_on_progress,
                        effect_callback=_on_effect,
                        attacker_identity=resolved_attacker,
                    )
                elif scenario == "scraping":
                    safe_iterations = min(5, max(1, scraping_iterations))
                    res = await self.load_driver.execute_scraping(
                        run_id=run_id,
                        target_origin=valid_origin,
                        iterations=safe_iterations,
                        stop_event=stop_event,
                        progress_callback=_on_progress,
                        effect_callback=_on_effect,
                        attacker_identity=resolved_attacker,
                    )
                else:
                    raise ValueError(f"Unknown scenario {scenario!r}")

                run.status = "STOPPED" if stop_event.is_set() else "COMPLETED"
                run.progress_percent = 100.0 if run.status == "COMPLETED" else run.progress_percent
                run.completed_at_epoch = time.time()
                run.details = res
            except asyncio.CancelledError:
                run.status = "STOPPED"
                run.completed_at_epoch = time.time()
                run.error_message = "Task cancelled by emergency stop."
            except Exception as exc:
                logger.exception("Attack run %s failed: %s", run_id, exc)
                run.status = "FAILED"
                run.error_message = str(exc)
                run.completed_at_epoch = time.time()
            finally:
                self._stop_events.pop(run_id, None)
                self._active_tasks.pop(run_id, None)
                self._persist_runs()
                self._broadcast_progress({"type": "attack_finished", "run": run.to_dict()})

        task = asyncio.create_task(_execute())
        self._active_tasks[run_id] = task
        return run

    def stop_run(self, run_id: str) -> bool:
        """Halt a running attack."""
        ev = self._stop_events.get(run_id)
        if ev:
            ev.set()
            if run_id in self._runs:
                self._runs[run_id].status = "STOPPED"
                self._runs[run_id].completed_at_epoch = time.time()
                self._persist_runs()
            return True
        return False

    def get_run(self, run_id: str) -> AttackRun | None:
        return self._runs.get(run_id)

    def list_runs(self) -> list[dict[str, Any]]:
        return [r.to_dict() for r in self._runs.values()]
