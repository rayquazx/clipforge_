"""
ClipForge API — Analysis, SignalWindow, and Moment ORM models.

Tracks processing parameters, signal timeline windows, and detected moments
for video projects.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Any, List, Optional
from uuid import UUID

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.transcript import TranscriptSegment


class AnalysisStatus(str, enum.Enum):
    """Pipeline stages for an analysis run."""
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    TRANSCRIBING = "transcribing"
    ANALYZING = "analyzing"
    READY = "ready"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AnalysisMode(str, enum.Enum):
    """Target category for moment detection."""
    FUNNY = "funny"
    SAD = "sad"
    BOTH = "both"


class Analysis(UUIDMixin, TimestampMixin, Base):
    """A single analysis run on a project."""

    __tablename__ = "analyses"

    # -- Parent project ------------------------------------------------------
    project_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # -- Settings ------------------------------------------------------------
    mode: Mapped[str] = mapped_column(String(50), default="both", nullable=False)
    min_clip_seconds: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    max_clip_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    max_clips: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    language: Mapped[Optional[str]] = mapped_column(String(20), default="auto", nullable=True)

    # -- Status & Progress ---------------------------------------------------
    status: Mapped[str] = mapped_column(String(50), default="queued", nullable=False)
    stage: Mapped[Optional[str]] = mapped_column(String(50), default="queued", nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # -- Configuration snapshot & Timings ------------------------------------
    config_snapshot: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # -- Relationships -------------------------------------------------------
    project: Mapped["Project"] = relationship(back_populates="analyses")
    transcript_segments: Mapped[List["TranscriptSegment"]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan", lazy="selectin"
    )
    signal_windows: Mapped[List["SignalWindow"]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan", lazy="selectin"
    )
    moments: Mapped[List["Moment"]] = relationship(
        back_populates="analysis",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="desc(Moment.score)",
    )


class SignalWindow(UUIDMixin, Base):
    """5-second signal window with extracted audio, text, chat, and composite scores."""

    __tablename__ = "signal_windows"

    analysis_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    start_sec: Mapped[float] = mapped_column(Float, nullable=False)
    end_sec: Mapped[float] = mapped_column(Float, nullable=False)

    # Audio signals
    audio_energy: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    laughter_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    scream_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    silence_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Chat signals
    chat_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    emote_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Transcript signals
    sentiment_pos: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    sentiment_neg: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Composite scores (smoothed and normalized 0.0 - 1.0)
    funny_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    sad_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Relationships
    analysis: Mapped["Analysis"] = relationship(back_populates="signal_windows")

    __table_args__ = (
        Index("ix_signal_windows_analysis_start", "analysis_id", "start_sec"),
    )


class Moment(UUIDMixin, TimestampMixin, Base):
    """Ranked detected moment generated by scoring and peak-expansion."""

    __tablename__ = "moments"

    analysis_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    start_sec: Mapped[float] = mapped_column(Float, nullable=False)
    end_sec: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # "funny" | "sad"
    score: Mapped[float] = mapped_column(Float, nullable=False)  # 0.0 - 1.0

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    transcript_excerpt: Mapped[str] = mapped_column(Text, default="", nullable=False)
    signals_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)

    analysis: Mapped["Analysis"] = relationship(back_populates="moments")

    __table_args__ = (
        Index("ix_moments_analysis_score", "analysis_id", "score"),
    )
