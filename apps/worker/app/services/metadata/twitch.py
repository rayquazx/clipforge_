"""
ClipForge Twitch Helix Metadata Provider.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.config import get_settings
from app.services.metadata.base import MetadataProvider, parse_twitch_duration
from app.services.metadata.exceptions import (
    MetadataError,
    NotFoundError,
    PrivateVideoError,
    ProviderUnavailableError,
    RateLimitError,
)
from app.services.metadata.models import VideoMetadata


class TwitchProvider(MetadataProvider):
    """
    Fetches video metadata using Twitch Helix API and App Access Token
    (OAuth client credentials). Caches tokens until expiry.
    """

    TOKEN_URL = "https://id.twitch.tv/oauth2/token"
    HELIX_VIDEOS_URL = "https://api.twitch.tv/helix/videos"

    _cached_token: Optional[str] = None
    _token_expires_at: float = 0.0

    def __init__(self, client_id: Optional[str] = None, client_secret: Optional[str] = None):
        settings = get_settings()
        self.client_id = client_id or settings.TWITCH_CLIENT_ID
        self.client_secret = client_secret or settings.TWITCH_CLIENT_SECRET

    async def _get_app_access_token(self, client: httpx.AsyncClient) -> str:
        """Fetch or return cached OAuth app access token."""
        now = time.time()
        if self._cached_token and now < (self._token_expires_at - 60):
            return self._cached_token

        if not self.client_id or not self.client_secret:
            raise MetadataError(
                "Twitch API credentials are not configured. Please set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env."
            )

        try:
            resp = await client.post(
                self.TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "client_credentials",
                },
                timeout=10.0,
            )
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            raise ProviderUnavailableError(f"Could not reach Twitch auth server: {exc}")

        if resp.status_code == 400 or resp.status_code == 401:
            raise MetadataError("Invalid Twitch Client ID or Secret.")
        elif resp.status_code != 200:
            raise ProviderUnavailableError(f"Twitch auth failed with status {resp.status_code}.")

        data = resp.json()
        token = data.get("access_token")
        expires_in = data.get("expires_in", 3600)

        TwitchProvider._cached_token = token
        TwitchProvider._token_expires_at = now + expires_in
        return token

    async def fetch(self, external_id: str) -> VideoMetadata:
        """Fetch Twitch video metadata by video ID."""
        async with httpx.AsyncClient() as client:
            token = await self._get_app_access_token(client)

            headers = {
                "Client-Id": self.client_id or "",
                "Authorization": f"Bearer {token}",
            }

            for attempt in range(2):
                try:
                    resp = await client.get(
                        self.HELIX_VIDEOS_URL,
                        params={"id": external_id},
                        headers=headers,
                        timeout=10.0,
                    )
                except (httpx.ConnectError, httpx.TimeoutException) as exc:
                    raise ProviderUnavailableError(f"Twitch API connection failed: {exc}")

                # If token expired unexpectedly, clear cache and retry once
                if resp.status_code == 401 and attempt == 0:
                    TwitchProvider._cached_token = None
                    token = await self._get_app_access_token(client)
                    headers["Authorization"] = f"Bearer {token}"
                    continue

                break

            if resp.status_code == 404:
                raise NotFoundError()
            elif resp.status_code == 429:
                raise RateLimitError()
            elif resp.status_code == 403:
                raise PrivateVideoError()
            elif resp.status_code != 200:
                raise ProviderUnavailableError(f"Twitch API returned {resp.status_code}: {resp.text}")

            data = resp.json()
            items = data.get("data", [])
            if not items:
                raise NotFoundError("Twitch VOD was not found. It may be expired or deleted.")

            video = items[0]
            title = video.get("title") or "Untitled Twitch VOD"
            channel_name = video.get("user_name") or video.get("user_login") or "Unknown Streamer"
            duration_str = video.get("duration") or "0s"
            duration_seconds = parse_twitch_duration(duration_str)

            # Format thumbnail URL (Twitch returns URL with %{width}x%{height} template)
            raw_thumb = video.get("thumbnail_url", "")
            thumbnail_url = (
                raw_thumb.replace("%{width}", "1280").replace("%{height}", "720")
                if raw_thumb
                else None
            )

            published_at = None
            if created_str := video.get("created_at"):
                try:
                    published_at = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                except ValueError:
                    published_at = None

            return VideoMetadata(
                title=title,
                channel_name=channel_name,
                duration_seconds=duration_seconds,
                thumbnail_url=thumbnail_url,
                published_at=published_at,
                raw_payload=video,
            )
