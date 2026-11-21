"""
ClipForge API — centralised configuration via environment variables.

Uses ``pydantic-settings`` to parse a ``.env`` file and expose a
singleton ``Settings`` instance through :func:`get_settings`.
"""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings populated from environment variables or a
    ``.env`` file located next to this module's package root.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- Application -------------------------------------------------------
    APP_ENV: str = "development"
    DEBUG: bool = True
    MAX_UPLOAD_SIZE_MB: int = 500

    # ---- Database ----------------------------------------------------------
    DATABASE_URL: str = "postgresql+asyncpg://clipforge:clipforge@localhost:5432/clipforge"

    # ---- Redis / Celery ----------------------------------------------------
    REDIS_URL: str = "redis://localhost:6379/0"

    # ---- MinIO (S3-compatible storage) -------------------------------------
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "clipforge"
    MINIO_USE_SSL: bool = False

    # ---- JWT ---------------------------------------------------------------
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ---- Third-party platform credentials ----------------------------------
    TWITCH_CLIENT_ID: Optional[str] = None
    TWITCH_CLIENT_SECRET: Optional[str] = None
    YOUTUBE_API_KEY: Optional[str] = None
    KICK_API_KEY: Optional[str] = None

    # ---- Phase 4 Editing & Rendering ---------------------------------------
    MAX_CLIP_SECONDS: float = 60.0
    PREVIEW_PADDING_SEC: float = 5.0
    EXPORT_RESOLUTIONS: list[str] = ["original", "1080p", "720p"]
    SOURCE_MEDIA_RETENTION_DAYS: int = 7
    MAX_SOURCE_RESOLUTION: str = "1080p"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached singleton ``Settings`` instance."""
    return Settings()
