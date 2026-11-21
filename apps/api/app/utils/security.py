"""
ClipForge API — password hashing and JWT token utilities.

Uses ``bcrypt`` directly for stable password hashing and ``python-jose``
for JWT creation and verification.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from app.config import get_settings
from app.schemas.auth import TokenData


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Return a bcrypt hash of the plain-text *password*."""
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


# Alias for compatibility
get_password_hash = hash_password



def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check *plain_password* against a stored bcrypt *hashed_password*."""
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False


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
    """Create a long-lived signed JWT refresh token."""
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
    Decode and validate a signed JWT string.

    Raises ``JWTError`` if the signature is invalid or the token has
    expired.
    """
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
    )
    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise JWTError("Token payload missing subject ('sub') claim.")
    return TokenData(user_id=user_id)
