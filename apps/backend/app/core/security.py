from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings
from app.core.roles import UserRole, resolve_role

# In-memory fallback set of revoked JWT IDs (`jti`) so session invalidation works
# immediately even before database lookup or in unit tests without PostgreSQL.
_REVOKED_JTIS_MEMORY: set[str] = set()


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    password_bytes = plain_password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except ValueError:
        return False


def create_access_token(
    subject: str | uuid.UUID,
    role: UserRole | str,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> tuple[str, str, datetime]:
    """Create a signed JWT access token with a unique `jti` session identifier.

    Returns:
        tuple[encoded_jwt, jti, expires_at]
    """
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    jti = str(uuid.uuid4())
    canonical_role = resolve_role(role)

    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": canonical_role.value,
        "type": "access",
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)

    encoded_jwt = jwt.encode(
        payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt, jti, expire


def create_refresh_token(
    subject: str | uuid.UUID,
    role: UserRole | str,
    expires_delta: timedelta | None = None,
) -> tuple[str, str, datetime]:
    """Create a signed JWT refresh token with a unique `jti` session identifier."""
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    jti = str(uuid.uuid4())
    canonical_role = resolve_role(role)

    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": canonical_role.value,
        "type": "refresh",
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    encoded_jwt = jwt.encode(
        payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt, jti, expire


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT token signature and expiration.

    Raises:
        JWTError: If the token is malformed, expired, or has an invalid signature.
    """
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
    )


def revoke_jti_in_memory(jti: str) -> None:
    """Record a revoked token JTI in the in-memory session cache."""
    _REVOKED_JTIS_MEMORY.add(jti)


def is_jti_revoked_in_memory(jti: str) -> bool:
    """Check whether a token JTI has been revoked in the in-memory session cache."""
    return jti in _REVOKED_JTIS_MEMORY
