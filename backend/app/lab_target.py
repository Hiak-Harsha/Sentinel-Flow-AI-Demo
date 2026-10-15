"""Sentinel Flow Built-In Disposable Lab Target Service.

Provides an isolated, instrumented target environment with:
1. Target-side authentication and auth.failure / auth.success security audit events.
2. Safe canary endpoints for exploit attempt detection without executing untrusted payloads.
3. Connection sensor telemetry recording distinct destination port probes.
4. Bounded service health and latency telemetry for rate burst / overload observation.
"""

from __future__ import annotations

import hashlib
import logging
import time
from typing import Any
from fastapi import APIRouter, Header, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field

from app.auth.security import verify_internal_actor
from app.config import settings

logger = logging.getLogger("sentinel_flow.lab_target")

router = APIRouter(prefix="/lab-target", tags=["Disposable Lab Target"])

# Test accounts for safe authorized classroom testing
VALID_TEST_ACCOUNTS = {
    "test_analyst": "LabPass2026!",
    "lab_admin": "AdminSecret2026!",
    "demo_user": "DemoUser2026!",
}

# External event listener callbacks (wired to TrafficLogger & Database in main.py, and test fixtures)
_lab_event_listeners: list[Any] = []
_event_emitter_callback: Any | None = None


def add_lab_event_listener(listener_func: Any) -> None:
    if listener_func not in _lab_event_listeners:
        _lab_event_listeners.append(listener_func)


def remove_lab_event_listener(listener_func: Any) -> None:
    if listener_func in _lab_event_listeners:
        _lab_event_listeners.remove(listener_func)


def set_lab_event_emitter(emitter_func: Any) -> None:
    global _event_emitter_callback
    _event_emitter_callback = emitter_func
    add_lab_event_listener(emitter_func)


def _emit_lab_event(event_type: str, actor_id: str, path: str, status_code: int, metadata: dict[str, Any]) -> None:
    event_payload = {
        "event_type": event_type,
        "actor_id": actor_id,
        "path": path,
        "status_code": status_code,
        "metadata": metadata,
        "timestamp_utc": time.time(),
    }
    for listener in list(_lab_event_listeners):
        try:
            listener(event_payload)
        except Exception as e:
            logger.warning("Error emitting lab event: %s", e)


def _resolve_target_actor(request: Request) -> str:
    """Resolve verified actor identity from HMAC-signed internal header.
    
    Rejects tampered internal signatures with 403 Forbidden.
    Ignores forged client-supplied identity headers.
    Enforces active operator defensive mitigations (rate limiting & isolation).
    """
    internal_header = request.headers.get("X-Sentinel-Actor")
    actor_id: str | None = None
    if internal_header:
        verified = verify_internal_actor(internal_header)
        if verified and verified.get("actor_id"):
            actor_id = verified["actor_id"]
        else:
            logger.warning("Rejected lab target request with invalid or tampered X-Sentinel-Actor signature")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Invalid or tampered internal actor signature.",
            )

    # In automated test suite ONLY (when hitting target directly without proxy)
    if not actor_id and settings.env.lower() in ("test", "testing"):
        compat = request.headers.get("X-Sentinel-Identity") or request.headers.get("X-Attack-Run-ID")
        if compat:
            actor_id = compat.strip()

    if not actor_id:
        client_ip = request.client.host if request.client else "local"
        actor_id = f"guest_{client_ip}"

    # Enforce active operator defensive mitigations
    from app.services.mitigation_service import get_mitigation_service
    mit_svc = getattr(request.app.state, "mitigation_service", None) if hasattr(request, "app") and hasattr(request.app, "state") else None
    if not mit_svc:
        mit_svc = get_mitigation_service()

    allowed, reason, err_code = mit_svc.check_request_allowed(actor_id)
    if not allowed:
        logger.warning("Defensive mitigation active on %s: %s", actor_id, reason)
        raise HTTPException(status_code=err_code, detail=reason)

    return actor_id


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


@router.get("")
@router.get("/")
async def target_root() -> dict[str, Any]:
    """Target home page."""
    return {
        "service": "Sentinel Flow Disposable Lab Target",
        "status": "operational",
        "environment": "isolated_private_lab",
        "version": "1.0.0",
        "endpoints": {
            "auth": "/lab-target/auth/login",
            "products": "/lab-target/api/products",
            "status": "/lab-target/api/status",
            "canary": "/lab-target/canary/{probe_type}",
            "sensor": "/lab-target/sensor/port-probe",
        },
    }


