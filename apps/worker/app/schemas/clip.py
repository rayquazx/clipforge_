"""
ClipForge API — Pydantic schemas for Clips, Previews, Waveforms, Thumbnails, and Bulk actions.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


class Trim(BaseModel):
    """Trim boundaries in seconds relative to original source video."""
    start: float
    end: float


class EditState(BaseModel):
    """
    Versioned editor state.
    Preserves unknown future keys.
    """
    model_config = ConfigDict(extra="allow")

    schema_version: int = 1
    trim: Trim


class ClipResponse(BaseModel):
    """Clip representation according to Phase 4 API contract."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    analysis_id: Optional[uuid.UUID] = None
    moment_id: Optional[uuid.UUID] = None
    title: str
    category: Literal["funny", "sad", "custom"]
    source_start_sec: float
    source_end_sec: float
    edit_state: EditState
    status: Literal["draft", "rendering", "ready", "failed"]
    thumbnail_url: Optional[str] = None
    score: Optional[float] = None
    reason: Optional[str] = None
    version: int
    created_at: datetime
    updated_at: datetime


class ClipListResponse(BaseModel):
    """Paginated list of clips."""
    items: List[ClipResponse]
    page: int
    limit: int
    total: int


class CreateClipsFromMomentsRequest(BaseModel):
    """Request body for POST /analyses/{id}/clips."""
    moment_ids: List[uuid.UUID]


class CreateClipsFromMomentsResponse(BaseModel):
    """Response body for POST /analyses/{id}/clips."""
    items: List[ClipResponse]


class CreateCustomClipRequest(BaseModel):
    """Request body for POST /projects/{id}/clips."""
    start: float
    end: float
    title: Optional[str] = None


class PatchClipRequest(BaseModel):
    """Request body for PATCH /clips/{id}."""
    title: Optional[str] = None
    edit_state: Optional[dict[str, Any]] = None
    version: int


class BulkSkippedItem(BaseModel):
    id: uuid.UUID
    reason: str


class BulkActionRequest(BaseModel):
    action: Literal["export", "delete"]
    clip_ids: List[uuid.UUID]


class BulkActionResponse(BaseModel):
    accepted: List[uuid.UUID]
    skipped: List[BulkSkippedItem]


class PreviewStatusResponse(BaseModel):
    """Preview status response."""
    status: Literal["missing", "preparing", "ready", "failed"]
    progress: int = Field(ge=0, le=100)
    url: Optional[str] = None
    offset_sec: float
    duration_sec: float
    padding_sec: float
    error_message: Optional[str] = None


class WaveformResponse(BaseModel):
    """Audio peaks waveform for the preview range."""
    peaks: List[float]
    peaks_per_second: float
    offset_sec: float
    duration_sec: float


class ThumbnailsResponse(BaseModel):
    """Sprite sheet thumbnail grid."""
    sprite_url: str
    frame_width: int
    frame_height: int
    columns: int
    interval_sec: float
    count: int
    offset_sec: float


class ConfigResponse(BaseModel):
    """Global configuration settings for editor and exports."""
    max_clip_seconds: float
    preview_padding_sec: float
    export_resolutions: List[str]
