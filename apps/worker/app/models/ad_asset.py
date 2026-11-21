"""
ClipForge API — AdAsset ORM Model (Phase 6).

Represents an advertisement creative asset (video, image, or text)
stored in MinIO or generated server-side.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, List, Optional
import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, BigInteger, Float, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class AdAsset(UUIDMixin, TimestampMixin, Base):
    """An advertisement asset creative owned by a user."""

    __tablename__ = "ad_assets"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # video, image, text
    storage_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    thumbnail_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    duration_sec: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    has_audio: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    text_config: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    tags: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)

    status: Mapped[str] = mapped_column(
        String(20), default="processing", nullable=False, index=True
    )  # processing, ready, failed

    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", backref="ad_assets")

    def __repr__(self) -> str:
        return f"<AdAsset id={self.id} name={self.name!r} kind={self.kind} status={self.status}>"
