"""
ClipForge API — Render ORM model (Phase 4).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional
import uuid

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.clip import Clip


class Render(UUIDMixin, TimestampMixin, Base):
    """A video rendering/export job for a clip."""

    __tablename__ = "renders"

    clip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(String(50), default="queued", nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    options: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    output_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    duration_sec: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # -- Relationships -------------------------------------------------------
    clip: Mapped["Clip"] = relationship("Clip", back_populates="renders")

    def __repr__(self) -> str:
        return f"<Render id={self.id!s} status={self.status} progress={self.progress}%>"
