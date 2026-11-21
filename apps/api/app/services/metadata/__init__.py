"""
ClipForge Metadata Providers.
"""

from app.services.metadata.base import (
    MetadataProvider,
    parse_iso8601_duration,
    parse_twitch_duration,
)
from app.services.metadata.exceptions import (
    MetadataError,
    NotFoundError,
    PrivateVideoError,
    ProviderUnavailableError,
    RateLimitError,
)
from app.services.metadata.factory import get_metadata_provider
from app.services.metadata.kick import KickProvider
from app.services.metadata.models import VideoMetadata
from app.services.metadata.twitch import TwitchProvider
from app.services.metadata.youtube import YouTubeProvider

__all__ = [
    "MetadataProvider",
    "VideoMetadata",
    "MetadataError",
    "NotFoundError",
    "PrivateVideoError",
    "RateLimitError",
    "ProviderUnavailableError",
    "TwitchProvider",
    "YouTubeProvider",
    "KickProvider",
    "get_metadata_provider",
    "parse_iso8601_duration",
    "parse_twitch_duration",
]
