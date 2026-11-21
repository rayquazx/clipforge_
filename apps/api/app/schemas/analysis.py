"""
ClipForge API — Analysis, Moment, and Signal Schemas.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AnalysisCreateRequest(BaseModel):
    """Payload to start a moment detection run."""
    mode: str = Field("both", description="Target moment category: 'funny', 'sad', or 'both'")
    min_clip_seconds: int = Field(15, ge=5, le=120, description="Minimum clip length in seconds")
    max_clip_seconds: int = Field(60, ge=10, le=180, description="Maximum clip length in seconds")
    max_clips: int = Field(10, ge=1, le=50, description="Maximum number of clips to return")
    language: Optional[str] = Field("auto", description="ISO 639-1 language code or 'auto'")


class MomentResponse(BaseModel):
    """A single ranked moment."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    analysis_id: UUID
    start_sec: float
    end_sec: float
    category: str
    score: float
    title: str
    reason: str
    transcript_excerpt: str
    signals_json: Optional[dict[str, Any]] = None
    created_at: datetime


class SignalWindowResponse(BaseModel):
    """Downsampled or full signal window for timeline chart visualization."""
    model_config = ConfigDict(from_attributes=True)

    start_sec: float
    end_sec: float
    audio_energy: float
    laughter_score: float
    scream_score: float
    silence_score: float
    chat_rate: float
    emote_score: float
    sentiment_pos: float
    sentiment_neg: float
    funny_score: float
    sad_score: float


class AnalysisResponse(BaseModel):
    """Public representation of an analysis run."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    mode: str
    min_clip_seconds: Optional[int] = 15
    max_clip_seconds: Optional[int] = 60
    max_clips: Optional[int] = 10
    language: Optional[str] = "auto"
    status: str
    stage: Optional[str] = "queued"
    progress: Optional[int] = 0
    error_message: Optional[str] = None
    config_snapshot: Optional[dict[str, Any]] = None
    created_at: datetime
    finished_at: Optional[datetime] = None
    moments_count: Optional[int] = None
