"""
ClipForge API — Pydantic schemas for Clips, EditState (Phase 5), Subtitles, Overlays, and Audio.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.ad import AdPlacement


# ----------------------------------------------------------------------------
# Format & Crop
# ----------------------------------------------------------------------------
class Trim(BaseModel):
    """Trim boundaries in seconds relative to original source video."""
    start: float
    end: float


class ManualCrop(BaseModel):
    """Manual crop rectangle in percentage (0..100)."""
    x: float = Field(ge=0.0, le=100.0)
    y: float = Field(ge=0.0, le=100.0)
    w: float = Field(gt=0.0, le=100.0)
    h: float = Field(gt=0.0, le=100.0)


class StackedCrop(BaseModel):
    """Stacked gameplay layout: top game crop and bottom cam crop."""
    game_crop: ManualCrop
    cam_crop: ManualCrop


class FormatConfig(BaseModel):
    """Video formatting and aspect ratio crop settings."""
    preset: Literal["16:9", "9:16", "1:1", "4:5"] = "16:9"
    crop_mode: Literal["center", "smart", "manual", "stacked"] = "center"
    manual_crop: Optional[ManualCrop] = None
    stacked: Optional[StackedCrop] = None
    background: Literal["blur", "color", "none"] = "blur"
    background_color: Optional[str] = "#000000"


# ----------------------------------------------------------------------------
# Subtitles
# ----------------------------------------------------------------------------
class WordItem(BaseModel):
    """Word-level timestamp item for karaoke highlighting."""
    w: str
    start: float
    end: float


class SubtitleItem(BaseModel):
    """Single subtitle line item."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    start: float
    end: float
    text: str
    words: Optional[List[WordItem]] = None


class SubtitlesConfig(BaseModel):
    """Subtitles configuration in edit_state."""
    enabled: bool = False
    language: str = "en"
    style_id: Optional[str] = None
    position: Literal["bottom", "middle", "top"] = "bottom"
    items: List[SubtitleItem] = Field(default_factory=list)


class SubtitleStyleResponse(BaseModel):
    """Subtitle style preset and custom styles."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    name: str
    font_family: str = "Montserrat"
    font_size: int = 36
    primary_color: str = "#FFFFFF"
    outline_color: str = "#000000"
    outline_width: float = 2.5
    box_color: Optional[str] = None
    shadow_color: Optional[str] = None
    position: Literal["bottom", "middle", "top"] = "bottom"
    uppercase: bool = False
    preset_type: Literal["classic", "boxed", "karaoke", "bold_pop", "custom"] = "classic"
    is_system: bool = False
    created_at: Optional[datetime] = None


class SubtitleStyleCreateRequest(BaseModel):
    """Payload to save a custom subtitle style."""
    name: str = Field(min_length=1, max_length=100)
    font_family: str = "Montserrat"
    font_size: int = Field(default=36, ge=12, le=120)
    primary_color: str = "#FFFFFF"
    outline_color: str = "#000000"
    outline_width: float = Field(default=2.5, ge=0.0, le=20.0)
    box_color: Optional[str] = None
    shadow_color: Optional[str] = None
    position: Literal["bottom", "middle", "top"] = "bottom"
    uppercase: bool = False
    preset_type: Literal["classic", "boxed", "karaoke", "bold_pop", "custom"] = "custom"


class GenerateSubtitlesRequest(BaseModel):
    """Request payload for POST /clips/{id}/subtitles/generate."""
    language: Optional[str] = None


# ----------------------------------------------------------------------------
# Text Overlays
# ----------------------------------------------------------------------------
class OverlayItem(BaseModel):
    """A text overlay element composited onto the video."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: Literal["text"] = "text"
    text: str
    start: float
    end: float
    x: float = Field(default=50.0, ge=0.0, le=100.0)
    y: float = Field(default=50.0, ge=0.0, le=100.0)
    font: str = "Inter"
    size: int = Field(default=32, ge=12, le=200)
    color: str = "#FFFFFF"
    stroke: Optional[str] = None
    bg: Optional[str] = None
    opacity: float = Field(default=1.0, ge=0.0, le=1.0)
    animation: Literal["none", "fade", "slide-up", "pop"] = "none"
    z_index: Optional[int] = 1


# ----------------------------------------------------------------------------
# Background Music
# ----------------------------------------------------------------------------
class MusicConfig(BaseModel):
    """Background music mixing configuration in edit_state."""
    track_id: Optional[str] = None
    uploaded_asset_id: Optional[str] = None
    volume: float = Field(default=0.5, ge=0.0, le=2.0)
    original_volume: float = Field(default=1.0, ge=0.0, le=2.0)
    fade_in: float = Field(default=1.0, ge=0.0, le=10.0)
    fade_out: float = Field(default=1.5, ge=0.0, le=10.0)
    start_offset: float = Field(default=0.0, ge=0.0)
    ducking: bool = True


class AudioAssetResponse(BaseModel):
    """Audio asset representation for music library."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    title: str
    artist: Optional[str] = None
    duration_sec: float
    url: Optional[str] = None
    file_size_bytes: Optional[int] = None
    is_bundled: bool = False
    license_info: Optional[str] = None
    genre: Optional[str] = None
    waveform_peaks: Optional[List[float]] = None
    created_at: Optional[datetime] = None


# ----------------------------------------------------------------------------
# Smart Crop
# ----------------------------------------------------------------------------
class SmartCropKeyframe(BaseModel):
    t: float
    x: float
    y: float
    w: float
    h: float


class SmartCropResponse(BaseModel):
    clip_id: uuid.UUID
    preset: Literal["16:9", "9:16", "1:1", "4:5"]
    keyframes: List[SmartCropKeyframe]
    cached: bool = False


# ----------------------------------------------------------------------------
# Versioned Edit State
# ----------------------------------------------------------------------------
class EditState(BaseModel):
    """
    Versioned editor state with full Phase 5 capabilities.
    Preserves unknown future keys.
    """
    model_config = ConfigDict(extra="allow")

    schema_version: int = 2
    trim: Trim
    format: Optional[FormatConfig] = None
    subtitles: Optional[SubtitlesConfig] = None
    overlays: List[OverlayItem] = Field(default_factory=list)
    music: Optional[MusicConfig] = None
    ads: List[AdPlacement] = Field(default_factory=list)


class EditVersionResponse(BaseModel):
    """Snapshot of an edit version for undo history."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clip_id: uuid.UUID
    version: int
    edit_state: EditState
    created_at: datetime


# ----------------------------------------------------------------------------
# Clip & Render Responses
# ----------------------------------------------------------------------------
class ClipResponse(BaseModel):
    """Clip representation according to API contract."""
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
