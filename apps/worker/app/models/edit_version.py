"""
ClipForge API — EditVersion ORM Model (Phase 5).

Stores historical snapshots of clip edit_state for undo/redo and autosave rollback.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Index, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.clip import Clip
    from app.models.user import User


class EditVersion(UUIDMixin, TimestampMixin, Base):
    """A snapshot of clip edit_state for undo/redo version history."""

    __tablename__ = "edit_versions"

    clip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    version: Mapped[int] = mapped_column(Integer, nullable=False)
    edit_state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    __table_args__ = (
        Index("ix_edit_versions_clip_version", "clip_id", "version"),
    )

    clip: Mapped["Clip"] = relationship("Clip")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<EditVersion clip={self.clip_id!s} v={self.version}>"