@router.post("/auth/login")
async def target_login(req: LoginRequest, request: Request) -> dict[str, Any]:
    """Instrumented login endpoint producing verified target-side auth audit events."""
    attacker_id = _resolve_target_actor(request)
    username = req.username.strip()
    pwd_hash = hashlib.sha256(req.password.encode("utf-8")).hexdigest()[:16]

    # Verify credentials
    expected_pwd = VALID_TEST_ACCOUNTS.get(username)
    if expected_pwd is not None and expected_pwd == req.password:
        _emit_lab_event(
            event_type="auth.success",
            actor_id=attacker_id,
            path="/lab-target/auth/login",
            status_code=200,
            metadata={"principal": username, "auth_outcome": "SUCCESS", "pwd_hash_sample": pwd_hash},
        )
        return {"status": "authenticated", "principal": username, "token": f"lab_session_{pwd_hash}"}

    # Authentication failure
    _emit_lab_event(
        event_type="auth.failure",
        actor_id=attacker_id,
        path="/lab-target/auth/login",
        status_code=401,
        metadata={
            "principal": username,
            "auth_outcome": "FAILURE",
            "reason": "invalid_credentials",
            "pwd_hash_sample": pwd_hash,
        },
    )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Authentication failed: invalid credentials for principal '{username}'.",
    )


@router.get("/api/products")
async def list_products(request: Request) -> list[dict[str, Any]]:
    """Inexpensive catalog endpoint for testing regular browsing."""
    _resolve_target_actor(request)
    return [
        {"id": 1, "name": "Synthetic Sensor Tag", "category": "Hardware", "price": 29.99},
        {"id": 2, "name": "Telemetry Gateway Hub", "category": "Network", "price": 149.00},
        {"id": 3, "name": "Security Token Key", "category": "Auth", "price": 45.50},
    ]


@router.get("/api/status")
async def get_service_status(request: Request) -> dict[str, Any]:
    """Target service health and saturation indicator endpoint."""
    _resolve_target_actor(request)
    return {
        "status": "HEALTHY",
        "active_threads": 4,
        "load_index": 0.12,
        "database_latency_ms": 1.4,
        "timestamp": time.time(),
    }


@router.get("/canary/{probe_type}")
@router.post("/canary/{probe_type}")
async def canary_probe(probe_type: str, request: Request) -> dict[str, Any]:
    """Harmless canary trap route that records exploit attempts safely."""
    attacker_id = _resolve_target_actor(request)
    canary_token = f"CANARY-MARKER-{probe_type.upper()}-7701"

    _emit_lab_event(
        event_type="canary.hit",
        actor_id=attacker_id,
        path=f"/lab-target/canary/{probe_type}",
        status_code=403,
        metadata={
            "attempt_category": probe_type,
            "canary_token": canary_token,
            "query": str(request.query_params),
            "user_agent": request.headers.get("user-agent", "unknown"),
        },
    )

    return {
        "status": "blocked",
        "error": "canary_security_marker_tripped",
        "attempt_category": probe_type,
        "canary_token": canary_token,
        "message": "Security honeypot canary probe observed and logged. No payload executed.",
    }


@router.post("/sensor/port-probe")
async def record_port_probe(
    port: int = Query(..., ge=1, le=65535),
    protocol: str = Query(default="TCP"),
    request: Request = None,
) -> dict[str, Any]:
    """Simulated lab-sensor connection telemetry for distinct port scanning."""
    attacker_id = _resolve_target_actor(request)
    port_status = "CLOSED" if port not in (80, 443, 8000, 8080) else "OPEN"

    _emit_lab_event(
        event_type="connection.attempt",
        actor_id=attacker_id,
        path=f"port://{port}",
        status_code=200 if port_status == "OPEN" else 404,
        metadata={
            "destination_port": port,
            "protocol": protocol,
            "connection_status": port_status,
            "source_ip": request.client.host if request.client else "127.0.0.1",
        },
    )

    return {
        "port": port,
        "protocol": protocol,
        "status": port_status,
        "timestamp": time.time(),
    }
