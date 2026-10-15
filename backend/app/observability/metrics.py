"""Prometheus metrics and observability collectors for Sentinel Flow.

Exports Prometheus-compatible metrics for event ingestion, queue lag, inference
latency, active WebSocket connections, alert counts, and HTTP performance.
"""

from __future__ import annotations

import logging
from typing import Any

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    REGISTRY,
    generate_latest,
)

logger = logging.getLogger("sentinel_flow.observability.metrics")

# Prometheus Metrics Collectors
EVENTS_TOTAL = Counter(
    "sentinel_events_total",
    "Total normalized telemetry events ingested into the event pipeline",
    ["source", "provenance"],
)

EVENT_QUEUE_LAG = Gauge(
    "sentinel_event_queue_lag",
    "Current event bus queue backlog / lag depth",
    ["queue_name"],
)

INFERENCE_LATENCY_SECONDS = Histogram(
    "sentinel_inference_latency_seconds",
    "Supervised and anomaly detection model inference latency in seconds",
    ["model", "stage"],
    buckets=[0.0005, 0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)

WS_CONNECTIONS_ACTIVE = Gauge(
    "sentinel_ws_connections_active",
    "Number of currently open WebSocket connections by channel and role",
    ["channel", "role"],
)

ALERTS_TOTAL = Counter(
    "sentinel_alerts_total",
    "Total security alerts raised across severity levels and scenarios",
    ["severity", "scenario"],
)

HTTP_REQUESTS_TOTAL = Counter(
    "sentinel_http_requests_total",
    "Total HTTP API requests handled by endpoint and status code",
    ["method", "path", "status"],
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "sentinel_http_request_duration_seconds",
    "HTTP API request duration in seconds",
    ["method", "path"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)


def record_event_ingested(source: str, provenance: str) -> None:
    """Record an ingested telemetry or proxy event."""
    try:
        EVENTS_TOTAL.labels(source=source, provenance=provenance).inc()
    except Exception as e:
        logger.debug("Failed recording event metric: %s", e)


def record_queue_lag(queue_name: str, depth: int) -> None:
    """Update queue backlog depth gauge."""
    try:
        EVENT_QUEUE_LAG.labels(queue_name=queue_name).set(max(0, depth))
    except Exception as e:
        logger.debug("Failed recording queue lag: %s", e)


def record_inference_latency(model: str, stage: str, duration_seconds: float) -> None:
    """Observe model inference latency."""
    try:
        INFERENCE_LATENCY_SECONDS.labels(model=model, stage=stage).observe(max(0.0, duration_seconds))
    except Exception as e:
        logger.debug("Failed recording inference latency: %s", e)


def record_ws_connection(channel: str, role: str, delta: int) -> None:
    """Increment or decrement active WebSocket connections gauge."""
    try:
        if delta > 0:
            WS_CONNECTIONS_ACTIVE.labels(channel=channel, role=role).inc(delta)
        elif delta < 0:
            WS_CONNECTIONS_ACTIVE.labels(channel=channel, role=role).dec(abs(delta))
    except Exception as e:
        logger.debug("Failed recording ws connection metric: %s", e)


def record_alert_raised(severity: str, scenario: str) -> None:
    """Record a newly raised security alert."""
    try:
        ALERTS_TOTAL.labels(severity=severity, scenario=scenario).inc()
    except Exception as e:
        logger.debug("Failed recording alert metric: %s", e)


def record_http_request(method: str, path: str, status: int, duration_seconds: float) -> None:
    """Record HTTP request counter and latency."""
    try:
        HTTP_REQUESTS_TOTAL.labels(method=method, path=path, status=str(status)).inc()
        HTTP_REQUEST_DURATION_SECONDS.labels(method=method, path=path).observe(max(0.0, duration_seconds))
    except Exception as e:
        logger.debug("Failed recording http metric: %s", e)


def get_metrics_payload(registry: CollectorRegistry = REGISTRY) -> tuple[bytes, str]:
    """Generate Prometheus-formatted metrics text payload."""
    return generate_latest(registry), CONTENT_TYPE_LATEST
