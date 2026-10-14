"""Filesystem locations and intentionally conservative runtime settings."""

from __future__ import annotations

import ipaddress
import os
from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
ARTIFACT_DIR = BACKEND_DIR / "artifacts"
RUNTIME_DIR = BACKEND_DIR / "runtime"
RAW_DATA_DIR = BACKEND_DIR / "data" / "raw"
MODEL_PATH = ARTIFACT_DIR / "rf_unsw_nb15.joblib"
METADATA_PATH = ARTIFACT_DIR / "model_metadata.json"
METRICS_PATH = ARTIFACT_DIR / "evaluation.json"
DATABASE_PATH = RUNTIME_DIR / "sentinel_flow.db"
EVIDENCE_LEDGER_PATH = RUNTIME_DIR / "evidence_ledger.db"

# Default fallback secrets for local development only
DEFAULT_OPERATOR_PASSCODE = "SF-OPERATOR-2026"
DEFAULT_OPERATOR_SECRET = "sentinel-operator-hmac-key-2026"
DEFAULT_WEBHOOK_SECRET = "sentinel-lab-webhook-secret-2026"


class Settings(BaseSettings):
    """Unified application settings with pydantic-settings."""

    model_config = SettingsConfigDict(
        env_prefix="SENTINEL_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = Field(default="development", alias="SENTINEL_ENV")
    port: int = Field(default=8000, alias="PORT")
    allowed_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="SENTINEL_ALLOWED_ORIGINS",
    )
    target_url: str = Field(
        default="http://127.0.0.1:8000/lab-target",
        alias="SENTINEL_TARGET_URL",
    )
    proxy_timeout: float = Field(default=30.0, alias="SENTINEL_PROXY_TIMEOUT")
    operator_passcode: str = Field(default=DEFAULT_OPERATOR_PASSCODE, alias="SENTINEL_OPERATOR_PASSCODE")
    operator_secret: str = Field(default=DEFAULT_OPERATOR_SECRET, alias="SENTINEL_OPERATOR_SECRET")
    webhook_secret: str = Field(default=DEFAULT_WEBHOOK_SECRET, alias="SENTINEL_WEBHOOK_SECRET")
    db_url: str | None = Field(default=None, alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    max_participants: int = 60
    max_devices_per_session: int = 60
    max_alias_length: int = 32
    max_replay_events: int = 40

    @property
    def is_dev(self) -> bool:
        return self.env.strip().lower() in ("dev", "development")

    @property
    def is_production(self) -> bool:
        return self.env.strip().lower() in ("prod", "production")

    def get_cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    def get_cors_origin_regex(self) -> str | None:
        """Allow Vite dev server on any private-network IP when in development mode."""
        if self.is_dev:
            return r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$"
        return None


settings = Settings()

# Backwards compatibility constants
SENTINEL_ENV = settings.env
OPERATOR_PASSCODE = settings.operator_passcode
OPERATOR_SECRET_KEY = settings.operator_secret
WEBHOOK_SHARED_SECRET = settings.webhook_secret
ALLOWED_ORIGINS = settings.get_cors_origins()
DEFAULT_TARGET_URL = settings.target_url
PROXY_TIMEOUT_SECONDS = settings.proxy_timeout
MAX_PARTICIPANTS = settings.max_participants
MAX_DEVICES_PER_SESSION = settings.max_devices_per_session
MAX_ALIAS_LENGTH = settings.max_alias_length
MAX_REPLAY_EVENTS = settings.max_replay_events

TARGET_CONFIG_PATH = RUNTIME_DIR / "target_config.json"


def validate_safety_configuration() -> None:
    """Ensure production environments refuse default or placeholder secrets."""
    env = os.getenv("SENTINEL_ENV", settings.env).strip().lower()
    if env in ("production", "prod"):
        insecure: list[str] = []
        passcode = os.getenv("SENTINEL_OPERATOR_PASSCODE", settings.operator_passcode)
        secret = os.getenv("SENTINEL_OPERATOR_SECRET", settings.operator_secret)
        webhook = os.getenv("SENTINEL_WEBHOOK_SECRET", settings.webhook_secret)
        if passcode == DEFAULT_OPERATOR_PASSCODE:
            insecure.append("SENTINEL_OPERATOR_PASSCODE")
        if secret == DEFAULT_OPERATOR_SECRET:
            insecure.append("SENTINEL_OPERATOR_SECRET")
        if webhook == DEFAULT_WEBHOOK_SECRET:
            insecure.append("SENTINEL_WEBHOOK_SECRET")
        if insecure:
            raise RuntimeError(
                f"Production refuses startup with default secrets: {', '.join(insecure)}. "
                "Set secure environment variables in production."
            )


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
        return False


def ensure_runtime_directories() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
