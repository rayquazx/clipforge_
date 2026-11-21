"""
ClipForge YouTube Data API v3 Metadata Provider.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import httpx

from app.config import get_settings
from app.services.metadata.base import MetadataProvider, parse_iso8601_duration
from app.services.metadata.exceptions import (
    MetadataError,
    NotFoundError,
    PrivateVideoError,
    ProviderUnavailableError,
    RateLimitError,
)
from app.services.metadata.models import VideoMetadata


class YouTubeProvider(MetadataProvider):
    """
    Fetches video metadata using YouTube Data API v3 (videos.list endpoint).
    """

    API_URL = "https://www.googleapis.com/youtube/v3/videos"

    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.YOUTUBE_API_KEY

    async def fetch(self, external_id: str) -> VideoMetadata:
        """Fetch YouTube video metadata by 11-character video ID."""
        if not self.api_key:
            raise MetadataError(
                "YouTube Data API key is not configured. Please set YOUTUBE_API_KEY in .env."
            )

        params = {
            "part": "snippet,contentDetails",
            "id": external_id,
            "key": self.api_key,
        }

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(self.API_URL, params=params, timeout=10.0)
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                raise ProviderUnavailableError(f"Could not connect to YouTube API: {exc}")

            if resp.status_code == 404:
                raise NotFoundError()
            elif resp.status_code == 403:
                error_body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                reasons = [
                    err.get("reason", "")
                    for err in error_body.get("error", {}).get("errors", [])
                ]
                if any(r in ("quotaExceeded", "rateLimitExceeded") for r in reasons):
                    raise RateLimitError("YouTube API quota exceeded for today.")
                elif "videoNotFound" in reasons:
                    raise NotFoundError()
                raise PrivateVideoError("This YouTube video is private or geographically restricted.")
            elif resp.status_code == 429:
                raise RateLimitError()
            elif resp.status_code != 200:
                raise ProviderUnavailableError(f"YouTube API returned status {resp.status_code}: {resp.text}")

            data = resp.json()
            items = data.get("items", [])
            if not items:
                raise NotFoundError(
                    f"No video found for ID '{external_id}'. The video may be deleted, unlisted, or private."
                )

            item = items[0]
            snippet = item.get("snippet", {})
            content_details = item.get("contentDetails", {})

            title = snippet.get("title") or "Untitled YouTube Video"
            channel_name = snippet.get("channelTitle") or "Unknown Channel"

            # Parse ISO 8601 duration
            raw_duration = content_details.get("duration", "")
            duration_seconds = parse_iso8601_duration(raw_duration)

            # Pick best available thumbnail
            thumbnails = snippet.get("thumbnails", {})
            thumbnail_url = (
                thumbnails.get("maxres", {}).get("url")
                or thumbnails.get("standard", {}).get("url")
                or thumbnails.get("high", {}).get("url")
                or thumbnails.get("medium", {}).get("url")
                or thumbnails.get("default", {}).get("url")
            )

            published_at = None
            if pub_str := snippet.get("publishedAt"):
                try:
                    published_at = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
                except ValueError:
                    published_at = None

            return VideoMetadata(
                title=title,
                channel_name=channel_name,
                duration_seconds=duration_seconds,
                thumbnail_url=thumbnail_url,
                published_at=published_at,
                raw_payload=item,
            )
