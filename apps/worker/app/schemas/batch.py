"""
ClipForge API — Batch Export Pydantic v2 Schemas (Phase 6).

Covers Batch, BatchItem, and related batch export request/response schemas.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.render import RenderOptions


class BatchCreateRequest(BaseModel):
    """Payload for creating a multi-clip export batch."""
    clip_ids: List[uuid.UUID] = Field(..., min_length=1, max_length=100)
    ad_template_id: Optional[uuid.UUID] = None
    options: RenderOptions = Field(default_factory=RenderOptions)
    ads_mode: Literal["replace", "append", "keep"] = "keep"


class BatchItemResponse(BaseModel):
    """Status and details for an individual clip render in a batch."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    batch_id: uuid.UUID
    clip_id: uuid.UUID
    render_id: Optional[uuid.UUID] = None
    status: Literal["queued", "rendering", "completed", "failed"]
    error_message: Optional[str] = None


class BatchResponse(BaseModel):
    """Representation of a batch export job."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    status: Literal[
        "queued",
        "running",
        "completed",
        "completed_with_errors",
        "failed",
        "cancelled",
    ]
    total: int = 0
    completed: int = 0
    failed: int = 0
    ad_template_id: Optional[uuid.UUID] = None
    options: RenderOptions
    ads_mode: Literal["replace", "append", "keep"] = "keep"
    items: List[BatchItemResponse] = Field(default_factory=list)
    zip_ready: bool = False
    created_at: datetime
    finished_at: Optional[datetime] = None


class PaginatedBatchesResponse(BaseModel):
    """Paginated list of batch jobs."""
    items: List[BatchResponse]
    total: int
    page: int
    limit: int


class BatchDownloadResponse(BaseModel):
    """Signed download URL response for completed batch ZIP archive."""
    url: str
    expires_at: datetime
    filename: str
