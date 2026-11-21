"""
ClipForge Worker — User ORM model.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, List

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.ad import Ad
    from app.models.clip import Clip
    from app.models.export import Export
    from app.models.project import Project


class User(UUIDMixin, TimestampMixin, Base):
    """Registered ClipForge user."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(320), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)

    # -- Relationships -------------------------------------------------------
    projects: Mapped[List["Project"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    clips: Mapped[List["Clip"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    ads: Mapped[List["Ad"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    exports: Mapped[List["Export"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id!s} email={self.email!r}>"
