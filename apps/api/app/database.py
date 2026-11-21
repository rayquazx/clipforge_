"""
ClipForge API — async SQLAlchemy database engine and session factory.

Provides :func:`get_db`, an async generator suitable for use as a
FastAPI dependency that yields a scoped ``AsyncSession``.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings

settings = get_settings()

# Async engine — pool size is kept modest for development; tune in prod.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
)

# Session factory bound to the engine.
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides a transactional database session.

    The session is committed on success and rolled back on exception,
    then closed automatically when the request finishes.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
