"""Filesystem locations and intentionally conservative runtime settings."""

from __future__ import annotations

import os
from pathlib import Path

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

# Operator passcode for instructor role gate
OPERATOR_PASSCODE = os.getenv("SENTINEL_OPERATOR_PASSCODE", "SF-OPERATOR-2026")

# === SAFETY: Target Host Allowlist & Reverse Proxy ===
TARGET_CONFIG_PATH = RUNTIME_DIR / "target_config.json"
DEFAULT_TARGET_URL = os.getenv("SENTINEL_TARGET_URL", "https://kee-crochet-shop.vercel.app")
PROXY_TIMEOUT_SECONDS = float(os.getenv("SENTINEL_PROXY_TIMEOUT", "30.0"))


def ensure_runtime_directories() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

