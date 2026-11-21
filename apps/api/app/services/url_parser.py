"""
ClipForge URL Parser Service.

Parses, validates, and normalises video links from Twitch, YouTube, and Kick.
Extracts platform identification and canonical external IDs.
"""

from __future__ import annotations

import re
from typing import NamedTuple
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse


class ParsedUrlResult(NamedTuple):
    platform: str
    external_id: str
    canonical_url: str


class InvalidUrlError(ValueError):
    """Raised when an unsupported or malformed video URL is submitted."""
    pass


# ---------------------------------------------------------------------------
# Tracking query parameters to strip
# ---------------------------------------------------------------------------
TRACKING_PARAMS = {
    "si",
    "feature",
    "t",
    "time_continue",
    "ab_channel",
    "fbclid",
    "igshid",
    "ref",
    "source",
}


def normalize_url(url: str) -> str:
    """
    Normalise a URL by stripping tracking parameters, 'www.', and trailing slashes.
    Ensures an https:// scheme is present.
    """
    clean_url = url.strip()
    if not clean_url:
        raise InvalidUrlError("URL cannot be empty.")

    if not clean_url.startswith(("http://", "https://")):
        clean_url = "https://" + clean_url

    parsed = urlparse(clean_url)
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]

    # Strip tracking parameters from query string
    query_dict = parse_qs(parsed.query, keep_blank_values=False)
    filtered_query: dict[str, list[str]] = {}
    for k, v in query_dict.items():
        k_lower = k.lower()
        if k_lower not in TRACKING_PARAMS and not k_lower.startswith("utm_"):
            filtered_query[k] = v

    new_query = urlencode(filtered_query, doseq=True)
    new_path = parsed.path.rstrip("/")

    return urlunparse((
        "https",
        netloc,
        new_path,
        "",
        new_query,
        "",  # strip fragment
    ))


