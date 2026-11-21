"""
ClipForge API — authentication service layer.

Encapsulates user creation, credential verification, and user look-ups
so that router code stays thin and testable.
"""

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.auth import UserRegister
from app.utils.security import hash_password, verify_password


class AuthService:
    """Static methods for user authentication and management."""

    @staticmethod
    async def create_user(db: AsyncSession, schema: UserRegister) -> User:
        """
        Hash the password, persist a new :class:`User`, and return it.

        The caller is responsible for committing the session (the
        ``get_db`` dependency handles this automatically).
        """
        user = User(
            email=schema.email,
            password_hash=hash_password(schema.password),
            display_name=schema.display_name,
        )
        db.add(user)
        await db.flush()          # populate server defaults (id, timestamps)
        await db.refresh(user)    # reload the full row into the ORM instance
        return user

    @staticmethod
    async def authenticate(
        db: AsyncSession,
        email: str,
        password: str,
    ) -> Optional[User]:
        """
        Look up a user by *email* and verify *password*.

        Returns the :class:`User` on success or ``None`` on failure
        (wrong email or wrong password).
        """
        user = await AuthService.get_user_by_email(db, email)
        if user is None:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user

    @staticmethod
    async def get_user_by_id(
        db: AsyncSession,
        user_id: str,
    ) -> Optional[User]:
        """Fetch a single user by their UUID (provided as a string)."""
        stmt = select(User).where(User.id == UUID(user_id))
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_by_email(
        db: AsyncSession,
        email: str,
    ) -> Optional[User]:
        """Fetch a single user by their email address."""
        stmt = select(User).where(User.email == email)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
