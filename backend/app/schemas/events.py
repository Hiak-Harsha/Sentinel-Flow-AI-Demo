"""Normalized event schemas for real-time telemetry, replay, and stream ingestion."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

EventSource = Literal["reverse_proxy", "lab_target", "webhook", "host_sensor", "replay"]
EventProvenance = Literal["live", "simulated", "replay"]


def compute_idempotency_key(
    identity_id: str,
    method: str,
    path_template: str,
    ts: datetime | str,
    bytes_in: int = 0,
    bytes_out: int = 0,
    entropy_nonce: str | None = None,
) -> str:
    """Compute a deterministic hash for deduplication and at-least-once stream semantics."""
    ts_str = ts.isoformat() if isinstance(ts, datetime) else str(ts)
    nonce = entropy_nonce or ""
    raw = f"{identity_id}|{method}|{path_template}|{ts_str}|{bytes_in}|{bytes_out}|{nonce}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


class NormalizedEvent(BaseModel):
    """Canonical event format ingested by Sentinel Flow streaming pipeline."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    idempotency_key: str = Field(default="")
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    identity_id: str = Field(..., description="Identity, participant, or device identifier")
    method: str = Field(default="GET", description="HTTP method or telemetry action")
    path_template: str = Field(default="/", description="Canonical endpoint or path template")
    status_code: int = Field(default=200, ge=100, le=599)
    bytes_in: int = Field(default=0, ge=0)
    bytes_out: int = Field(default=0, ge=0)
    latency_ms: float = Field(default=0.0, ge=0.0)
    source: EventSource = Field(default="reverse_proxy")
    provenance: EventProvenance = Field(default="live")
    client_fingerprint: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    session_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    def model_post_init(self, __context: Any) -> None:
        if not self.idempotency_key:
            self.idempotency_key = compute_idempotency_key(
                identity_id=self.identity_id,
                method=self.method,
                path_template=self.path_template,
                ts=self.ts,
                bytes_in=self.bytes_in,
                bytes_out=self.bytes_out,
            )

    def to_stream_dict(self) -> dict[str, str]:
        """Serialize event to string-valued dictionary for Redis Streams XADD."""
        import json

        return {
            "id": self.id,
            "idempotency_key": self.idempotency_key,
            "ts": self.ts.isoformat(),
            "identity_id": self.identity_id,
            "method": self.method,
            "path_template": self.path_template,
            "status_code": str(self.status_code),
            "bytes_in": str(self.bytes_in),
            "bytes_out": str(self.bytes_out),
            "latency_ms": str(self.latency_ms),
            "source": str(self.source),
            "provenance": str(self.provenance),
            "client_fingerprint": self.client_fingerprint or "",
            "ip_address": self.ip_address or "",
            "user_agent": self.user_agent or "",
            "session_id": self.session_id or "",
            "metadata_json": json.dumps(self.metadata),
        }

    @classmethod
    def from_stream_dict(cls, data: dict[str | bytes, str | bytes]) -> NormalizedEvent:
        """Deserialize from Redis Stream XREAD response."""
        import json

        decoded = {
            (k.decode("utf-8") if isinstance(k, bytes) else str(k)): (
                v.decode("utf-8") if isinstance(v, bytes) else str(v)
            )
            for k, v in data.items()
        }

        meta = {}
        if decoded.get("metadata_json"):
            try:
                meta = json.loads(decoded["metadata_json"])
            except Exception:
                meta = {}

        return cls(
            id=decoded["id"],
            idempotency_key=decoded.get("idempotency_key", ""),
            ts=datetime.fromisoformat(decoded["ts"]),
            identity_id=decoded["identity_id"],
            method=decoded.get("method", "GET"),
            path_template=decoded.get("path_template", "/"),
            status_code=int(decoded.get("status_code", 200)),
            bytes_in=int(decoded.get("bytes_in", 0)),
            bytes_out=int(decoded.get("bytes_out", 0)),
            latency_ms=float(decoded.get("latency_ms", 0.0)),
            source=decoded.get("source", "reverse_proxy"),  # type: ignore[arg-type]
            provenance=decoded.get("provenance", "live"),  # type: ignore[arg-type]
            client_fingerprint=decoded.get("client_fingerprint") or None,
            ip_address=decoded.get("ip_address") or None,
            user_agent=decoded.get("user_agent") or None,
            session_id=decoded.get("session_id") or None,
            metadata=meta,
        )
