"""
ClipForge API — TranscriptSegment and ChatMessage ORM models.

``TranscriptSegment`` stores word-level or sentence-level speech-to-text
output. ``ChatMessage`` stores Twitch / YouTube live-chat messages.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.analysis import Analysis
    from app.models.clip import Clip
    from app.models.project import Project


class TranscriptSegment(UUIDMixin, TimestampMixin, Base):
    """A single segment of the speech-to-text transcript."""

    __tablename__ = "transcript_segments"

    # -- Parent project ------------------------------------------------------
    project_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # -- Parent analysis -----------------------------------------------------
    analysis_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # -- Optional link to a clip (when used as a subtitle in editor) ---------
    clip_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("clips.id", ondelete="SET NULL"),
        nullable=True,
    )

    # -- Segment data --------------------------------------------------------
    text: Mapped[str] = mapped_column(Text, nullable=False)
    start_sec: Mapped[float] = mapped_column(Float, nullable=False)
    end_sec: Mapped[float] = mapped_column(Float, nullable=False)
    avg_logprob: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    speaker: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    word_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Backward compatibility properties
    @property
    def start_time(self) -> float:
        return self.start_sec

    @property
    def end_time(self) -> float:
        return self.end_sec

    # -- Relationships -------------------------------------------------------
    project: Mapped[Optional["Project"]] = relationship(back_populates="transcript_segments")
    analysis: Mapped[Optional["Analysis"]] = relationship(back_populates="transcript_segments")
    clip: Mapped[Optional["Clip"]] = relationship(back_populates="subtitles")

    def __repr__(self) -> str:
        return (
            f"<TranscriptSegment id={self.id!s} "
            f"{self.start_sec:.1f}–{self.end_sec:.1f}s: {self.text[:20]!r}>"
        )


class ChatMessage(UUIDMixin, TimestampMixin, Base):
    """A live-chat message captured during stream playback."""

    __tablename__ = "chat_messages"

    project_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    username: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    emote_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="chat_messages")

    def __repr__(self) -> str:
        return f"<ChatMessage id={self.id!s} user={self.username!r}>"
