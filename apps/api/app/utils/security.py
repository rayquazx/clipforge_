"""
ClipForge API — password hashing and JWT token utilities.

Uses ``passlib`` with bcrypt for password storage and ``python-jose``
for JWT creation and verification.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings
from app.schemas.auth import TokenData

# Bcrypt context — auto-handles salt generation and verification.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Return a bcrypt hash of the plain-text *password*."""
    return _pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check *plain_password* against a stored bcrypt *hashed_password*."""
    return _pwd_context.verify(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(
    data: dict[str, str],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a signed JWT access token.

    Parameters
    ----------
    data:
        Claims to encode — must include ``"sub"`` with the user ID.
    expires_delta:
        Custom lifetime.  Defaults to the value from settings.
    """
    settings = get_settings()
    to_encode = data.copy()

    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire, "type": "access"})

    return jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_refresh_token(
    data: dict[str, str],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a signed JWT refresh token with a longer lifetime.

    Parameters
    ----------
    data:
        Claims to encode — must include ``"sub"`` with the user ID.
    expires_delta:
        Custom lifetime.  Defaults to the value from settings.
    """
    settings = get_settings()
    to_encode = data.copy()

    if expires_delta is None:
        expires_delta = timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire, "type": "refresh"})

    return jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> TokenData:
    """
    Decode and validate a JWT token.

    Returns a :class:`TokenData` with the ``user_id`` extracted from
    the ``"sub"`` claim.

    Raises
    ------
    ValueError
        If the token is expired, malformed, or missing the ``sub`` claim.
    """
    settings = get_settings()

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise ValueError(f"Invalid token: {exc}") from exc

    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise ValueError("Token is missing the 'sub' claim.")

    return TokenData(user_id=user_id)
