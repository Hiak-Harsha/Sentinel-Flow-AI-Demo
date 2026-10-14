"""Background worker for telemetry rollups (1m, 1h) and raw event retention pruning."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.repositories.event_repo import EventRepository

logger = logging.getLogger("sentinel_flow.services.rollup_worker")

_worker_task: asyncio.Task | None = None
_stop_event = asyncio.Event()


async def _rollup_loop(event_repo: EventRepository, retention_days: int = 7) -> None:
    """Periodic loop to calculate rollups and prune raw events."""
    logger.info("Started telemetry rollup and retention background worker")
    iteration = 0

    while not _stop_event.is_set():
        try:
            # 1. Compute 1-minute rollup
            await event_repo.generate_rollup(window_type="1m")

            # 2. Compute 1-hour rollup every 60 iterations (once an hour)
            if iteration % 60 == 0:
                await event_repo.generate_rollup(window_type="1h")

            # 3. Prune raw events older than retention period every 1440 iterations (once a day)
            if iteration % 1440 == 0:
                await event_repo.prune_events_older_than(days=retention_days)

            iteration += 1
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Error in rollup and retention loop")

        try:
            # Sleep for 60 seconds or until stopped
            await asyncio.wait_for(_stop_event.wait(), timeout=60.0)
        except asyncio.TimeoutError:
            pass


def start_rollup_worker(event_repo: EventRepository | None = None, retention_days: int = 7) -> asyncio.Task:
    """Launch the background rollup worker task."""
    global _worker_task, _stop_event
    _stop_event.clear()
    repo = event_repo or EventRepository()
    _worker_task = asyncio.create_task(_rollup_loop(repo, retention_days))
    return _worker_task


async def stop_rollup_worker() -> None:
    """Signal background rollup worker to terminate and wait for exit."""
    global _worker_task, _stop_event
    _stop_event.set()
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
    _worker_task = None
    logger.info("Stopped telemetry rollup and retention background worker")
