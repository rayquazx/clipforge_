"""
ClipForge API — Export, TextOverlay, and MusicTrack ORM models.

:class:`Export` tracks a render job that produces a final video file.
:class:`TextOverlay` and :class:`MusicTrack` store per-clip creative
enhancements applied before rendering.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.clip import Clip
    from app.models.user import User


class ExportStatus(str, enum.Enum):
    """Lifecycle status of a render/export job."""
    PENDING = "pending"
    RENDERING = "rendering"
    COMPLETED = "completed"
    FAILED = "failed"


class Export(UUIDMixin, TimestampMixin, Base):
    """A render job that produces a final video file from a clip."""

    __tablename__ = "exports"

    # -- Parent clip & owner -------------------------------------------------
    clip_id: Mapped["UUID"] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clips.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped["UUID"] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # -- Job status ----------------------------------------------------------
    status: Mapped[ExportStatus] = mapped_column(
        Enum(ExportStatus, name="export_status_enum", create_constraint=True),
        default=ExportStatus.PENDING,
        nullable=False,
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # -- Output specs --------------------------------------------------------
    aspect_ratio: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    format: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # -- Render settings & errors -------------------------------------------
    render_settings: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # -- Relationships -------------------------------------------------------
    clip: Mapped["Clip"] = relationship(back_populates="exports")
    user: Mapped["User"] = relationship(back_populates="exports")

    def __repr__(self) -> str:
        return f"<Export id={self.id!s} status={self.status.value}>"


class TextOverlay(UUIDMixin, TimestampMixin, Base):
    """A text overlay composited onto a clip during rendering."""

    __tablename__ = "text_overlays"

    # -- Parent clip ---------------------------------------------------------
    clip_id: Mapped["UUID"] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clips.id", ondelete="CASCADE"),
        nullable=False,
    )

    # -- Overlay content -----------------------------------------------------
    content: Mapped[str] = mapped_column(Text, nullable=False)
    start_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)
    style: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    z_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # -- Relationships -------------------------------------------------------
    clip: Mapped["Clip"] = relationship(back_populates="text_overlays")

    def __repr__(self) -> str:
        return f"<TextOverlay id={self.id!s} content={self.content[:30]!r}>"


class MusicTrack(UUIDMixin, TimestampMixin, Base):
    """A background music track attached to a clip."""

    __tablename__ = "music_tracks"

    # -- Parent clip ---------------------------------------------------------
    clip_id: Mapped["UUID"] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clips.id", ondelete="CASCADE"),
        nullable=False,
    )

    # -- Track info ----------------------------------------------------------
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    asset_key: Mapped[str] = mapped_column(String(500), nullable=False)
    start_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    volume: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    loop: Mapped[bool] = mapped_column(default=False, nullable=False)

    # -- Relationships -------------------------------------------------------
    clip: Mapped["Clip"] = relationship(back_populates="music_tracks")

    def __repr__(self) -> str:
        return f"<MusicTrack id={self.id!s} name={self.name!r}>"
