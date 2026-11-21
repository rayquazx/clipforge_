"""
ClipForge API — Clip ORM model (Phase 4).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any, List, Optional

from sqlalchemy import Float, ForeignKey, Index, Integer, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.ad_placement import AdPlacement
    from app.models.analysis import Analysis, Moment
    from app.models.export import Export, MusicTrack, TextOverlay
    from app.models.project import Project
    from app.models.render import Render
    from app.models.transcript import TranscriptSegment
    from app.models.user import User


class Clip(UUIDMixin, TimestampMixin, Base):
    """A clip created from highlight moments or custom editor cuts."""

    __tablename__ = "clips"

    # -- Ownership & Parents -------------------------------------------------
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    analysis_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("analyses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    moment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("moments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # -- Clip metadata -------------------------------------------------------
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="custom")
    source_start_sec: Mapped[float] = mapped_column(Float, nullable=False)
    source_end_sec: Mapped[float] = mapped_column(Float, nullable=False)

    # -- Versioned Editor State ----------------------------------------------
    edit_state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    # -- Status & Assets -----------------------------------------------------
    status: Mapped[str] = mapped_column(String(50), default="draft", nullable=False)
    thumbnail_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # -- Constraints ---------------------------------------------------------
    __table_args__ = (
        UniqueConstraint("analysis_id", "moment_id", name="uq_clips_analysis_moment"),
        Index("ix_clips_user_created", "user_id", "created_at"),
    )

    # -- Relationships -------------------------------------------------------
    user: Mapped["User"] = relationship("User", back_populates="clips")
    project: Mapped["Project"] = relationship("Project", back_populates="clips")
    analysis: Mapped[Optional["Analysis"]] = relationship("Analysis")
    moment: Mapped[Optional["Moment"]] = relationship("Moment")
    renders: Mapped[List["Render"]] = relationship(
        "Render",
        back_populates="clip",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="desc(Render.created_at)",
    )
    subtitles: Mapped[List["TranscriptSegment"]] = relationship(
        back_populates="clip", lazy="selectin"
    )
    exports: Mapped[List["Export"]] = relationship(
        back_populates="clip", cascade="all, delete-orphan", lazy="selectin"
    )
    ad_placements: Mapped[List["AdPlacement"]] = relationship(
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
            f"<Clip id={self.id!s} title={self.title!r} status={self.status} "
            f"version={self.version}>"
        )
