"""Filesystem locations and intentionally conservative runtime settings."""

from __future__ import annotations

import ipaddress
import os
from pathlib import Path
from urllib.parse import urlparse

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
ARTIFACT_DIR = BACKEND_DIR / "artifacts"
RUNTIME_DIR = BACKEND_DIR / "runtime"
RAW_DATA_DIR = BACKEND_DIR / "data" / "raw"
MODEL_PATH = ARTIFACT_DIR / "rf_unsw_nb15.joblib"
METADATA_PATH = ARTIFACT_DIR / "model_metadata.json"
METRICS_PATH = ARTIFACT_DIR / "evaluation.json"
DATABASE_PATH = RUNTIME_DIR / "sentinel_flow.db"

# The browser may only talk to this local demonstration API by default.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "SENTINEL_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]

# These caps make the classroom simulation intentionally bounded.
MAX_PARTICIPANTS = 60
MAX_DEVICES_PER_SESSION = 60
MAX_ALIAS_LENGTH = 32
MAX_REPLAY_EVENTS = 40

# Default fallback secrets for local development only
DEFAULT_OPERATOR_PASSCODE = "SF-OPERATOR-2026"
DEFAULT_OPERATOR_SECRET = "sentinel-operator-hmac-key-2026"
DEFAULT_WEBHOOK_SECRET = "sentinel-lab-webhook-secret-2026"

SENTINEL_ENV = os.getenv("SENTINEL_ENV", "development").strip().lower()
OPERATOR_PASSCODE = os.getenv("SENTINEL_OPERATOR_PASSCODE", DEFAULT_OPERATOR_PASSCODE)
OPERATOR_SECRET_KEY = os.getenv("SENTINEL_OPERATOR_SECRET", DEFAULT_OPERATOR_SECRET)
WEBHOOK_SHARED_SECRET = os.getenv("SENTINEL_WEBHOOK_SECRET", DEFAULT_WEBHOOK_SECRET)


def validate_safety_configuration() -> None:
    """Ensure production environments refuse default or placeholder secrets."""
    env = os.getenv("SENTINEL_ENV", "development").strip().lower()
    if env in ("production", "prod"):
        insecure: list[str] = []
        if os.getenv("SENTINEL_OPERATOR_PASSCODE", DEFAULT_OPERATOR_PASSCODE) == DEFAULT_OPERATOR_PASSCODE:
            insecure.append("SENTINEL_OPERATOR_PASSCODE")
        if os.getenv("SENTINEL_OPERATOR_SECRET", DEFAULT_OPERATOR_SECRET) == DEFAULT_OPERATOR_SECRET:
            insecure.append("SENTINEL_OPERATOR_SECRET")
        if os.getenv("SENTINEL_WEBHOOK_SECRET", DEFAULT_WEBHOOK_SECRET) == DEFAULT_WEBHOOK_SECRET:
            insecure.append("SENTINEL_WEBHOOK_SECRET")
        if insecure:
            raise RuntimeError(
                f"Production refuses startup with default secrets: {', '.join(insecure)}. "
                "Set secure environment variables in production."
            )


# === SAFETY: Target Host Allowlist & Reverse Proxy ===
TARGET_CONFIG_PATH = RUNTIME_DIR / "target_config.json"
# Default to built-in disposable lab target - NEVER external hosts
DEFAULT_TARGET_URL = os.getenv("SENTINEL_TARGET_URL", "http://127.0.0.1:8000/lab-target")
PROXY_TIMEOUT_SECONDS = float(os.getenv("SENTINEL_PROXY_TIMEOUT", "30.0"))


def is_private_or_loopback_host(host: str) -> bool:
    """Return True only if host is loopback or an RFC1918 private network address."""
    clean_host = host.strip().lower()
    if clean_host.startswith("[") and "]" in clean_host:
        clean_host = clean_host[1:clean_host.index("]")]
    elif ":" in clean_host and clean_host.count(":") == 1:
        clean_host = clean_host.split(":")[0]

    if clean_host in ("localhost", "127.0.0.1", "::1", "testserver", "testclient"):
        return True
    try:
        ip = ipaddress.ip_address(clean_host)
        return ip.is_loopback or ip.is_private
    except ValueError:
        # Not a raw IP. Public domain names (like *.vercel.app) are strictly disallowed.
        return False


def ensure_runtime_directories() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
