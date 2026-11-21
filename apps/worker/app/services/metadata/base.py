"""
ClipForge Metadata Provider Base Interface & Duration Parsers.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from typing import Optional

from app.services.metadata.models import VideoMetadata


def parse_iso8601_duration(duration_str: str) -> int:
    """
    Parse an ISO 8601 duration string (used by YouTube, e.g. 'PT1H2M10S', 'PT45M', 'PT30S')
    into total duration in seconds.

    Supports hours, minutes, and seconds, including fractions.
    """
    if not duration_str or not duration_str.startswith("P"):
        return 0

    # Pattern for PT#H#M#S, P#DT#H#M#S
    pattern = re.compile(
        r"^P(?:(?P<days>\d+)D)?"
        r"(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+(?:\.\d+)?)S)?)?$"
    )
    match = pattern.match(duration_str)
    if not match:
        return 0

    parts = match.groupdict()
    days = int(parts.get("days") or 0)
    hours = int(parts.get("hours") or 0)
    minutes = int(parts.get("minutes") or 0)
    seconds = float(parts.get("seconds") or 0)

    total = (days * 86400) + (hours * 3600) + (minutes * 60) + int(seconds)
    return max(0, total)


def parse_twitch_duration(duration_str: str) -> int:
    """
    Parse Twitch video duration string format (e.g. '3h24m10s', '45m12s', '30s', '1h30m').
    """
    if not duration_str:
        return 0

    hours = 0
    minutes = 0
    seconds = 0

    h_match = re.search(r"(\d+)h", duration_str)
    if h_match:
        hours = int(h_match.group(1))

    m_match = re.search(r"(\d+)m", duration_str)
    if m_match:
        minutes = int(m_match.group(1))

    s_match = re.search(r"(\d+)s", duration_str)
    if s_match:
        seconds = int(s_match.group(1))

    return (hours * 3600) + (minutes * 60) + seconds


class MetadataProvider(ABC):
    """Abstract base class for platform video metadata providers."""

    @abstractmethod
    async def fetch(self, external_id: str) -> VideoMetadata:
        """
        Fetch normalized video metadata for the given platform video ID.

        Raises:
            NotFoundError: When video does not exist.
            PrivateVideoError: When video is inaccessible.
            RateLimitError: When platform rate limit is exceeded.
            ProviderUnavailableError: When external platform is unreachable.
        """
        pass
