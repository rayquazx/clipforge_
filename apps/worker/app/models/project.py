"""
ClipForge API — Project ORM model.

A *project* represents a single stream / video that the user wants to
slice into clips. It tracks the source URL, processing status,
metadata, and links to generated clips, transcript segments,
and chat messages.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Any, List, Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.analysis import Analysis
    from app.models.clip import Clip
    from app.models.transcript import ChatMessage, TranscriptSegment
    from app.models.user import User


class SourceType(str, enum.Enum):
    """Supported source video types."""
    TWITCH = "twitch"
    YOUTUBE = "youtube"
    KICK = "kick"
    UPLOAD = "upload"


# Backward compatibility alias
Platform = SourceType


class ProjectStatus(str, enum.Enum):
    """Processing pipeline status for a project."""
    QUEUED = "queued"
    FETCHING_METADATA = "fetching_metadata"
    READY = "ready"
    FAILED = "failed"
    # Future pipeline states (Phase 3+)
    DOWNLOADING = "downloading"
    TRANSCRIBING = "transcribing"
    ANALYZING = "analyzing"


class ProjectMode(str, enum.Enum):
    """Clip-detection mood preset."""
    FUNNY = "funny"
    SAD = "sad"
    BOTH = "both"


class Project(UUIDMixin, TimestampMixin, Base):
    """A video-to-clips processing project."""

    __tablename__ = "projects"

    # -- Owner ---------------------------------------------------------------
    user_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # -- Source info ---------------------------------------------------------
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    external_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # -- Metadata ------------------------------------------------------------
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, default="Untitled Video")
    channel_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # -- Processing status ---------------------------------------------------
    status: Mapped[str] = mapped_column(String(50), default="queued", nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # -- AI mode preferences (defaults for later phases) ---------------------
    mode: Mapped[str] = mapped_column(String(50), default="both", nullable=False)
    clip_count_target: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    clip_length_min: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    clip_length_max: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    # -- Storage keys --------------------------------------------------------
    raw_video_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    audio_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    project_metadata: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # -- Table constraints & indexes -----------------------------------------
    __table_args__ = (
        UniqueConstraint("user_id", "source_url", name="uq_projects_user_source_url"),
        Index("ix_projects_user_created", "user_id", text("created_at DESC")),
    )

    # -- Relationships -------------------------------------------------------
    user: Mapped["User"] = relationship(back_populates="projects")
    analyses: Mapped[List["Analysis"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="desc(Analysis.created_at)",
    )
    clips: Mapped[List["Clip"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="selectin"
    )
    transcript_segments: Mapped[List["TranscriptSegment"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="selectin"
    )
    chat_messages: Mapped[List["ChatMessage"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="selectin"
    )

    # Compatibility properties
    @property
    def platform(self) -> str:
        return self.source_type

    @property
    def platform_video_id(self) -> Optional[str]:
        return self.external_id

    def __repr__(self) -> str:
        return f"<Project id={self.id!s} title={self.title!r} status={self.status}>"
