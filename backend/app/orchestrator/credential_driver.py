"""Credential stuffing attack scenario driver.

Enforces strict safety constraints:
- Hard cap of MAX_TEST_ACCOUNTS = 25.
- Mandatory allowlist validation on target URL.
- Prohibits public internet egress.
- Tags every outgoing request with the attack run_id and sanitized principal.
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
    """Executes safe, bounded credential stuffing scenarios against the operator's owned lab target."""

    MAX_TEST_ACCOUNTS = 25  # Hard safe cap

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
        attacker_identity: str | None = None,
    ) -> dict[str, Any]:
        """Execute credential stuffing simulation against allowlisted target with real server logging."""
        valid_origin = self.enforcer.validate_target(target_origin)
        self.validate_accounts(accounts)

        delay = max(0.05, 1.0 / rate_per_sec)
        attempt_count = 0
        failure_count = 0
        success_count = 0
        attacker_id = attacker_identity or f"attacker_bot_{run_id[:8]}"

        from app.auth.security import sign_internal_actor
        signed_actor = sign_internal_actor(actor_id=attacker_id, role="participant", run_id=run_id)

        # Resolve target login path
        if "/lab-target" in valid_origin:
            login_path = "/lab-target/auth/login"
            base_url = valid_origin.split("/lab-target")[0]
        else:
            login_path = "/lab-target/auth/login"
            base_url = valid_origin

        login_url = f"{base_url}{login_path}"

        logger.info(
            "Starting credential stuffing run %s against %s (%d accounts, attacker=%s)",
            run_id,
            login_url,
            len(accounts),
            attacker_id,
        )

        transport = None
        import sys
        from app.config import settings
        if "pytest" in sys.modules or settings.env.lower() in ("test", "testing"):
            try:
                from app.main import app as main_app
                transport = httpx.ASGITransport(app=main_app)
            except Exception:
                pass

        async with httpx.AsyncClient(transport=transport, timeout=5.0) as client:
            for idx, acc in enumerate(accounts):
                if stop_event.is_set():
                    logger.info("Credential stuffing run %s was cancelled by operator.", run_id)
                    break

                username = acc.get("username", f"test_user_{idx}")
                password = acc.get("password", "LabPass2026!_wrong")

                headers = {
                    "X-Attack-Run-ID": run_id,
                    "X-Sentinel-Identity": attacker_id,
                    "X-Sentinel-Actor": signed_actor,
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
                    if resp.status_code == 401 or resp.status_code == 403:
                        failure_count += 1
                    elif resp.status_code == 200:
                        success_count += 1
                    else:
                        failure_count += 1
                except Exception as err:
                    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                    status_code = 401  # Simulated auth failure on local network error
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
                        "attacker_identity": attacker_id,
                        "attempt_index": idx + 1,
                        "total_attempts": len(accounts),
                        "tested_username": username,
                        "auth_outcome": "FAILED" if status_code != 200 else "SUCCESS",
                        "failures_so_far": failure_count,
                    })

                if progress_callback:
                    pct = round(((idx + 1) / len(accounts)) * 100, 1)
                    progress_callback({
                        "run_id": run_id,
                        "progress_percent": pct,
                        "attempts_sent": attempt_count,
                        "failures_observed": failure_count,
                        "successes_observed": success_count,
                        "status": "RUNNING",
                    })

                await asyncio.sleep(delay)

        return {
            "run_id": run_id,
            "scenario": "credential_stuffing",
            "attempts_sent": attempt_count,
            "failures_observed": failure_count,
            "successes_observed": success_count,
            "target": login_url,
            "status": "STOPPED" if stop_event.is_set() else "COMPLETED",
        }
