"""
ClipForge API — shared SQLAlchemy base class and mixins.

Provides a ``DeclarativeBase``, a UUID primary-key mixin, and an
automatic ``created_at`` / ``updated_at`` timestamp mixin that every
domain model inherits.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Root declarative base for all ClipForge ORM models."""
    pass


class UUIDMixin:
    """
    Mixin that adds a UUID ``id`` column as the primary key.

    Uses the PostgreSQL-native ``UUID`` type with a Python-side
    default of ``uuid.uuid4``.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


class TimestampMixin:
    """
    Mixin that adds ``created_at`` and ``updated_at`` columns.

    Both columns use server-side defaults (``now()``) so timestamps
    are consistent across application instances.  ``updated_at`` is
    also refreshed automatically on every ``UPDATE``.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
