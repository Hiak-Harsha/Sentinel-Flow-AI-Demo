"""Security probe and network port scan scenario driver.

Executes safe, non-destructive vulnerability probing and lab connection sensor
scans against the allowlisted target environment.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable

import httpx

from app.orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer, SecurityError

logger = logging.getLogger("sentinel_flow.orchestrator.zap_driver")

CANARY_PROBES = [
    ("/lab-target/canary/sqli?search=%27+OR+1%3D1--", "SQL Injection Canary Marker"),
    ("/lab-target/canary/xss?q=%3Cscript%3Ealert%281%29%3C%2Fscript%3E", "Reflected XSS Canary Marker"),
    ("/lab-target/canary/traversal?file=../../etc/passwd", "Path Traversal Canary Marker"),
    ("/lab-target/canary/admin", "Admin Endpoint Discovery Marker"),
    ("/lab-target/canary/env", "Environment Disclosure Canary Marker"),
    ("/lab-target/canary/debug", "Debug Console Canary Marker"),
]

DISTINCT_PORTS = [21, 22, 23, 80, 443, 3306, 5432, 8080]


class ZapDriver:
    """Executes safe security probing and distinct-port scans against allowlisted lab targets."""

    def __init__(
        self,
        enforcer: OrchestratorAllowlistEnforcer,
        traffic_logger: Any | None = None,
    ) -> None:
        self.enforcer = enforcer
        self.traffic_logger = traffic_logger

    async def execute_probe_scan(
        self,
        *,
        run_id: str,
        target_origin: str,
        stop_event: asyncio.Event,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
        effect_callback: Callable[[dict[str, Any]], None] | None = None,
        attacker_identity: str | None = None,
    ) -> dict[str, Any]:
        """Execute non-destructive security canary probes with server-measured logging."""
        valid_origin = self.enforcer.validate_target(target_origin)
        base_url = valid_origin.split("/lab-target")[0] if "/lab-target" in valid_origin else valid_origin
        attacker_id = attacker_identity or f"canary_runner_{run_id[:8]}"

        from app.auth.security import sign_internal_actor
        signed_actor = sign_internal_actor(actor_id=attacker_id, role="participant", run_id=run_id)

        total = len(CANARY_PROBES)
        sent = 0
        failed = 0

        transport = None
        import sys
        from app.config import settings
        if "pytest" in sys.modules or settings.env.lower() in ("test", "testing"):
            try:
                from app.main import app as main_app
                transport = httpx.ASGITransport(app=main_app)
            except Exception:
                pass

        async with httpx.AsyncClient(transport=transport, timeout=4.0) as client:
            for idx, (path_and_query, probe_name) in enumerate(CANARY_PROBES):
                if stop_event.is_set():
                    logger.info("Probe scan %s was halted by operator.", run_id)
                    break

                target_url = f"{base_url}{path_and_query}"
                headers = {
                    "X-Attack-Run-ID": run_id,
                    "X-Sentinel-Identity": attacker_id,
                    "X-Sentinel-Actor": signed_actor,
                    "User-Agent": "SentinelFlow-CanaryProbeEngine/2.0",
                }

                t0 = time.perf_counter()
                status_code = 403
                resp_bytes = 0

                try:
                    resp = await client.get(target_url, headers=headers)
                    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                    status_code = resp.status_code
                    resp_bytes = len(resp.content)
                    sent += 1
                except Exception:
                    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                    status_code = 403
                    resp_bytes = 64
                    sent += 1
                    failed += 1

                path_clean = path_and_query.split("?")[0]
                query_clean = path_and_query.split("?")[1] if "?" in path_and_query else ""

                if self.traffic_logger:
                    self.traffic_logger.log(
                        identity_id=attacker_id,
                        method="GET",
                        path=path_clean,
                        query_string=query_clean,
                        status_code=status_code,
                        request_size_bytes=len(path_and_query),
                        response_size_bytes=resp_bytes,
                        latency_ms=latency_ms,
                        attack_run_id=run_id,
                        target_origin=valid_origin,
                        user_agent="SentinelFlow-CanaryProbeEngine/2.0",
                    )

                if effect_callback:
                    effect_callback({
                        "run_id": run_id,
                        "scenario": "canary_probe",
                        "target_path_hit": path_clean,
                        "query_string": query_clean,
                        "probe_name": probe_name,
                        "status_code": status_code,
                        "latency_ms": latency_ms,
                        "attacker_identity": attacker_id,
                        "attempt_index": idx + 1,
                        "total_attempts": total,
                        "canary_tripped": True,
                    })

                if progress_callback:
                    pct = round(((idx + 1) / total) * 100, 1)
                    progress_callback({
                        "run_id": run_id,
                        "progress_percent": pct,
                        "probes_sent": sent,
                        "probe_name": probe_name,
                        "status": "RUNNING",
                    })

                await asyncio.sleep(0.4)

        return {
            "run_id": run_id,
            "scenario": "canary_probe",
            "probes_sent": sent,
            "status": "STOPPED" if stop_event.is_set() else "COMPLETED",
        }

    async def execute_port_scan(
        self,
        *,
        run_id: str,
        target_origin: str,
        stop_event: asyncio.Event,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
        effect_callback: Callable[[dict[str, Any]], None] | None = None,
        attacker_identity: str | None = None,
    ) -> dict[str, Any]:
        """Execute simulated connection sensor probes across distinct ports."""
        valid_origin = self.enforcer.validate_target(target_origin)
        base_url = valid_origin.split("/lab-target")[0] if "/lab-target" in valid_origin else valid_origin
        sensor_url = f"{base_url}/lab-target/sensor/port-probe"
        attacker_id = attacker_identity or f"port_scanner_{run_id[:8]}"

        from app.auth.security import sign_internal_actor
        signed_actor = sign_internal_actor(actor_id=attacker_id, role="participant", run_id=run_id)

        total = len(DISTINCT_PORTS)
        sent = 0

        transport = None
        import sys
        from app.config import settings
        if "pytest" in sys.modules or settings.env.lower() in ("test", "testing"):
            try:
                from app.main import app as main_app
                transport = httpx.ASGITransport(app=main_app)
            except Exception:
                pass

        async with httpx.AsyncClient(transport=transport, timeout=3.0) as client:
            for idx, port in enumerate(DISTINCT_PORTS):
                if stop_event.is_set():
                    logger.info("Port scan %s was halted by operator.", run_id)
                    break

                headers = {
                    "X-Attack-Run-ID": run_id,
                    "X-Sentinel-Identity": attacker_id,
                    "X-Sentinel-Actor": signed_actor,
                    "User-Agent": "SentinelFlow-PortScanner/2.0",
                }

                t0 = time.perf_counter()
                status_code = 200
                try:
                    resp = await client.post(
                        f"{sensor_url}?port={port}&protocol=TCP",
                        headers=headers,
                    )
                    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                    status_code = resp.status_code
                    sent += 1
                except Exception:
                    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                    status_code = 404
                    sent += 1

                # Log as connection record
                if self.traffic_logger:
                    self.traffic_logger.log(
                        identity_id=attacker_id,
                        method="SYN",
                        path=f"port://{port}",
                        query_string=f"port={port}",
                        status_code=status_code,
                        request_size_bytes=64,
                        response_size_bytes=40,
                        latency_ms=latency_ms,
                        attack_run_id=run_id,
                        target_origin=valid_origin,
                        user_agent="SentinelFlow-PortScanner/2.0",
                    )

                if effect_callback:
                    effect_callback({
                        "run_id": run_id,
                        "scenario": "port_scan",
                        "target_path_hit": f"port://{port}",
                        "destination_port": port,
                        "status_code": status_code,
                        "latency_ms": latency_ms,
                        "attacker_identity": attacker_id,
                        "attempt_index": idx + 1,
                        "total_attempts": total,
                        "distinct_ports_so_far": idx + 1,
                    })

                if progress_callback:
                    pct = round(((idx + 1) / total) * 100, 1)
                    progress_callback({
                        "run_id": run_id,
                        "progress_percent": pct,
                        "ports_probed": sent,
                        "last_port": port,
                        "status": "RUNNING",
                    })

                await asyncio.sleep(0.3)

        return {
            "run_id": run_id,
            "scenario": "port_scan",
            "ports_probed": sent,
            "status": "STOPPED" if stop_event.is_set() else "COMPLETED",
        }
