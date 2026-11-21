"""
ClipForge API — Ad ORM model.

Represents a user-uploaded advertisement asset (video, image, or text
banner) that can be placed into exported clips via :class:`AdPlacement`.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Any, List, Optional

from sqlalchemy import Enum, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.ad_placement import AdPlacement
    from app.models.user import User


class AdType(str, enum.Enum):
    """Format of the ad creative."""
    VIDEO = "video"
    IMAGE = "image"
    TEXT_BANNER = "text_banner"


class Ad(UUIDMixin, TimestampMixin, Base):
    """A reusable advertisement asset owned by a user."""

    __tablename__ = "ads"

    # -- Owner ---------------------------------------------------------------
    user_id: Mapped["UUID"] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # -- Ad metadata ---------------------------------------------------------
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    ad_type: Mapped[AdType] = mapped_column(
        Enum(AdType, name="ad_type_enum", create_constraint=True),
        nullable=False,
    )
    asset_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    banner_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    style: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # -- Relationships -------------------------------------------------------
    user: Mapped["User"] = relationship(back_populates="ads")
    placements: Mapped[List["AdPlacement"]] = relationship(
        back_populates="ad", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Ad id={self.id!s} name={self.name!r} type={self.ad_type.value}>"
