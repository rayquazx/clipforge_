"""
ClipForge API — reusable FastAPI dependencies.

Centralises cross-cutting concerns like authentication so that
route handlers stay focused on business logic.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.auth_service import AuthService
from app.utils.security import decode_token

# Extracts the Bearer token from the Authorization header.
_bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Validate the JWT access token and return the corresponding
    :class:`User` ORM instance.

    Raises ``401 Unauthorized`` when the token is missing, invalid,
    or references a user that no longer exists.
    """
    token = credentials.credentials

    try:
        token_data = decode_token(token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await AuthService.get_user_by_id(db, token_data.user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
