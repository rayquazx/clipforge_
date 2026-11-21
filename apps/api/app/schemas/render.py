"""
ClipForge API — Pydantic schemas for Renders.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional, Union
import uuid

from pydantic import BaseModel, ConfigDict, Field


class RenderOptions(BaseModel):
    """Rendering options for a clip."""
    resolution: Literal["original", "1080p", "720p", "360p"] = "original"
    fps: Union[Literal["original"], Literal[30], Literal[60]] = "original"
    quality: Literal["high", "medium", "small"] = "high"
    filename: Optional[str] = None
    include_srt: bool = False
    is_preview: bool = False


class CreateRenderRequest(BaseModel):
    """Request body for POST /clips/{id}/renders."""
    options: RenderOptions = Field(default_factory=RenderOptions)


class RenderResponse(BaseModel):
    """Render representation according to Phase 4 API contract."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clip_id: uuid.UUID
    status: Literal["queued", "downloading", "rendering", "ready", "failed", "cancelled"]
    progress: int = Field(ge=0, le=100)
    options: RenderOptions
    file_size: Optional[int] = None
    duration_sec: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    error_message: Optional[str] = None
    created_at: datetime
    finished_at: Optional[datetime] = None


class RenderListResponse(BaseModel):
    """Paginated list of renders."""
    items: List[RenderResponse]
    page: int
    limit: int
    total: int


class DownloadResponse(BaseModel):
    """Presigned download URL for a completed render."""
    url: str
    expires_at: str
    filename: str
