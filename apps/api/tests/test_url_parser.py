"""
Unit tests for the ClipForge URL Parser Service.
"""

import pytest
from app.services.url_parser import InvalidUrlError, normalize_url, parse_video_url


class TestNormalizeUrl:
    def test_strip_tracking_params(self):
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=12345&feature=shared&t=30"
        normalized = normalize_url(url)
        assert "si=" not in normalized
        assert "feature=" not in normalized
        assert "t=" not in normalized
        assert "v=dQw4w9WgXcQ" in normalized
        assert "www." not in normalized

    def test_add_https_scheme(self):
        url = "youtube.com/watch?v=dQw4w9WgXcQ"
        normalized = normalize_url(url)
        assert normalized.startswith("https://")

    def test_strip_trailing_slash(self):
        url = "https://twitch.tv/videos/123456789/"
        normalized = normalize_url(url)
        assert not normalized.endswith("/")

    def test_empty_url_raises(self):
        with pytest.raises(InvalidUrlError):
            normalize_url("   ")


class TestParseVideoUrl:
    # --- Twitch ---
    def test_valid_twitch_vod(self):
        url = "https://www.twitch.tv/videos/2135894102"
        res = parse_video_url(url)
        assert res.platform == "twitch"
        assert res.external_id == "2135894102"
        assert res.canonical_url == "https://twitch.tv/videos/2135894102"

    def test_reject_twitch_clip(self):
        url = "https://clips.twitch.tv/SpookyFunnyGhost"
        with pytest.raises(InvalidUrlError) as exc_info:
            parse_video_url(url)
        assert "clips are not supported" in str(exc_info.value).lower()

    def test_reject_twitch_clip_subpath(self):
        url = "https://www.twitch.tv/streamer/clip/SpookyFunnyGhost"
        with pytest.raises(InvalidUrlError) as exc_info:
            parse_video_url(url)
        assert "clips are not supported" in str(exc_info.value).lower()

    def test_reject_twitch_live_channel(self):
        url = "https://twitch.tv/shroud"
        with pytest.raises(InvalidUrlError) as exc_info:
            parse_video_url(url)
        assert "live stream channels (shroud) cannot be processed directly" in str(exc_info.value).lower()

    # --- YouTube ---
    def test_valid_youtube_watch(self):
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        res = parse_video_url(url)
        assert res.platform == "youtube"
        assert res.external_id == "dQw4w9WgXcQ"
        assert res.canonical_url == "https://youtube.com/watch?v=dQw4w9WgXcQ"

    def test_valid_youtube_short_link(self):
        url = "https://youtu.be/dQw4w9WgXcQ"
        res = parse_video_url(url)
        assert res.platform == "youtube"
        assert res.external_id == "dQw4w9WgXcQ"

    def test_valid_youtube_live(self):
        url = "https://youtube.com/live/dQw4w9WgXcQ"
        res = parse_video_url(url)
        assert res.platform == "youtube"
        assert res.external_id == "dQw4w9WgXcQ"

    def test_valid_youtube_shorts(self):
        url = "https://www.youtube.com/shorts/dQw4w9WgXcQ"
        res = parse_video_url(url)
        assert res.platform == "youtube"
        assert res.external_id == "dQw4w9WgXcQ"

    def test_invalid_youtube_id(self):
        url = "https://youtube.com/watch?v=too_short"
        with pytest.raises(InvalidUrlError):
            parse_video_url(url)

    # --- Kick ---
    def test_valid_kick_vod(self):
        url = "https://kick.com/xqc/videos/6f3b4382-7f30-4e4b-91d4-c941e737c35d"
        res = parse_video_url(url)
        assert res.platform == "kick"
        assert res.external_id == "6f3b4382-7f30-4e4b-91d4-c941e737c35d"
        assert res.canonical_url == "https://kick.com/video/6f3b4382-7f30-4e4b-91d4-c941e737c35d"

    def test_valid_kick_direct_video(self):
        url = "https://kick.com/video/6f3b4382-7f30-4e4b-91d4-c941e737c35d"
        res = parse_video_url(url)
        assert res.platform == "kick"
        assert res.external_id == "6f3b4382-7f30-4e4b-91d4-c941e737c35d"

    def test_reject_kick_live_channel(self):
        url = "https://kick.com/xqc"
        with pytest.raises(InvalidUrlError) as exc_info:
            parse_video_url(url)
        assert "kick live channels (xqc) are not supported" in str(exc_info.value).lower()

    # --- Unsupported platform ---
    def test_unsupported_platform(self):
        url = "https://vimeo.com/12345678"
        with pytest.raises(InvalidUrlError) as exc_info:
            parse_video_url(url)
        assert "unsupported platform 'vimeo.com'" in str(exc_info.value).lower()
