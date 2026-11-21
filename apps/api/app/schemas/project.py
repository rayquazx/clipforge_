"""
ClipForge API — Project Pydantic Schemas.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreateRequest(BaseModel):
    """Payload for creating a project from an external link."""

    url: str = Field(..., description="Link to a Twitch VOD, YouTube video, or Kick VOD.")


class ProjectResponse(BaseModel):
    """Public representation of a project."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    source_type: str
    source_url: Optional[str] = None
    external_id: Optional[str] = None
    title: Optional[str] = None
    channel_name: Optional[str] = None
    duration_seconds: Optional[int] = None
    thumbnail_url: Optional[str] = None
    published_at: Optional[datetime] = None
    status: str
    progress: Optional[int] = 0
    error_message: Optional[str] = None
    raw_video_key: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PaginatedProjectsResponse(BaseModel):
    """Paginated list of projects."""

    items: List[ProjectResponse]
    total: int
    page: int
    limit: int
    total_pages: int
