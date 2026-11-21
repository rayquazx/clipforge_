"""
ClipForge API — AdTemplate ORM Model (Phase 6).

Represents a reusable ad configuration template composed of placements
that can be applied to individual clips or in batch renders.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, List
import uuid

from sqlalchemy import ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class AdTemplate(UUIDMixin, TimestampMixin, Base):
    """Reusable ad placements template owned by a user."""

    __tablename__ = "ad_templates"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    placements: Mapped[List[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", backref="ad_templates")

    def __repr__(self) -> str:
        return f"<AdTemplate id={self.id} name={self.name!r} count={len(self.placements)}>"
