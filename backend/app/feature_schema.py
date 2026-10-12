"""Shared, intentionally small feature schema for the classroom prototype.

The first five values are direct quantities that a controlled HTTP endpoint can
observe. `rate`, `sload`, and `dload` are derived from the same bounded local
observation window. They are *application-flow proxies*, not packet capture.
"""

from __future__ import annotations

from typing import Final

FLOW_FEATURES: Final[list[str]] = [
    "dur",
    "spkts",
    "dpkts",
    "sbytes",
    "dbytes",
    "rate",
    "sload",
    "dload",
]

FEATURE_DETAILS: Final[dict[str, dict[str, str]]] = {
    "dur": {
        "label": "Observation duration",
        "unit": "seconds",
        "live_proxy": "Time from the first to last local demo request",
    },
    "spkts": {
        "label": "Inbound event count",
        "unit": "events",
        "live_proxy": "Requests received by the owned demo API",
    },
    "dpkts": {
        "label": "Outbound event count",
        "unit": "events",
        "live_proxy": "Responses issued by the owned demo API",
    },
    "sbytes": {
        "label": "Inbound bytes",
        "unit": "bytes",
        "live_proxy": "Aggregate request Content-Length values only",
    },
    "dbytes": {
        "label": "Outbound bytes",
        "unit": "bytes",
        "live_proxy": "Aggregate fixed response sizes only",
    },
    "rate": {
        "label": "Flow event rate",
        "unit": "events/s",
        "live_proxy": "(received requests + issued responses) / duration",
    },
    "sload": {
        "label": "Inbound bit rate",
        "unit": "bits/s",
        "live_proxy": "8 × aggregate inbound bytes / duration",
    },
    "dload": {
        "label": "Outbound bit rate",
        "unit": "bits/s",
        "live_proxy": "8 × aggregate outbound bytes / duration",
    },
}

DATASET_NAME: Final[str] = "UNSW-NB15"
DATASET_URL: Final[str] = "https://research.unsw.edu.au/projects/unsw-nb15-dataset"


def validate_feature_mapping(values: dict[str, float | int]) -> dict[str, float]:
    """Return a numeric feature dictionary or raise a useful validation error."""
    missing = [name for name in FLOW_FEATURES if name not in values]
    if missing:
        raise ValueError(f"Missing required flow features: {', '.join(missing)}")

    result: dict[str, float] = {}
    for name in FLOW_FEATURES:
        value = float(values[name])
        if value < 0:
            raise ValueError(f"{name} cannot be negative")
        result[name] = value
    return result
