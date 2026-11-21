"""
ClipForge API — AdPlacement ORM model.

Represents the insertion of an :class:`Ad` into a :class:`Clip` at a
specific position and time, used by the render pipeline to composite
the final exported video.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Enum, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.ad import Ad
    from app.models.clip import Clip


class PlacementType(str, enum.Enum):
    """Where the ad appears relative to the clip timeline."""
    PRE_ROLL = "pre_roll"
    POST_ROLL = "post_roll"
    OVERLAY = "overlay"
    LOWER_THIRD = "lower_third"


class AdPlacement(UUIDMixin, TimestampMixin, Base):
    """Concrete placement of an ad within a clip."""

    __tablename__ = "ad_placements"

    # -- Parent clip ---------------------------------------------------------
    clip_id: Mapped["UUID"] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clips.id", ondelete="CASCADE"),
        nullable=False,
    )

    # -- Referenced ad -------------------------------------------------------
    ad_id: Mapped["UUID"] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ads.id", ondelete="CASCADE"),
        nullable=False,
    )

    # -- Placement details ---------------------------------------------------
    placement_type: Mapped[PlacementType] = mapped_column(
        Enum(PlacementType, name="placement_type_enum", create_constraint=True),
        nullable=False,
    )
    start_time: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    duration: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    opacity: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    position: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # -- Relationships -------------------------------------------------------
    clip: Mapped["Clip"] = relationship(back_populates="ad_placements")
    ad: Mapped["Ad"] = relationship(back_populates="placements")

    def __repr__(self) -> str:
        return (
            f"<AdPlacement id={self.id!s} "
            f"type={self.placement_type.value} clip={self.clip_id!s}>"
        )
