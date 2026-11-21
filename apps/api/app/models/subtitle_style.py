"""
ClipForge API — SubtitleStyle ORM Model (Phase 5).

Stores preset and user-saved subtitle styles (fonts, colors, outlines, boxes, positions).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class SubtitleStyle(UUIDMixin, TimestampMixin, Base):
    """Preset or user-customized subtitle visual style."""

    __tablename__ = "subtitle_styles"

    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    font_family: Mapped[str] = mapped_column(String(100), default="Montserrat", nullable=False)
    font_size: Mapped[int] = mapped_column(Integer, default=36, nullable=False)
    primary_color: Mapped[str] = mapped_column(String(20), default="#FFFFFF", nullable=False)
    outline_color: Mapped[str] = mapped_column(String(20), default="#000000", nullable=False)
    outline_width: Mapped[float] = mapped_column(Float, default=2.5, nullable=False)
    box_color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    shadow_color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    position: Mapped[str] = mapped_column(String(20), default="bottom", nullable=False)
    uppercase: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    preset_type: Mapped[str] = mapped_column(String(50), default="custom", nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    user: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return f"<SubtitleStyle id={self.id!s} name={self.name!r} is_system={self.is_system}>"