def parse_video_url(raw_url: str) -> ParsedUrlResult:
    """
    Validate and extract platform and external ID from a video URL.

    Supported platforms:
    - Twitch VODs: twitch.tv/videos/<id>
    - YouTube: youtube.com/watch?v=<id>, youtu.be/<id>, youtube.com/live/<id>, youtube.com/shorts/<id>
    - Kick VODs: kick.com/<channel>/videos/<uuid>, kick.com/video/<uuid>

    Raises:
        InvalidUrlError: When the URL is invalid or from an unsupported source.
    """
    clean_url = normalize_url(raw_url)
    parsed = urlparse(clean_url)
    hostname = parsed.netloc.lower()
    path = parsed.path

    # =========================================================================
    # 1. Twitch
    # =========================================================================
    if hostname in ("twitch.tv", "m.twitch.tv", "clips.twitch.tv"):
        # Check for clips first to give a friendly rejection
        if hostname == "clips.twitch.tv" or "/clip/" in path:
            raise InvalidUrlError(
                "Twitch clips are not supported yet. Please provide a full VOD link (e.g. https://twitch.tv/videos/123456789)."
            )

        vod_match = re.search(r"^/videos/(\d+)", path)
        if vod_match:
            video_id = vod_match.group(1)
            canonical = f"https://twitch.tv/videos/{video_id}"
            return ParsedUrlResult(
                platform="twitch",
                external_id=video_id,
                canonical_url=canonical,
            )

        # Check for channel / livestream URL
        channel_match = re.search(r"^/([a-zA-Z0-9_]{3,25})$", path)
        if channel_match:
            channel_name = channel_match.group(1)
            if channel_name.lower() not in ("directory", "downloads", "p", "search"):
                raise InvalidUrlError(
                    f"Live stream channels ({channel_name}) cannot be processed directly. "
                    "Please provide a past broadcast / VOD link from this channel (e.g. https://twitch.tv/videos/123456789)."
                )

        raise InvalidUrlError(
            "Unsupported Twitch link. Please provide a VOD link in the format: https://twitch.tv/videos/<id>"
        )

    # =========================================================================
    # 2. YouTube
    # =========================================================================
    if hostname in ("youtube.com", "m.youtube.com", "youtu.be"):
        # youtu.be/<id>
        if hostname == "youtu.be":
            short_id = path.lstrip("/")
            if re.match(r"^[a-zA-Z0-9_-]{11}$", short_id):
                canonical = f"https://youtube.com/watch?v={short_id}"
                return ParsedUrlResult(
                    platform="youtube",
                    external_id=short_id,
                    canonical_url=canonical,
                )
            raise InvalidUrlError(
                "Invalid youtu.be link. Video ID must be 11 characters."
            )

        # youtube.com/watch?v=<id>
        if path == "/watch":
            qs = parse_qs(parsed.query)
            video_ids = qs.get("v")
            if video_ids and len(video_ids[0]) == 11 and re.match(r"^[a-zA-Z0-9_-]{11}$", video_ids[0]):
                video_id = video_ids[0]
                canonical = f"https://youtube.com/watch?v={video_id}"
                return ParsedUrlResult(
                    platform="youtube",
                    external_id=video_id,
                    canonical_url=canonical,
                )
            raise InvalidUrlError("Missing or invalid 'v' parameter in YouTube watch URL.")

        # youtube.com/live/<id>, youtube.com/shorts/<id>, youtube.com/embed/<id>
        alt_match = re.search(r"^/(?:live|shorts|embed)/([a-zA-Z0-9_-]{11})", path)
        if alt_match:
            video_id = alt_match.group(1)
            canonical = f"https://youtube.com/watch?v={video_id}"
            return ParsedUrlResult(
                platform="youtube",
                external_id=video_id,
                canonical_url=canonical,
            )

        raise InvalidUrlError(
            "Unsupported YouTube URL format. Supported formats: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/..., youtube.com/live/..."
        )

    # =========================================================================
    # 3. Kick
    # =========================================================================
    if hostname == "kick.com":
        # kick.com/<channel>/videos/<uuid_or_id>
        kick_vod = re.search(r"^/[a-zA-Z0-9_]+/videos/([a-f0-9-]{8,40}|\d+)", path)
        if kick_vod:
            video_id = kick_vod.group(1)
            canonical = f"https://kick.com/video/{video_id}"
            return ParsedUrlResult(
                platform="kick",
                external_id=video_id,
                canonical_url=canonical,
            )

        # kick.com/video/<uuid_or_id>
        kick_direct = re.search(r"^/video/([a-f0-9-]{8,40}|\d+)", path)
        if kick_direct:
            video_id = kick_direct.group(1)
            canonical = f"https://kick.com/video/{video_id}"
            return ParsedUrlResult(
                platform="kick",
                external_id=video_id,
                canonical_url=canonical,
            )

        # kick.com/<channel>?video=<uuid>
        qs = parse_qs(parsed.query)
        if "video" in qs and qs["video"]:
            video_id = qs["video"][0]
            canonical = f"https://kick.com/video/{video_id}"
            return ParsedUrlResult(
                platform="kick",
                external_id=video_id,
                canonical_url=canonical,
            )

        # Channel URL without video ID
        channel_match = re.search(r"^/([a-zA-Z0-9_]{3,30})$", path)
        if channel_match:
            channel_name = channel_match.group(1)
            raise InvalidUrlError(
                f"Kick live channels ({channel_name}) are not supported. "
                "Please provide a Kick VOD link (e.g. https://kick.com/channel/videos/<id>)."
            )

        raise InvalidUrlError(
            "Unsupported Kick URL. Please provide a VOD link (e.g. https://kick.com/<channel>/videos/<id>)."
        )

    raise InvalidUrlError(
        f"Unsupported platform '{hostname}'. Supported platforms are Twitch, YouTube, and Kick."
    )
