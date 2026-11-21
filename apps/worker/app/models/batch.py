"""
ClipForge API — Batch and BatchItem ORM Models (Phase 6).

Represents a multi-clip export batch and individual render queue items.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, List, Optional
import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.ad_template import AdTemplate
    from app.models.clip import Clip
    from app.models.render import Render
    from app.models.user import User


class Batch(UUIDMixin, Base):
    """A batch export job containing multiple clip renders."""

    __tablename__ = "batches"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(30), default="queued", nullable=False, index=True
    )  # queued, running, completed, completed_with_errors, failed, cancelled

    ad_template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ad_templates.id", ondelete="SET NULL"),
        nullable=True,
    )

    options: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    ads_mode: Mapped[str] = mapped_column(String(20), default="keep", nullable=False)  # replace, append, keep
    zip_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", backref="batches")
    ad_template: Mapped[Optional["AdTemplate"]] = relationship("AdTemplate")
    items: Mapped[List["BatchItem"]] = relationship(
        "BatchItem", back_populates="batch", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Batch id={self.id} status={self.status} user_id={self.user_id}>"


class BatchItem(UUIDMixin, TimestampMixin, Base):
    """An individual clip render job within a batch."""

    __tablename__ = "batch_items"

    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    clip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    render_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("renders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(20), default="queued", nullable=False, index=True
    )  # queued, rendering, completed, failed

    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    batch: Mapped["Batch"] = relationship("Batch", back_populates="items")
    clip: Mapped["Clip"] = relationship("Clip")
    render: Mapped[Optional["Render"]] = relationship("Render")

    def __repr__(self) -> str:
        return f"<BatchItem id={self.id} batch_id={self.batch_id} clip_id={self.clip_id} status={self.status}>"
