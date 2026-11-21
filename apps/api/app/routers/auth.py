"""
ClipForge API — authentication router.

Provides registration, login, token refresh, and "who am I" endpoints.
All tokens are JWTs carrying the user ID as subject.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import (
    TokenRefreshRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.services.auth_service import AuthService
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _build_tokens(user: User) -> TokenResponse:
    """Generate an access + refresh token pair for the given user."""
    access = create_access_token(data={"sub": str(user.id)})
    refresh = create_refresh_token(data={"sub": str(user.id)})
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(
    payload: UserRegister,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Create a new user with hashed password and return JWT tokens.

    Raises ``409 Conflict`` if the email is already registered.
    """
    existing = await AuthService.get_user_by_email(db, payload.email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    user = await AuthService.create_user(db, payload)
    return _build_tokens(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in with email and password",
)
async def login(
    payload: UserLogin,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Verify credentials and return JWT tokens.

    Raises ``401 Unauthorized`` on invalid email or password.
    """
    user = await AuthService.authenticate(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    return _build_tokens(user)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh an access token",
)
async def refresh(
    payload: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Accept a valid refresh token and return a fresh access + refresh
    token pair.

    Raises ``401 Unauthorized`` if the refresh token is invalid or
    the user no longer exists.
    """
    try:
        token_data = decode_token(payload.refresh_token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    user = await AuthService.get_user_by_id(db, token_data.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    return _build_tokens(user)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Return the currently authenticated user",
)
async def me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the profile of the user identified by the access token."""
    return UserResponse.model_validate(current_user)
