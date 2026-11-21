"""
ClipForge Metadata Provider Exceptions.
"""

from __future__ import annotations


class MetadataError(Exception):
    """Base exception for metadata provider errors with human-friendly message."""

    def __init__(self, user_message: str, details: str | None = None):
        super().__init__(user_message)
        self.user_message = user_message
        self.details = details


class NotFoundError(MetadataError):
    """Video not found or deleted on the source platform."""

    def __init__(self, details: str | None = None):
        super().__init__(
            user_message="The video could not be found. It may have been deleted or the ID is incorrect.",
            details=details,
        )


class PrivateVideoError(MetadataError):
    """Video is private, hidden, or requires authentication/subscriber access."""

    def __init__(self, details: str | None = None):
        super().__init__(
            user_message="This video is private, restricted, or requires login credentials to view.",
            details=details,
        )


class RateLimitError(MetadataError):
    """Platform API rate limit was hit."""

    def __init__(self, details: str | None = None):
        super().__init__(
            user_message="The platform API is currently rate-limited. Please retry in a few moments.",
            details=details,
        )


class ProviderUnavailableError(MetadataError):
    """Network failure or platform service outage."""

    def __init__(self, details: str | None = None):
        super().__init__(
            user_message="Could not connect to the platform API. The service may be temporarily down.",
            details=details,
        )
