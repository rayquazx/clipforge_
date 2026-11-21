"""
ClipForge Kick Video Metadata Provider.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import httpx

from app.config import get_settings
from app.services.metadata.base import MetadataProvider
from app.services.metadata.exceptions import (
    NotFoundError,
    PrivateVideoError,
    ProviderUnavailableError,
    RateLimitError,
)
from app.services.metadata.models import VideoMetadata


class KickProvider(MetadataProvider):
    """
    Fetches video/livestream replay metadata from Kick's API.
    Handles Kick API endpoints gracefully with user-agent spoofing
    and fallback for rate-limiting or schema changes.
    """

    KICK_API_V1_URL = "https://kick.com/api/v1/video"
    PUBLIC_USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ClipForge/0.1.0"
    )

    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.KICK_API_KEY

    async def fetch(self, external_id: str) -> VideoMetadata:
        """Fetch Kick VOD metadata by video UUID or numeric ID."""
        url = f"{self.KICK_API_V1_URL}/{external_id}"
        headers = {
            "User-Agent": self.PUBLIC_USER_AGENT,
            "Accept": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=headers, timeout=12.0)
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                raise ProviderUnavailableError(f"Could not connect to Kick API: {exc}")

            if resp.status_code == 404:
                raise NotFoundError(f"Kick VOD '{external_id}' was not found.")
            elif resp.status_code == 403:
                raise PrivateVideoError("This Kick video is subscriber-only or Cloudflare protected.")
            elif resp.status_code == 429:
                raise RateLimitError("Kick API rate limit exceeded.")
            elif resp.status_code != 200:
                raise ProviderUnavailableError(f"Kick API returned status {resp.status_code}: {resp.text}")

            data = resp.json()
            # Kick v1 structure
            livestream = data.get("livestream") or data
            session_title = (
                data.get("session_title")
                or livestream.get("session_title")
                or data.get("title")
                or "Untitled Kick Stream"
            )

            # Channel / streamer info
            channel_data = data.get("channel") or livestream.get("channel") or {}
            channel_name = (
                channel_data.get("username")
                or channel_data.get("slug")
                or data.get("username")
                or "Unknown Kick Streamer"
            )

            # Duration: Kick often supplies duration in milliseconds or seconds
            duration_raw = (
                data.get("duration")
                or livestream.get("duration")
                or 0
            )
            # If duration is in milliseconds (greater than 100,000 for standard VODs)
            duration_seconds = int(duration_raw // 1000) if duration_raw > 100000 else int(duration_raw)

            # Thumbnail
            thumbnail_url = (
                data.get("thumbnail", {}).get("url")
                if isinstance(data.get("thumbnail"), dict)
                else data.get("thumbnail")
                or livestream.get("thumbnail")
            )

            published_at = None
            if created_at_str := data.get("created_at") or livestream.get("created_at"):
                try:
                    published_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                except ValueError:
                    published_at = None

            return VideoMetadata(
                title=session_title,
                channel_name=channel_name,
                duration_seconds=duration_seconds,
                thumbnail_url=thumbnail_url,
                published_at=published_at,
                raw_payload=data,
            )
