"""
ClipForge API — authentication-related Pydantic v2 schemas.

Used for request validation and response serialisation in the
``/auth`` endpoints.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class UserRegister(BaseModel):
    """Payload for creating a new user account."""

    email: EmailStr
    password: str = Field(
        ...,
        min_length=8,
        description="Password must be at least 8 characters.",
    )
    display_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Public display name shown in the UI.",
    )


class UserLogin(BaseModel):
    """Payload for authenticating an existing user."""

    email: EmailStr
    password: str


class TokenRefreshRequest(BaseModel):
    """Payload for refreshing an access token."""

    refresh_token: str


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class UserResponse(BaseModel):
    """Public representation of a user returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: str
    created_at: datetime


class TokenResponse(BaseModel):
    """JWT token pair returned after successful auth."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: Optional[UserResponse] = None


# ---------------------------------------------------------------------------
# Internal token data
# ---------------------------------------------------------------------------

class TokenData(BaseModel):
    """Decoded JWT payload carrying the authenticated user ID."""

    user_id: str
