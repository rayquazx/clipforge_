"""
ClipForge API — SourceMedia ORM model (Phase 4).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional
import uuid

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin

if TYPE_CHECKING:
    from app.models.project import Project


class SourceMedia(UUIDMixin, Base):
    """Tracks cached raw or range-downloaded media for projects."""

    __tablename__ = "source_media"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    kind: Mapped[str] = mapped_column(String(50), default="video", nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="missing", nullable=False)

    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_sec: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    format: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    covered_range: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # -- Relationships -------------------------------------------------------
    project: Mapped["Project"] = relationship("Project")

    def __repr__(self) -> str:
        return (
            f"<SourceMedia id={self.id!s} project_id={self.project_id!s} "
            f"kind={self.kind} status={self.status}>"
        )
