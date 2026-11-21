"""
ClipForge API — Ad and Placement Pydantic v2 Schemas (Phase 6).

Covers AdAsset, AdPlacement, AdTemplate, and TimelineInfo schemas.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


# ----------------------------------------------------------------------------
# Text Ad Config
# ----------------------------------------------------------------------------
class AdTextConfig(BaseModel):
    """Configuration for server-side rendered text ads / lower thirds."""
    text: str = Field(..., min_length=1, max_length=500)
    font: str = Field(default="Roboto", max_length=100)
    size: int = Field(default=32, ge=8, le=200)
    color: str = Field(default="#FFFFFF", max_length=30)
    stroke: Optional[str] = Field(default=None, max_length=30)
    bg: Optional[str] = Field(default=None, max_length=30)
    bg_opacity: Optional[float] = Field(default=0.8, ge=0.0, le=1.0)


# ----------------------------------------------------------------------------
# Ad Placement Models
# ----------------------------------------------------------------------------
class AdTiming(BaseModel):
    """Timing for an ad placement."""
    anchor: Literal["clip_start", "clip_end"] = "clip_start"
    offset_sec: float = Field(default=0.0, ge=0.0)
    duration_sec: Optional[float] = Field(default=None, gt=0.0)


class AdLayout(BaseModel):
    """Layout and positioning for overlay/lower_third placements."""
    position: Literal[
        "top_left",
        "top_right",
        "bottom_left",
        "bottom_right",
        "center",
        "custom",
    ] = "bottom_right"
    x: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    y: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    scale: float = Field(default=0.3, gt=0.0, le=1.0)
    opacity: float = Field(default=1.0, ge=0.0, le=1.0)
    margin: float = Field(default=0.05, ge=0.0, le=0.5)


class AdAudio(BaseModel):
    """Audio configuration for video ad placements."""
    volume: float = Field(default=1.0, ge=0.0, le=1.0)


class AdPlacement(BaseModel):
    """A single ad placement on a clip timeline."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    ad_asset_id: uuid.UUID
    type: Literal["preroll", "postroll", "overlay", "lower_third"]
    timing: AdTiming = Field(default_factory=AdTiming)
    layout: AdLayout = Field(default_factory=AdLayout)
    animation: Literal["none", "fade", "slide"] = "none"
    text_override: Optional[str] = None
    audio: AdAudio = Field(default_factory=AdAudio)


class AdPlacementTemplateItem(BaseModel):
    """Ad placement within a template (without placement id)."""
    ad_asset_id: uuid.UUID
    type: Literal["preroll", "postroll", "overlay", "lower_third"]
    timing: AdTiming = Field(default_factory=AdTiming)
    layout: AdLayout = Field(default_factory=AdLayout)
    animation: Literal["none", "fade", "slide"] = "none"
    text_override: Optional[str] = None
    audio: AdAudio = Field(default_factory=AdAudio)


# ----------------------------------------------------------------------------
# AdAsset Requests & Responses
# ----------------------------------------------------------------------------
class AdAssetCreateRequest(BaseModel):
    """JSON payload for creating text ad assets."""
    name: str = Field(..., min_length=1, max_length=200)
    kind: Literal["text"]
    tags: List[str] = Field(default_factory=list)
    text_config: AdTextConfig


class AdAssetUpdateRequest(BaseModel):
    """Payload for updating an ad asset."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    tags: Optional[List[str]] = None
    text_config: Optional[AdTextConfig] = None


class AdAssetResponse(BaseModel):
    """Public representation of an AdAsset."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    kind: Literal["video", "image", "text"]
    url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration_sec: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    has_audio: bool = False
    file_size: Optional[int] = None
    text_config: Optional[AdTextConfig] = None
    tags: List[str] = Field(default_factory=list)
    status: Literal["processing", "ready", "failed"]
    usage_count: int = 0
    created_at: datetime
    updated_at: datetime


class PaginatedAdAssetsResponse(BaseModel):
    """Paginated list of ad assets."""
    items: List[AdAssetResponse]
    total: int
    page: int
    limit: int


# ----------------------------------------------------------------------------
# AdTemplate Requests & Responses
# ----------------------------------------------------------------------------
class AdTemplateCreateRequest(BaseModel):
    """Payload for creating a reusable ad template."""
    name: str = Field(..., min_length=1, max_length=200)
    placements: List[AdPlacementTemplateItem] = Field(default_factory=list)


class AdTemplateUpdateRequest(BaseModel):
    """Payload for updating an ad template."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    placements: Optional[List[AdPlacementTemplateItem]] = None


class AdTemplateResponse(BaseModel):
    """Representation of an AdTemplate."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    placements: List[dict[str, Any]]
    usage_count: int = 0
    created_at: datetime
    updated_at: datetime


class ApplyTemplateRequest(BaseModel):
    """Payload for applying a template to a clip."""
    template_id: uuid.UUID
    mode: Literal["replace", "append"] = "replace"


# ----------------------------------------------------------------------------
# Timeline Info Response
# ----------------------------------------------------------------------------
class TimelineInfoResponse(BaseModel):
    """Single source of truth for UI timeline coordinates."""
    main_duration_sec: float
    preroll_duration_sec: float
    postroll_duration_sec: float
    total_duration_sec: float
