"""
Unit tests for platform metadata providers using mock HTTP responses.
"""

import httpx
import pytest
from app.services.metadata.exceptions import (
    NotFoundError,
    PrivateVideoError,
    RateLimitError,
)
from app.services.metadata.kick import KickProvider
from app.services.metadata.twitch import TwitchProvider
from app.services.metadata.youtube import YouTubeProvider


@pytest.mark.asyncio
class TestYouTubeProvider:
    async def test_youtube_success(self, monkeypatch):
        provider = YouTubeProvider(api_key="fake-test-key")

        mock_response = httpx.Response(
            status_code=200,
            json={
                "items": [
                    {
                        "snippet": {
                            "title": "Never Gonna Give You Up",
                            "channelTitle": "Rick Astley",
                            "publishedAt": "2009-10-25T06:57:33Z",
                            "thumbnails": {
                                "high": {"url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"}
                            },
                        },
                        "contentDetails": {"duration": "PT3M33S"},
                    }
                ]
            },
            request=httpx.Request("GET", "https://www.googleapis.com"),
        )

        async def mock_get(*args, **kwargs):
            return mock_response

        monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

        meta = await provider.fetch("dQw4w9WgXcQ")
        assert meta.title == "Never Gonna Give You Up"
        assert meta.channel_name == "Rick Astley"
        assert meta.duration_seconds == 213
        assert meta.thumbnail_url == "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"

    async def test_youtube_not_found(self, monkeypatch):
        provider = YouTubeProvider(api_key="fake-test-key")

        mock_response = httpx.Response(
            status_code=200,
            json={"items": []},
            request=httpx.Request("GET", "https://www.googleapis.com"),
        )

        async def mock_get(*args, **kwargs):
            return mock_response

        monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

        with pytest.raises(NotFoundError):
            await provider.fetch("nonexistent1")

    async def test_youtube_rate_limit(self, monkeypatch):
        provider = YouTubeProvider(api_key="fake-test-key")

        mock_response = httpx.Response(
            status_code=403,
            headers={"content-type": "application/json"},
            json={"error": {"errors": [{"reason": "quotaExceeded"}]}},
            request=httpx.Request("GET", "https://www.googleapis.com"),
        )

        async def mock_get(*args, **kwargs):
            return mock_response

        monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

        with pytest.raises(RateLimitError):
            await provider.fetch("dQw4w9WgXcQ")


@pytest.mark.asyncio
class TestTwitchProvider:
    async def test_twitch_success(self, monkeypatch):
        provider = TwitchProvider(client_id="fake-id", client_secret="fake-secret")

        # Mock token fetch
        token_response = httpx.Response(
            status_code=200,
            json={"access_token": "mock-token", "expires_in": 3600},
            request=httpx.Request("POST", "https://id.twitch.tv"),
        )

        # Mock video fetch
        video_response = httpx.Response(
            status_code=200,
            json={
                "data": [
                    {
                        "id": "2135894102",
                        "title": "Epic Stream Replay",
                        "user_name": "xQc",
                        "duration": "2h15m30s",
                        "thumbnail_url": "https://static-cdn.jtvnw.net/thumb-%{width}x%{height}.jpg",
                        "created_at": "2024-05-01T12:00:00Z",
                    }
                ]
            },
            request=httpx.Request("GET", "https://api.twitch.tv"),
        )

        async def mock_post(*args, **kwargs):
            return token_response

        async def mock_get(*args, **kwargs):
            return video_response

        monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
        monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

        meta = await provider.fetch("2135894102")
        assert meta.title == "Epic Stream Replay"
        assert meta.channel_name == "xQc"
        assert meta.duration_seconds == (2 * 3600) + (15 * 60) + 30
        assert "1280x720" in (meta.thumbnail_url or "")

    async def test_twitch_not_found(self, monkeypatch):
        provider = TwitchProvider(client_id="fake-id", client_secret="fake-secret")

        token_response = httpx.Response(
            status_code=200,
            json={"access_token": "mock-token", "expires_in": 3600},
            request=httpx.Request("POST", "https://id.twitch.tv"),
        )
        empty_response = httpx.Response(
            status_code=200,
            json={"data": []},
            request=httpx.Request("GET", "https://api.twitch.tv"),
        )

        async def mock_post(*args, **kwargs):
            return token_response

        async def mock_get(*args, **kwargs):
            return empty_response

        monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
        monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

        with pytest.raises(NotFoundError):
            await provider.fetch("9999999999")


@pytest.mark.asyncio
class TestKickProvider:
    async def test_kick_success(self, monkeypatch):
        provider = KickProvider()

        mock_response = httpx.Response(
            status_code=200,
            json={
                "session_title": "Grand Theft Auto V Roleplay",
                "channel": {"username": "Trainwreckstv"},
                "duration": 7200,
                "thumbnail": {"url": "https://images.kick.com/thumb.jpg"},
                "created_at": "2024-05-02T18:00:00Z",
            },
            request=httpx.Request("GET", "https://kick.com"),
        )

        async def mock_get(*args, **kwargs):
            return mock_response

        monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

        meta = await provider.fetch("abc-123-uuid")
        assert meta.title == "Grand Theft Auto V Roleplay"
        assert meta.channel_name == "Trainwreckstv"
        assert meta.duration_seconds == 7200
        assert meta.thumbnail_url == "https://images.kick.com/thumb.jpg"

    async def test_kick_not_found(self, monkeypatch):
        provider = KickProvider()

        mock_response = httpx.Response(
            status_code=404,
            request=httpx.Request("GET", "https://kick.com"),
        )

        async def mock_get(*args, **kwargs):
            return mock_response

        monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

        with pytest.raises(NotFoundError):
            await provider.fetch("missing-id")
