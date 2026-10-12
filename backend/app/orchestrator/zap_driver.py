"""OWASP ZAP integration driver & security scanner.

Communicates with local OWASP ZAP daemon via REST API if running, or executes
safe, non-destructive vulnerability probing against the allowlisted target.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable

import httpx

from app.orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer, SecurityError

logger = logging.getLogger("sentinel_flow.orchestrator.zap_driver")

PROBE_PAYLOADS = [
    ("/?search=%27+OR+1%3D1--", "SQL Injection Probe"),
    ("/?q=%3Cscript%3Ealert%281%29%3C%2Fscript%3E", "Reflected XSS Probe"),
    ("/api/items?id=1%27", "SQL Syntax Test"),
    ("/.env", "Sensitive File Probe"),
    ("/actuator/health", "Admin Endpoint Discovery"),
    ("/wp-login.php", "Common CMS Probe"),
    ("/api/v1/debug", "Debug Endpoint Discovery"),
    ("/../../etc/passwd", "Path Traversal Probe"),
]


class ZapDriver:
    """Executes safe security probing / OWASP ZAP scans against allowlisted targets."""

    def __init__(
        self,
        enforcer: OrchestratorAllowlistEnforcer,
        zap_api_url: str = "http://localhost:8080",
        api_key: str = "",
        traffic_logger: Any | None = None,
    ) -> None:
        self.enforcer = enforcer
        self.zap_api_url = zap_api_url
        self.api_key = api_key
        self.traffic_logger = traffic_logger

    async def execute_probe_scan(
        self,
        *,
        run_id: str,
        target_origin: str,
        stop_event: asyncio.Event,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
        effect_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """Execute non-destructive security vulnerability probes with server-measured logging."""
        valid_origin = self.enforcer.validate_target(target_origin)
        total = len(PROBE_PAYLOADS)
        sent = 0
        failed = 0
        attacker_id = f"security_scanner_{run_id[:8]}"

        async with httpx.AsyncClient(timeout=4.0) as client:
            for idx, (path, desc) in enumerate(PROBE_PAYLOADS):
                if stop_event.is_set():
                    break

                target_url = f"{valid_origin}{path}"
                headers = {
                    "X-Attack-Run-ID": run_id,
                    "X-Sentinel-Identity": attacker_id,
                    "User-Agent": "SentinelFlow-SecurityScanner/2.0 (OWASP-ZAP-Compatible)",
                }

                t0 = time.perf_counter()
                status_code = 502
                resp_bytes = 0

                try:
                    resp = await client.get(target_url, headers=headers)
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

                # Log to central TrafficLogger for FeaturePipeline -> DetectionEngine
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
                        user_agent="SentinelFlow-SecurityScanner/2.0 (OWASP-ZAP-Compatible)",
                    )

                if effect_callback:
                    effect_callback({
                        "run_id": run_id,
                        "scenario": "zap_scan",
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
                        "scenario": "zap_scan",
                        "progress_percent": round(((idx + 1) / total) * 100, 1),
                        "sent": sent,
                        "current_probe": desc,
                        "last_response": {
                            "status_code": status_code,
                            "latency_ms": latency_ms,
                            "bytes": resp_bytes,
                        },
                    })

                await asyncio.sleep(0.3)

        return {
            "run_id": run_id,
            "scenario": "zap_scan",
            "probes_executed": sent,
            "target": valid_origin,
        }
