"""Host Sensor for local system resource & connection monitoring (strictly opt-in).

SAFETY INVARIANTS:
1. Strictly opt-in: disabled by default unless explicitly configured via enable_host_sensor=True.
2. Local boundary only: samples ONLY the local machine's own psutil counters. Never connects to or probes remote hosts.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Callable

import psutil

from app.schemas.events import NormalizedEvent

logger = logging.getLogger("sentinel_flow.sensors.host_flow")


class HostFlowSensor:
    """Samples local host network connection counts, socket states, and I/O rates."""

    def __init__(
        self,
        event_callback: Callable[[NormalizedEvent], Any] | None = None,
        sample_interval_seconds: float = 2.0,
        enabled: bool = False,
    ) -> None:
        self.event_callback = event_callback
        self.sample_interval = sample_interval_seconds
        self.enabled = enabled
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._last_net_io = psutil.net_io_counters()
        self._last_sample_time = time.monotonic()

    def start(self) -> bool:
        """Start the background sampling task if explicitly enabled."""
        if not self.enabled:
            logger.info("Host sensor is disabled by safety configuration (enable_host_sensor=False)")
            return False

        if self._task is not None and not self._task.done():
            return True

        self._stop_event.clear()
        self._task = asyncio.create_task(self._sample_loop())
        logger.info(
            "Host sensor started (sampling local socket & I/O counters every %.1fs)",
            self.sample_interval,
        )
        return True

    async def stop(self) -> None:
        """Gracefully stop sampling task."""
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Host sensor stopped")

    def sample_now(self) -> dict[str, Any]:
        """Perform an instantaneous snapshot of local host metrics."""
        now = time.monotonic()
        elapsed = max(0.001, now - self._last_sample_time)
        self._last_sample_time = now

        current_net_io = psutil.net_io_counters()
        bytes_sent_delta = max(0, current_net_io.bytes_sent - self._last_net_io.bytes_sent)
        bytes_recv_delta = max(0, current_net_io.bytes_recv - self._last_net_io.bytes_recv)
        self._last_net_io = current_net_io

        # Connection counts by socket status
        connections = psutil.net_connections(kind="inet")
        status_counts: dict[str, int] = {}
        for c in connections:
            st = c.status
            status_counts[st] = status_counts.get(st, 0) + 1

        cpu_pct = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_connections": len(connections),
            "established_connections": status_counts.get("ESTABLISHED", 0),
            "listen_connections": status_counts.get("LISTEN", 0),
            "time_wait_connections": status_counts.get("TIME_WAIT", 0),
            "bytes_sent_rate_per_sec": round(bytes_sent_delta / elapsed, 2),
            "bytes_recv_rate_per_sec": round(bytes_recv_delta / elapsed, 2),
            "bytes_in": bytes_recv_delta,
            "bytes_out": bytes_sent_delta,
            "cpu_percent": cpu_pct,
            "memory_percent": mem.percent,
        }

    async def _sample_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                metrics = self.sample_now()
                event = NormalizedEvent(
                    identity_id="host:localhost",
                    method="HOST_SAMPLE",
                    path_template="/system/host-telemetry",
                    status_code=200,
                    bytes_in=int(metrics["bytes_in"]),
                    bytes_out=int(metrics["bytes_out"]),
                    latency_ms=0.5,
                    source="host_sensor",
                    provenance="live",
                    metadata=metrics,
                )
                if self.event_callback is not None:
                    res = self.event_callback(event)
                    if asyncio.iscoroutine(res):
                        await res
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error sampling host flow metrics")

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.sample_interval)
            except asyncio.TimeoutError:
                pass
