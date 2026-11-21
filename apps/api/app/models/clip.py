"""
ClipForge API — Clip ORM model.

Each clip is a time-range slice of a parent :class:`Project` video,
scored by the AI analysis pipeline and optionally enriched with
subtitles, ad placements, text overlays, and music tracks before
export.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Any, List, Optional

from sqlalchemy import Enum, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.ad_placement import AdPlacement
    from app.models.export import Export, MusicTrack, TextOverlay
    from app.models.project import Project
    from app.models.transcript import TranscriptSegment


class Category(str, enum.Enum):
    """Detected mood category for a clip."""
    FUNNY = "funny"
    SAD = "sad"


class ClipStatus(str, enum.Enum):
    """Lifecycle status of a clip."""
    DETECTED = "detected"
    EDITED = "edited"
    EXPORTED = "exported"


class Clip(UUIDMixin, TimestampMixin, Base):
    """A detected or edited clip within a project."""

    __tablename__ = "clips"

    # -- Parent project ------------------------------------------------------
    project_id: Mapped["UUID"] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    # -- Clip metadata -------------------------------------------------------
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)

    # -- AI scores -----------------------------------------------------------
    funny_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sad_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    category: Mapped[Category] = mapped_column(
        Enum(Category, name="category_enum", create_constraint=True),
        nullable=False,
    )

    # -- Editor state --------------------------------------------------------
    status: Mapped[ClipStatus] = mapped_column(
        Enum(ClipStatus, name="clip_status_enum", create_constraint=True),
        default=ClipStatus.DETECTED,
        nullable=False,
    )
    editor_state: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    preview_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # -- Relationships -------------------------------------------------------
    project: Mapped["Project"] = relationship(back_populates="clips")
    subtitles: Mapped[List["TranscriptSegment"]] = relationship(
        back_populates="clip", lazy="selectin"
    )
    ad_placements: Mapped[List["AdPlacement"]] = relationship(
        back_populates="clip", cascade="all, delete-orphan", lazy="selectin"
    )
    exports: Mapped[List["Export"]] = relationship(
        back_populates="clip", cascade="all, delete-orphan", lazy="selectin"
    )
    text_overlays: Mapped[List["TextOverlay"]] = relationship(
        back_populates="clip", cascade="all, delete-orphan", lazy="selectin"
    )
    music_tracks: Mapped[List["MusicTrack"]] = relationship(
        back_populates="clip", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return (
            f"<Clip id={self.id!s} title={self.title!r} "
            f"{self.start_time:.1f}–{self.end_time:.1f}s>"
        )
