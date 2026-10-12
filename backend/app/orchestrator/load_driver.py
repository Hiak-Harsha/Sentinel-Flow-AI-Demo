"""Load burst & scraping attack scenario driver.

Generates realistic volumetric bursts, crawling / scraping patterns, and rate spikes
against the operator's allowlisted target environment.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

import httpx

from app.orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer, SecurityError

logger = logging.getLogger("sentinel_flow.orchestrator.load_driver")

SCRAPING_PATHS = [
    "/",
    "/api/products",
    "/api/categories",
    "/api/items/1",
    "/api/items/2",
    "/api/items/3",
    "/api/search?q=test",
    "/api/search?q=admin",
    "/api/users/profile",
    "/api/cart",
    "/about",
    "/contact",
    "/faq",
    "/terms",
    "/privacy",
]


class LoadBurstDriver:
    """Executes burst and scraping load profiles strictly against allowlisted targets."""

    def __init__(
        self,
        enforcer: OrchestratorAllowlistEnforcer,
        traffic_logger: Any | None = None,
    ) -> None:
        self.enforcer = enforcer
        self.traffic_logger = traffic_logger

    async def execute_burst(
        self,
        *,
        run_id: str,
        target_origin: str,
        duration_seconds: int = 20,
        requests_per_sec: int = 15,
        stop_event: asyncio.Event,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
        effect_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """Execute a volumetric burst (burst_dos) with real server-measured logging."""
        valid_origin = self.enforcer.validate_target(target_origin)
        total_requests = duration_seconds * requests_per_sec
        sent = 0
        success = 0
        failed = 0
        attacker_id = f"dos_agent_{run_id[:8]}"

        delay = 1.0 / max(1, requests_per_sec)

        async with httpx.AsyncClient(timeout=4.0) as client:
            for i in range(total_requests):
                if stop_event.is_set():
                    break

                headers = {
                    "X-Attack-Run-ID": run_id,
                    "X-Sentinel-Identity": attacker_id,
                    "User-Agent": "SentinelFlow-BurstTester/2.0",
                }

                import time
                t0 = time.perf_counter()
                status_code = 502
                resp_bytes = 0

                try:
                    resp = await client.get(f"{valid_origin}/", headers=headers)
                    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                    status_code = resp.status_code
                    resp_bytes = len(resp.content)
                    sent += 1
                    if resp.status_code < 500:
                        success += 1
                    else:
                        failed += 1
                except Exception as err:
                    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                    status_code = 502
                    resp_bytes = 0
                    sent += 1
                    failed += 1

                # Log real request to central TrafficLogger for FeaturePipeline -> DetectionEngine
                if self.traffic_logger:
                    self.traffic_logger.log(
                        identity_id=attacker_id,
                        method="GET",
                        path="/",
                        query_string="",
                        status_code=status_code,
                        request_size_bytes=0,
                        response_size_bytes=resp_bytes,
                        latency_ms=latency_ms,
                        attack_run_id=run_id,
                        target_origin=valid_origin,
                        user_agent="SentinelFlow-BurstTester/2.0",
                    )

                if effect_callback and (i % 3 == 0 or i == total_requests - 1):
                    effect_callback({
                        "run_id": run_id,
                        "scenario": "burst_dos",
                        "target_path_hit": "/",
                        "status_code": status_code,
                        "latency_ms": latency_ms,
                        "bytes_sent": 0,
                        "bytes_recv": resp_bytes,
                        "cumulative_requests_sent": sent,
                        "cumulative_errors": failed,
                        "attacker_identity": attacker_id,
                    })

                if progress_callback and (i % 5 == 0 or i == total_requests - 1):
                    progress_callback({
                        "run_id": run_id,
                        "scenario": "burst_dos",
                        "progress_percent": round(((i + 1) / total_requests) * 100, 1),
                        "sent": sent,
                        "success": success,
                        "failed": failed,
                        "last_response": {
                            "status_code": status_code,
                            "latency_ms": latency_ms,
                            "bytes": resp_bytes,
                        },
                    })

                await asyncio.sleep(delay)

        return {
            "run_id": run_id,
            "scenario": "burst_dos",
            "sent": sent,
            "success": success,
            "failed": failed,
            "target": valid_origin,
        }

    async def execute_scraping(
        self,
        *,
        run_id: str,
        target_origin: str,
        iterations: int = 3,
        interval_ms: int = 150,
        stop_event: asyncio.Event,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
        effect_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """Execute automated web scraping with real server-measured logging."""
        valid_origin = self.enforcer.validate_target(target_origin)
        endpoints = SCRAPING_PATHS * iterations
        total = len(endpoints)
        sent = 0
        failed = 0
        attacker_id = f"scraper_bot_{run_id[:8]}"

        delay = interval_ms / 1000.0

        async with httpx.AsyncClient(timeout=4.0) as client:
            for idx, path in enumerate(endpoints):
                if stop_event.is_set():
                    break

                headers = {
                    "X-Attack-Run-ID": run_id,
                    "X-Sentinel-Identity": attacker_id,
                    "User-Agent": "SentinelFlow-Scraper/2.0 (SecuritySpider)",
                }

                import time
                t0 = time.perf_counter()
                status_code = 502
                resp_bytes = 0

                try:
                    resp = await client.get(f"{valid_origin}{path}", headers=headers)
                    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                    status_code = resp.status_code
                    resp_bytes = len(resp.content)
                    sent += 1
                except Exception:
                    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                    status_code = 502
                    resp_bytes = 0
                    sent += 1
                    failed += 1

                if self.traffic_logger:
                    self.traffic_logger.log(
                        identity_id=attacker_id,
                        method="GET",
                        path=path,
                        query_string="",
                        status_code=status_code,
                        request_size_bytes=0,
                        response_size_bytes=resp_bytes,
                        latency_ms=latency_ms,
                        attack_run_id=run_id,
                        target_origin=valid_origin,
                        user_agent="SentinelFlow-Scraper/2.0 (SecuritySpider)",
                    )

                if effect_callback and (idx % 3 == 0 or idx == total - 1):
                    effect_callback({
                        "run_id": run_id,
                        "scenario": "scraping",
                        "target_path_hit": path,
                        "status_code": status_code,
                        "latency_ms": latency_ms,
                        "bytes_sent": 0,
                        "bytes_recv": resp_bytes,
                        "cumulative_requests_sent": sent,
                        "cumulative_errors": failed,
                        "attacker_identity": attacker_id,
                    })

                if progress_callback:
                    progress_callback({
                        "run_id": run_id,
                        "scenario": "scraping",
                        "progress_percent": round(((idx + 1) / total) * 100, 1),
                        "sent": sent,
                        "current_path": path,
                        "last_response": {
                            "status_code": status_code,
                            "latency_ms": latency_ms,
                            "bytes": resp_bytes,
                        },
                    })

                await asyncio.sleep(delay)

        return {
            "run_id": run_id,
            "scenario": "scraping",
            "sent": sent,
            "target": valid_origin,
        }
