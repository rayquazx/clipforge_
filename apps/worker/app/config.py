"""
ClipForge Worker — centralised configuration.

All settings are loaded from environment variables with sensible defaults.
The ``scoring_config`` dict is populated from ``scoring_config.yaml`` at
import time so that every task module can access it cheaply.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional

import yaml
from pydantic_settings import BaseSettings, SettingsConfigDict


# ---------------------------------------------------------------------------
# Pydantic-settings model
# ---------------------------------------------------------------------------
class WorkerSettings(BaseSettings):
    """Environment-driven configuration for the Celery worker."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Redis / Celery --------------------------------------------------------
    redis_url: str = "redis://localhost:6379/0"

    # PostgreSQL (async) ----------------------------------------------------
    database_url: str = "postgresql+asyncpg://clipforge:clipforge@localhost:5432/clipforge"

    # MinIO / S3 ------------------------------------------------------------
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "clipforge"
    minio_use_ssl: bool = False

    # Third-party platform credentials --------------------------------------
    twitch_client_id: Optional[str] = None
    twitch_client_secret: Optional[str] = None
    youtube_api_key: Optional[str] = None
    kick_api_key: Optional[str] = None


# Singleton instance — import ``settings`` wherever needed.
settings = WorkerSettings()


def get_settings() -> WorkerSettings:
    """Return the global worker settings singleton."""
    return settings


# ---------------------------------------------------------------------------
# Scoring configuration (loaded from YAML)
# ---------------------------------------------------------------------------
_SCORING_CONFIG_PATH = Path(__file__).resolve().parent.parent / "scoring_config.yaml"


def _load_scoring_config() -> Dict[str, Any]:
    """Read and parse ``scoring_config.yaml`` from the project root."""
    if not _SCORING_CONFIG_PATH.exists():
        return {}
    with open(_SCORING_CONFIG_PATH, "r", encoding="utf-8") as fh:
        data: Dict[str, Any] = yaml.safe_load(fh) or {}
    return data


scoring_config: Dict[str, Any] = _load_scoring_config()
