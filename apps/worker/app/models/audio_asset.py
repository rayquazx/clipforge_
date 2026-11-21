"""
ClipForge API — AudioAsset ORM Model (Phase 5).

Stores bundled royalty-free music and user-uploaded audio tracks.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class AudioAsset(UUIDMixin, TimestampMixin, Base):
    """A background music track or audio asset."""

    __tablename__ = "audio_assets"

    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    artist: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    duration_sec: Mapped[float] = mapped_column(Float, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_bundled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    license_info: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    genre: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    waveform_peaks: Mapped[Optional[List[float]]] = mapped_column(JSON, nullable=True)

    user: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return f"<AudioAsset id={self.id!s} title={self.title!r} bundled={self.is_bundled}>"
