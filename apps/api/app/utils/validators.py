"""
ClipForge API — URL validation helpers.

Parses video URLs from supported platforms and extracts the
platform identifier and video ID.
"""

import re
from typing import Tuple

# ---------------------------------------------------------------------------
# Platform-specific regex patterns
# ---------------------------------------------------------------------------

# Twitch VOD — e.g. https://www.twitch.tv/videos/1234567890
_TWITCH_VOD_RE = re.compile(
    r"(?:https?://)?(?:www\.)?twitch\.tv/videos/(?P<id>\d+)",
    re.IGNORECASE,
)

# YouTube video — standard, short, and embed formats
_YOUTUBE_RE = re.compile(
    r"(?:https?://)?(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)"
    r"(?P<id>[A-Za-z0-9_-]{11})",
    re.IGNORECASE,
)

# Kick VOD — e.g. https://kick.com/video/abcde12345
_KICK_VOD_RE = re.compile(
    r"(?:https?://)?(?:www\.)?kick\.com/video/(?P<id>[A-Za-z0-9_-]+)",
    re.IGNORECASE,
)

# Ordered list so we can iterate and match the first hit.
_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("twitch", _TWITCH_VOD_RE),
    ("youtube", _YOUTUBE_RE),
    ("kick", _KICK_VOD_RE),
]


def validate_video_url(url: str) -> Tuple[str, str]:
    """
    Parse *url* and return ``(platform, video_id)``.

    Supported platforms:
    - **Twitch** VODs (``twitch.tv/videos/<id>``)
    - **YouTube** videos (``youtube.com/watch?v=``, ``youtu.be/``,
      ``youtube.com/embed/``)
    - **Kick** VODs (``kick.com/video/<id>``)

    Raises
    ------
    ValueError
        If the URL does not match any known platform pattern.

    Examples
    --------
    >>> validate_video_url("https://www.twitch.tv/videos/2012345678")
    ('twitch', '2012345678')

    >>> validate_video_url("https://youtu.be/dQw4w9WgXcQ")
    ('youtube', 'dQw4w9WgXcQ')
    """
    url = url.strip()

    for platform, pattern in _PATTERNS:
        match = pattern.search(url)
        if match:
            return platform, match.group("id")

    raise ValueError(
        f"Unsupported or invalid video URL: {url!r}. "
        "Accepted platforms: Twitch VOD, YouTube video, Kick VOD."
    )
