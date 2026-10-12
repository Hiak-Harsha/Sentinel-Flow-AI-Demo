"""Attack run lifecycle and execution manager."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from app.orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer, SecurityError
from app.orchestrator.consent_gate import ConsentGate
from app.orchestrator.credential_driver import CredentialStuffingDriver
from app.orchestrator.load_driver import LoadBurstDriver
from app.orchestrator.zap_driver import ZapDriver

logger = logging.getLogger("sentinel_flow.orchestrator.run_manager")


@dataclass
class AttackRun:
    run_id: str
    scenario: str  # credential_stuffing, burst_dos, scraping, zap_scan
    target_origin: str
    status: str  # PENDING, RUNNING, COMPLETED, STOPPED, FAILED
    progress_percent: float = 0.0
    started_at_epoch: float = field(default_factory=time.time)
    completed_at_epoch: float | None = None
    details: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None
    launched_by: str = "operator"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class RunManager:
    """Orchestrates attack scenarios and tracks lifecycle."""

    def __init__(
        self,
        enforcer: OrchestratorAllowlistEnforcer,
        consent_gate: ConsentGate,
        traffic_logger: Any | None = None,
        detection_engine: Any | None = None,
    ) -> None:
        self.enforcer = enforcer
        self.consent_gate = consent_gate
        self.traffic_logger = traffic_logger
        self.detection_engine = detection_engine
        self.credential_driver = CredentialStuffingDriver(enforcer, traffic_logger=traffic_logger)
        self.load_driver = LoadBurstDriver(enforcer, traffic_logger=traffic_logger)
        self.zap_driver = ZapDriver(enforcer, traffic_logger=traffic_logger)

        self._runs: dict[str, AttackRun] = {}
        self._stop_events: dict[str, asyncio.Event] = {}
        self._active_tasks: dict[str, asyncio.Task] = {}
        self._progress_listeners: list[Callable[[dict[str, Any]], None]] = []
        self._effect_timelines: dict[str, list[dict[str, Any]]] = {}

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
    ) -> AttackRun:
        """Launch an attack scenario asynchronously."""
        # 1. Enforce allowlist
        valid_origin = self.enforcer.validate_target(target_origin)

        # 2. Check that at least one consent record exists for this origin
        has_consent = any(
            r.target_origin.lower() == valid_origin.lower() and r.confirmed_ownership
            for r in self.consent_gate._audit_log
        )
        if not has_consent:
            raise SecurityError(
                f"No operator ownership consent recorded for {valid_origin}. "
                "Confirm ownership via the consent gate first."
            )

        run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{scenario[:6]}"
        stop_event = asyncio.Event()
        self._stop_events[run_id] = stop_event
        self._effect_timelines[run_id] = []

        run = AttackRun(
            run_id=run_id,
            scenario=scenario,
            target_origin=valid_origin,
            status="RUNNING",
            launched_by=launched_by,
        )
        self._runs[run_id] = run

        def _on_effect(effect: dict[str, Any]):
            attacker_id = effect.get("attacker_identity", "")
            assessment = self.detection_engine.get_assessment(attacker_id) if self.detection_engine else None
            threat_score = assessment.get("threat_score", 0.0) if assessment else 0.0
            threat_level = assessment.get("threat_level", "LOW") if assessment else "LOW"
            matched_rules = [r.get("name", r.get("rule_id", "")) for r in assessment.get("rule_matches", [])] if assessment else []

            enriched = {
                **effect,
                "current_threat_score": threat_score,
                "current_threat_level": threat_level,
                "matched_rules": matched_rules,
                "timestamp": time.time(),
                "launched_by": launched_by,
            }
            # Append to timeline capped at 500 events
            tl = self._effect_timelines.setdefault(run_id, [])
            if len(tl) < 500:
                tl.append(enriched)
            # Broadcast to WebSocket subscribers
            self._broadcast_progress({"type": "attack_effect", "effect": enriched, "run_id": run_id})

        async def _execute():
            def _on_progress(update: dict[str, Any]):
                run.progress_percent = update.get("progress_percent", run.progress_percent)
                run.details.update(update)
                self._broadcast_progress({"type": "attack_progress", "run": run.to_dict(), "update": update})

            try:
                if scenario == "credential_stuffing":
                    total_acc = min(50, max(5, account_count))
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
                    )
                    run.details.update(res)
                elif scenario == "burst_dos":
                    res = await self.load_driver.execute_burst(
                        run_id=run_id,
                        target_origin=valid_origin,
                        duration_seconds=duration_seconds,
                        requests_per_sec=requests_per_second,
                        stop_event=stop_event,
                        progress_callback=_on_progress,
                        effect_callback=_on_effect,
                    )
                    run.details.update(res)
                elif scenario == "scraping":
                    res = await self.load_driver.execute_scraping(
                        run_id=run_id,
                        target_origin=valid_origin,
                        iterations=scraping_iterations,
                        stop_event=stop_event,
                        progress_callback=_on_progress,
                        effect_callback=_on_effect,
                    )
                    run.details.update(res)
                elif scenario in ("zap_scan", "zap_active_scan"):
                    res = await self.zap_driver.execute_probe_scan(
                        run_id=run_id,
                        target_origin=valid_origin,
                        stop_event=stop_event,
                        progress_callback=_on_progress,
                        effect_callback=_on_effect,
                    )
                    run.details.update(res)
                else:
                    raise ValueError(f"Unknown scenario: {scenario}")

                run.status = "COMPLETED" if not stop_event.is_set() else "STOPPED"
                run.progress_percent = 100.0
            except Exception as e:
                logger.exception("Attack run %s failed: %s", run_id, e)
                run.status = "FAILED"
                run.error_message = str(e)
            finally:
                run.completed_at_epoch = time.time()
                self._broadcast_progress({"type": "attack_completed", "run": run.to_dict()})

        task = asyncio.create_task(_execute())
        self._active_tasks[run_id] = task

        logger.info("Launched attack scenario %s (ID: %s, By: %s)", scenario, run_id, launched_by)
        return run

    def stop_run(self, run_id: str) -> bool:
        """Cancel an in-flight attack run."""
        event = self._stop_events.get(run_id)
        if event:
            event.set()
            run = self._runs.get(run_id)
            if run and run.status == "RUNNING":
                run.status = "STOPPED"
            logger.info("Operator stopped attack run %s", run_id)
            return True
        return False

    def get_run(self, run_id: str) -> AttackRun | None:
        return self._runs.get(run_id)

    def list_runs(self) -> list[dict[str, Any]]:
        return [r.to_dict() for r in reversed(list(self._runs.values()))]
