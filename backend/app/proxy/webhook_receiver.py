"""Webhook receiver for target application events with cryptographic authentication and replay protection.

Receives structured application-level security and audit events from the target application
(e.g., login failure, order checkout, permission changes, rate limit triggers) and records
them alongside reverse-proxy telemetry.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Any
from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.config import WEBHOOK_SHARED_SECRET, is_private_or_loopback_host
from app.proxy.traffic_logger import TrafficLogger

logger = logging.getLogger("sentinel_flow.proxy.webhook_receiver")

router = APIRouter(prefix="/api/webhook", tags=["Webhook"])


class TargetEventPayload(BaseModel):
    """Event sent from the target application via webhook."""

    event_type: str = Field(..., description="E.g. auth_failed, auth_success, checkout, admin_access")
    identity_id: str = Field(default="unknown", description="Sentinel Flow identity or target username")
    timestamp: float | None = Field(default=None, description="Event epoch timestamp")
    path: str = Field(default="/", description="Endpoint associated with event")
    status_code: int = Field(default=200, description="HTTP status code if applicable")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional context from target app")


# In-memory webhook event store for quick inspection and correlation
_webhook_events: list[dict[str, Any]] = []
_traffic_logger_instance: TrafficLogger | None = None


def set_webhook_traffic_logger(logger_instance: TrafficLogger) -> None:
    global _traffic_logger_instance
    _traffic_logger_instance = logger_instance


def verify_webhook_signature(body_bytes: bytes, signature: str | None, timestamp_header: str | None) -> None:
    """Verify HMAC-SHA256 signature and prevent replay attacks."""
    if not signature:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing required X-Sentinel-Signature header.",
        )

    # Replay protection: check timestamp within 60s
    if timestamp_header:
        try:
            req_time = float(timestamp_header)
            if abs(time.time() - req_time) > 60.0:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Webhook request expired: clock skew or replay attack detected.",
                )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid X-Sentinel-Timestamp header format.",
            )

    # Calculate expected HMAC (support both raw concatenation and dot-delimited)
    msg1 = f"{timestamp_header or ''}".encode("utf-8") + body_bytes
    msg2 = f"{timestamp_header or ''}.".encode("utf-8") + body_bytes
    sig1 = hmac.new(WEBHOOK_SHARED_SECRET.encode("utf-8"), msg1, hashlib.sha256).hexdigest()
    sig2 = hmac.new(WEBHOOK_SHARED_SECRET.encode("utf-8"), msg2, hashlib.sha256).hexdigest()

    if not (hmac.compare_digest(sig1, signature) or hmac.compare_digest(sig2, signature)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid webhook HMAC signature.",
        )


@router.post("/target-event", status_code=status.HTTP_202_ACCEPTED)
async def receive_target_event(
    event: TargetEventPayload,
    request: Request,
    x_sentinel_signature: str | None = Header(default=None),
    x_sentinel_timestamp: str | None = Header(default=None),
) -> dict[str, Any]:
    """Receive an authenticated application-level event from the target app."""
    # Check sender host is private or loopback
    sender_host = request.client.host if request.client else "127.0.0.1"
    if not is_private_or_loopback_host(sender_host):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Webhook events accepted only from private lab networks.",
        )

    body_bytes = await request.body()
    verify_webhook_signature(body_bytes, x_sentinel_signature, x_sentinel_timestamp)

    ts = event.timestamp or time.time()
    event_dict = {
        "event_type": event.event_type,
        "identity_id": event.identity_id,
        "timestamp": ts,
        "path": event.path,
        "status_code": event.status_code,
        "metadata": event.metadata,
        "source_ip": sender_host,
    }
    _webhook_events.append(event_dict)
    if len(_webhook_events) > 10_000:
        _webhook_events.pop(0)

    # If logger is attached, record this as synthetic traffic or correlated marker
    if _traffic_logger_instance:
        _traffic_logger_instance.log(
            identity_id=event.identity_id,
            method="WEBHOOK",
            path=f"/webhook/{event.event_type}",
            query_string="",
            status_code=event.status_code,
            request_size_bytes=len(str(event.metadata)),
            response_size_bytes=0,
            latency_ms=0.0,
            target_origin=str(event.metadata.get("target_origin", "webhook")),
        )

    logger.info("Received authenticated target event [%s] for %s", event.event_type, event.identity_id)
    return {"status": "accepted", "event_type": event.event_type, "timestamp": ts}


@router.get("/events")
async def list_target_events(limit: int = 50) -> list[dict[str, Any]]:
    """List recent received webhook events."""
    return _webhook_events[-limit:]
