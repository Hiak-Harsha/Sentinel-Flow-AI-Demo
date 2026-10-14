"""Dataset & scenario replay source streaming historical data at controlled rates."""

from __future__ import annotations

import asyncio
import logging
import random
import time
from datetime import datetime, timezone
from typing import Any, Callable

from app.schemas.events import NormalizedEvent

logger = logging.getLogger("sentinel_flow.pipeline.replay")

BUILTIN_REPLAY_SCENARIOS = {
    "benign_baseline": [
        {"path": "/api/v1/health", "method": "GET", "status": 200, "in": 64, "out": 256, "lat": 4.2},
        {"path": "/api/v1/sessions/current", "method": "GET", "status": 200, "in": 128, "out": 1024, "lat": 6.8},
        {"path": "/api/v1/overview", "method": "GET", "status": 200, "in": 128, "out": 2048, "lat": 8.1},
        {"path": "/api/records", "method": "GET", "status": 200, "in": 256, "out": 4096, "lat": 12.5},
        {"path": "/api/profile", "method": "GET", "status": 200, "in": 128, "out": 512, "lat": 5.0},
    ],
    "credential_stuffing_replay": [
        {"path": "/api/auth/login", "method": "POST", "status": 401, "in": 512, "out": 128, "lat": 14.0},
        {"path": "/api/auth/login", "method": "POST", "status": 401, "in": 512, "out": 128, "lat": 13.5},
        {"path": "/api/auth/login", "method": "POST", "status": 401, "in": 512, "out": 128, "lat": 15.1},
        {"path": "/api/auth/login", "method": "POST", "status": 401, "in": 512, "out": 128, "lat": 12.9},
        {"path": "/api/auth/login", "method": "POST", "status": 200, "in": 512, "out": 1024, "lat": 25.0},
    ],
    "endpoint_discovery_replay": [
        {"path": "/admin/config", "method": "GET", "status": 404, "in": 128, "out": 128, "lat": 3.0},
        {"path": "/.env", "method": "GET", "status": 404, "in": 128, "out": 128, "lat": 3.2},
        {"path": "/actuator/health", "method": "GET", "status": 404, "in": 128, "out": 128, "lat": 3.1},
        {"path": "/backup.zip", "method": "GET", "status": 404, "in": 128, "out": 128, "lat": 3.5},
        {"path": "/api/v2/users", "method": "GET", "status": 403, "in": 128, "out": 128, "lat": 4.0},
    ],
}


class ReplayEngine:
    """Streams recorded benchmark flows and labeled security scenarios at controlled playback speeds."""

    def __init__(
        self,
        event_callback: Callable[[NormalizedEvent], Any] | None = None,
    ) -> None:
        self.event_callback = event_callback
        self.is_running = False
        self.is_paused = False
        self.scenario_name = "benign_baseline"
        self.speed_multiplier = 1.0
        self.events_emitted = 0
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    def start(
        self,
        scenario: str = "benign_baseline",
        speed_multiplier: float = 1.0,
        loop: bool = True,
        actor_identity: str = "replay:simulated_device_01",
    ) -> bool:
        """Start streaming replay events."""
        if self._task is not None and not self._task.done():
            self.stop()

        self.scenario_name = scenario if scenario in BUILTIN_REPLAY_SCENARIOS else "benign_baseline"
        self.speed_multiplier = max(0.1, min(speed_multiplier, 50.0))
        self.is_running = True
        self.is_paused = False
        self.events_emitted = 0
        self._stop_event.clear()
        self._task = asyncio.create_task(self._replay_loop(loop=loop, identity_id=actor_identity))
        logger.info(
            "Started replay engine [scenario=%s, speed=%.1fx, loop=%s]",
            self.scenario_name,
            self.speed_multiplier,
            loop,
        )
        return True

    def pause(self) -> None:
        self.is_paused = True

    def resume(self) -> None:
        self.is_paused = False

    def stop(self) -> None:
        self.is_running = False
        self.is_paused = False
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            self._task = None
        logger.info("Stopped replay engine (emitted %d events)", self.events_emitted)

    def get_status(self) -> dict[str, Any]:
        return {
            "is_running": self.is_running,
            "is_paused": self.is_paused,
            "scenario": self.scenario_name,
            "speed_multiplier": self.speed_multiplier,
            "events_emitted": self.events_emitted,
            "available_scenarios": list(BUILTIN_REPLAY_SCENARIOS.keys()),
        }

    async def _replay_loop(self, loop: bool, identity_id: str) -> None:
        events = BUILTIN_REPLAY_SCENARIOS[self.scenario_name]
        try:
            while not self._stop_event.is_set():
                if self.is_paused:
                    await asyncio.sleep(0.2)
                    continue

                for template in events:
                    if self._stop_event.is_set():
                        break
                    while self.is_paused and not self._stop_event.is_set():
                        await asyncio.sleep(0.2)

                    event = NormalizedEvent(
                        identity_id=identity_id,
                        method=template["method"],
                        path_template=template["path"],
                        status_code=template["status"],
                        bytes_in=template["in"] + random.randint(0, 32),
                        bytes_out=template["out"] + random.randint(0, 64),
                        latency_ms=template["lat"] + round(random.uniform(0.1, 2.0), 2),
                        source="replay",
                        provenance="replay",
                        metadata={"scenario": self.scenario_name, "replay_seq": self.events_emitted},
                    )

                    if self.event_callback is not None:
                        res = self.event_callback(event)
                        if asyncio.iscoroutine(res):
                            await res

                    self.events_emitted += 1
                    # Controlled inter-event delay based on speed multiplier
                    base_delay = 0.2 / self.speed_multiplier
                    await asyncio.sleep(base_delay)

                if not loop:
                    break
        except asyncio.CancelledError:
            pass
        finally:
            self.is_running = False
