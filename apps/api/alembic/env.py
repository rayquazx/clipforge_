"""
Alembic async environment configuration for ClipForge.

Imports every ORM model so that ``target_metadata`` contains the full
schema graph, then runs migrations inside an async engine connection.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings

# Import all models so their tables are registered on Base.metadata.
from app.models import Base  # noqa: F401 — side-effect import

# Alembic Config object (provides access to alembic.ini values).
config = context.config

# Standard Python logging from the ini file.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# This is what Alembic diffs against when auto-generating migrations.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode — emits SQL to stdout without
    connecting to a database.
    """
    settings = get_settings()
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:  # type: ignore[no-untyped-def]
    """Execute migrations within the provided connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode — connects to the database with
    an async engine and executes each migration revision.
    """
    settings = get_settings()
    connectable = create_async_engine(settings.DATABASE_URL)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
