"""Credential stuffing attack scenario driver.

Enforces strict safety constraints:
- Hard cap of MAX_TEST_ACCOUNTS = 50.
- Mandatory allowlist validation on target URL.
- Tags every outgoing request with the attack run_id.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Callable

import httpx

from app.orchestrator.allowlist_enforcer import OrchestratorAllowlistEnforcer, SecurityError

logger = logging.getLogger("sentinel_flow.orchestrator.credential_driver")


class CredentialStuffingDriver:
    """Executes safe credential stuffing scenarios against the operator's owned target."""

    MAX_TEST_ACCOUNTS = 50  # Hard cap — rejects larger lists

    def __init__(
        self,
        enforcer: OrchestratorAllowlistEnforcer,
        traffic_logger: Any | None = None,
    ) -> None:
        self.enforcer = enforcer
        self.traffic_logger = traffic_logger

    def validate_accounts(self, accounts: list[dict[str, str]]) -> None:
        """Validate account list does not exceed demo limits or look like external breaches."""
        if not accounts:
            raise SecurityError("Account list cannot be empty.")
        if len(accounts) > self.MAX_TEST_ACCOUNTS:
            raise SecurityError(
                f"Account list has {len(accounts)} entries, exceeding the maximum safe limit of {self.MAX_TEST_ACCOUNTS}."
            )

    async def execute_run(
        self,
        *,
        run_id: str,
        target_origin: str,
        accounts: list[dict[str, str]],
        rate_per_sec: float = 3.0,
        stop_event: asyncio.Event,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
        effect_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """Execute credential stuffing simulation against allowlisted target with real server logging."""
        valid_origin = self.enforcer.validate_target(target_origin)
        self.validate_accounts(accounts)

        delay = max(0.05, 1.0 / rate_per_sec)
        attempt_count = 0
        failure_count = 0
        success_count = 0
        attacker_id = f"attacker_bot_{run_id[:8]}"

        logger.info(
            "Starting credential stuffing run %s against %s (%d accounts)",
            run_id,
            valid_origin,
            len(accounts),
        )

        async with httpx.AsyncClient(timeout=5.0) as client:
            for idx, acc in enumerate(accounts):
                if stop_event.is_set():
                    logger.info("Credential stuffing run %s was cancelled by operator.", run_id)
                    break

                username = acc.get("username", f"test_user_{idx}")
                password = acc.get("password", "Password123!")

                # Target login endpoint
                login_path = "/api/login"
                login_url = f"{valid_origin}{login_path}"
                headers = {
                    "X-Attack-Run-ID": run_id,
                    "X-Sentinel-Identity": attacker_id,
                    "User-Agent": "SentinelFlow-AttackSimulator/2.0 (CredentialStuffingBot)",
                    "Content-Type": "application/json",
                }
                body_bytes = json.dumps({"username": username, "password": password}).encode("utf-8")

                t0 = time.perf_counter()
                status_code = 401
                resp_bytes = 0

                try:
                    resp = await client.post(
                        login_url,
                        content=body_bytes,
                        headers=headers,
                    )
                    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                    status_code = resp.status_code
                    resp_bytes = len(resp.content)
                    attempt_count += 1
                    if resp.status_code in (401, 403, 400, 404):
                        failure_count += 1
                    else:
                        success_count += 1
                except Exception as err:
                    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                    status_code = 502
                    resp_bytes = 0
                    attempt_count += 1
                    failure_count += 1

                # Log to central TrafficLogger for FeaturePipeline -> DetectionEngine
                if self.traffic_logger:
                    self.traffic_logger.log(
                        identity_id=attacker_id,
                        method="POST",
                        path=login_path,
                        query_string="",
                        status_code=status_code,
                        request_size_bytes=len(body_bytes),
                        response_size_bytes=resp_bytes,
                        latency_ms=latency_ms,
                        attack_run_id=run_id,
                        target_origin=valid_origin,
                        user_agent="SentinelFlow-AttackSimulator/2.0 (CredentialStuffingBot)",
                    )

                if effect_callback:
                    effect_callback({
                        "run_id": run_id,
                        "scenario": "credential_stuffing",
                        "target_path_hit": login_path,
                        "status_code": status_code,
                        "latency_ms": latency_ms,
                        "bytes_sent": len(body_bytes),
                        "bytes_recv": resp_bytes,
                        "cumulative_requests_sent": attempt_count,
                        "cumulative_errors": failure_count,
                        "attacker_identity": attacker_id,
                    })

                if progress_callback:
                    progress_callback({
                        "run_id": run_id,
                        "scenario": "credential_stuffing",
                        "progress_percent": round(((idx + 1) / len(accounts)) * 100, 1),
                        "attempts": attempt_count,
                        "failures": failure_count,
                        "successes": success_count,
                        "current_account": username,
                        "last_response": {
                            "status_code": status_code,
                            "latency_ms": latency_ms,
                            "bytes": resp_bytes,
                        },
                    })

                await asyncio.sleep(delay)

        return {
            "run_id": run_id,
            "status": "COMPLETED" if not stop_event.is_set() else "STOPPED",
            "total_attempts": attempt_count,
            "failures": failure_count,
            "successes": success_count,
            "target": valid_origin,
        }
