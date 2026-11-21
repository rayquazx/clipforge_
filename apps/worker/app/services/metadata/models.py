"""
ClipForge Metadata Provider Models.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional


@dataclass
class VideoMetadata:
    """Standardized video metadata returned by platform providers."""

    title: str
    channel_name: str
    duration_seconds: int
    thumbnail_url: Optional[str] = None
    published_at: Optional[datetime] = None
    raw_payload: Optional[dict[str, Any]] = None
