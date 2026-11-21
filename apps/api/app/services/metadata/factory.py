"""
ClipForge Metadata Provider Factory.
"""

from __future__ import annotations

from app.services.metadata.base import MetadataProvider
from app.services.metadata.exceptions import MetadataError
from app.services.metadata.kick import KickProvider
from app.services.metadata.twitch import TwitchProvider
from app.services.metadata.youtube import YouTubeProvider


def get_metadata_provider(source_type: str) -> MetadataProvider:
    """Return the appropriate metadata provider for the given platform."""
    st = source_type.lower()
    if st == "twitch":
        return TwitchProvider()
    elif st == "youtube":
        return YouTubeProvider()
    elif st == "kick":
        return KickProvider()
    else:
        raise MetadataError(f"No metadata provider available for platform '{source_type}'.")
