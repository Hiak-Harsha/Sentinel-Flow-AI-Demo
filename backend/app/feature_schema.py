"""Shared, intentionally small feature schema for the classroom prototype.

The first five values are direct quantities that a controlled HTTP endpoint can
observe. `rate`, `sload`, and `dload` are derived from the same bounded local
observation window. They are *application-flow proxies*, not packet capture.
"""

from __future__ import annotations

from typing import Any, Final

FEATURE_SCHEMA_VERSION: Final[str] = "2.0.0"

# Live Observable Streaming Features (Schema v2.0.0)
# These represent genuine, real-time observable quantities computed incrementally
# over sliding temporal windows by FeaturePipeline on NormalizedEvent streams.
LIVE_FEATURE_NAMES: Final[list[str]] = [
    "request_rate_5s",
    "request_rate_30s",
    "request_rate_5m",
    "byte_volume_in_5s",
    "byte_volume_out_5s",
    "byte_volume_in_30s",
    "byte_volume_out_30s",
    "endpoint_entropy_30s",
    "endpoint_entropy_5m",
    "error_ratio_30s",
    "error_ratio_5m",
    "inter_request_interval_mean_30s",
    "inter_request_interval_std_30s",
    "inter_request_interval_cv_30s",
    "fano_factor_30s",
    "auth_failures_30s",
    "distinct_ports_10s",
    "canary_hits_30s",
    "p95_latency_30s",
    "target_error_ratio_30s",
    "fingerprint_churn_5m",
    "account_churn_5m",
    "cohort_size_5m",
    "request_count_5s",
    "request_count_30s",
    "request_count_5m",
    "unique_path_count_30s",
    "status_2xx_count_30s",
    "status_3xx_count_30s",
    "status_4xx_count_30s",
    "status_5xx_count_30s",
    "method_get_ratio_30s",
    "method_post_ratio_30s",
    "cross_identity_concurrent_paths_30s",
    "cross_identity_credential_reuse_count_30s",
]

LIVE_FEATURE_METADATA: Final[dict[str, dict[str, str]]] = {
    "request_rate_5s": {"label": "Instantaneous Request Rate", "unit": "req/s", "category": "rate"},
    "request_rate_30s": {"label": "30s Rolling Request Rate", "unit": "req/s", "category": "rate"},
    "request_rate_5m": {"label": "5m Baseline Request Rate", "unit": "req/s", "category": "rate"},
    "byte_volume_in_5s": {"label": "5s Inbound Byte Volume", "unit": "bytes", "category": "volume"},
    "byte_volume_out_5s": {"label": "5s Outbound Byte Volume", "unit": "bytes", "category": "volume"},
    "byte_volume_in_30s": {"label": "30s Inbound Byte Volume", "unit": "bytes", "category": "volume"},
    "byte_volume_out_30s": {"label": "30s Outbound Byte Volume", "unit": "bytes", "category": "volume"},
    "endpoint_entropy_30s": {"label": "30s Path Shannon Entropy", "unit": "nats", "category": "entropy"},
    "endpoint_entropy_5m": {"label": "5m Path Shannon Entropy", "unit": "nats", "category": "entropy"},
    "error_ratio_30s": {"label": "30s HTTP Error Ratio", "unit": "ratio", "category": "error"},
    "error_ratio_5m": {"label": "5m HTTP Error Ratio", "unit": "ratio", "category": "error"},
    "inter_request_interval_mean_30s": {"label": "30s Mean Inter-Arrival Time", "unit": "ms", "category": "timing"},
    "inter_request_interval_std_30s": {"label": "30s Interval Std Dev", "unit": "ms", "category": "timing"},
    "inter_request_interval_cv_30s": {"label": "30s Interval Coeff of Variation", "unit": "ratio", "category": "timing"},
    "fano_factor_30s": {"label": "30s Event Dispersion (Fano Factor)", "unit": "ratio", "category": "timing"},
    "auth_failures_30s": {"label": "30s 401/403 Authentication Failures", "unit": "count", "category": "security"},
    "distinct_ports_10s": {"label": "10s Distinct Target Ports", "unit": "count", "category": "security"},
    "canary_hits_30s": {"label": "30s Honeypot / Canary Hits", "unit": "count", "category": "security"},
    "p95_latency_30s": {"label": "30s 95th Percentile Latency", "unit": "ms", "category": "timing"},
    "target_error_ratio_30s": {"label": "30s Upstream 5xx Error Ratio", "unit": "ratio", "category": "error"},
    "fingerprint_churn_5m": {"label": "5m Client Fingerprint Churn", "unit": "count", "category": "churn"},
    "account_churn_5m": {"label": "5m Account Principal Churn", "unit": "count", "category": "churn"},
    "cohort_size_5m": {"label": "5m Monitored Cohort Size", "unit": "count", "category": "churn"},
    "request_count_5s": {"label": "5s Event Count", "unit": "events", "category": "volume"},
    "request_count_30s": {"label": "30s Event Count", "unit": "events", "category": "volume"},
    "request_count_5m": {"label": "5m Event Count", "unit": "events", "category": "volume"},
    "unique_path_count_30s": {"label": "30s Unique URL Paths", "unit": "count", "category": "entropy"},
    "status_2xx_count_30s": {"label": "30s 2xx Success Count", "unit": "count", "category": "protocol"},
    "status_3xx_count_30s": {"label": "30s 3xx Redirect Count", "unit": "count", "category": "protocol"},
    "status_4xx_count_30s": {"label": "30s 4xx Client Error Count", "unit": "count", "category": "protocol"},
    "status_5xx_count_30s": {"label": "30s 5xx Server Error Count", "unit": "count", "category": "protocol"},
    "method_get_ratio_30s": {"label": "30s HTTP GET Ratio", "unit": "ratio", "category": "protocol"},
    "method_post_ratio_30s": {"label": "30s HTTP POST Ratio", "unit": "ratio", "category": "protocol"},
    "cross_identity_concurrent_paths_30s": {"label": "30s Concurrent Path Collision Count", "unit": "count", "category": "cross_identity"},
    "cross_identity_credential_reuse_count_30s": {"label": "30s Cross-Identity Credential Reuse", "unit": "count", "category": "cross_identity"},
}

# Legacy UNSW-NB15 Flow Feature Reference (Preserved for academic flow model)
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
    "dur": {"label": "Observation duration", "unit": "seconds"},
    "spkts": {"label": "Inbound event count", "unit": "events"},
    "dpkts": {"label": "Outbound event count", "unit": "events"},
    "sbytes": {"label": "Inbound bytes", "unit": "bytes"},
    "dbytes": {"label": "Outbound bytes", "unit": "bytes"},
    "rate": {"label": "Flow event rate", "unit": "events/s"},
    "sload": {"label": "Inbound bit rate", "unit": "bits/s"},
    "dload": {"label": "Outbound bit rate", "unit": "bits/s"},
}

DATASET_NAME: Final[str] = "Sentinel-Live-Lab-v2"
LEGACY_DATASET_NAME: Final[str] = "UNSW-NB15"
DATASET_URL: Final[str] = "https://research.unsw.edu.au/projects/unsw-nb15-dataset"


def extract_live_feature_vector(vec_dict: dict[str, Any]) -> dict[str, float]:
    """Extract numeric vector matching LIVE_FEATURE_NAMES from IdentityFeatureVector dict."""
    result: dict[str, float] = {}
    for name in LIVE_FEATURE_NAMES:
        val = vec_dict.get(name, 0.0)
        try:
            result[name] = float(val) if val is not None else 0.0
        except (ValueError, TypeError):
            result[name] = 0.0
    return result


def validate_feature_mapping(values: dict[str, float | int]) -> dict[str, float]:
    """Return a numeric feature dictionary or raise a useful validation error."""
    # Check if this is a live feature mapping or legacy flow mapping
    if any(k in values for k in LIVE_FEATURE_NAMES):
        return extract_live_feature_vector(values)

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

