from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.roles import (
    ROLE_PERMISSIONS,
    Permission,
    UserRole,
    has_permission,
    resolve_role,
)
from app.core.security import decode_token, is_jti_revoked_in_memory
from app.db.session import get_db
from app.models.session import RevokedToken
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


class SessionContext:
    """Validated JWT session context containing user, token claims, and RBAC role."""

    def __init__(
        self,
        user: User,
        jti: str,
        expires_at: datetime,
        raw_token: str,
        payload: dict,
    ) -> None:
        self.user = user
        self.jti = jti
        self.expires_at = expires_at
        self.raw_token = raw_token
        self.payload = payload
        self.role: UserRole = resolve_role(user.role)
        self.permissions: frozenset[Permission] = ROLE_PERMISSIONS.get(
            self.role, frozenset()
        )


async def get_current_session(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionContext:
    """Validate the Bearer JWT token, ensure it is not revoked in `revoked_tokens`,
    and load the active `User` from PostgreSQL.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Bearer token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_token = credentials.credentials
    try:
        payload = decode_token(raw_token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials or token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    token_type = payload.get("type", "access")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type. Access token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jti = payload.get("jti")
    sub = payload.get("sub")
    exp = payload.get("exp")
    if not jti or not sub or not exp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if is_jti_revoked_in_memory(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has been invalidated (logged out).",
            headers={"WWW-Authenticate": "Bearer"},
        )

    revoked_stmt = select(RevokedToken.id).where(RevokedToken.jti == jti)
    revoked_res = await db.execute(revoked_stmt)
    if revoked_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has been invalidated (logged out).",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_uuid = uuid.UUID(str(sub))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user subject in token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_stmt = select(User).where(User.id == user_uuid)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
    return SessionContext(
        user=user,
        jti=jti,
        expires_at=expires_at,
        raw_token=raw_token,
        payload=payload,
    )


async def get_current_user(
    session: Annotated[SessionContext, Depends(get_current_session)],
) -> User:
    """Return the authenticated and active SQLAlchemy `User` instance."""
    return session.user


def require_roles(*allowed_roles: UserRole | str) -> Callable:
    """RBAC Dependency Factory: Restricts endpoint access to users whose role matches
    any of the `allowed_roles` (supports both canonical names `ORGANIZER`, `MENTOR`,
    `PARTICIPANT`, `GUEST` and aliases `ADMIN`, `MANAGER`, `MEMBER`, `GUEST`).
    """
    resolved_allowed: frozenset[UserRole] = frozenset(
        resolve_role(r) for r in allowed_roles
    )

    async def role_checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        user_role = resolve_role(current_user.role)
        if user_role not in resolved_allowed:
            allowed_names = ", ".join(sorted(r.value for r in resolved_allowed))
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied for role '{user_role.value}'. "
                    f"Required role(s): [{allowed_names}]."
                ),
            )
        return current_user

    return role_checker


def require_permissions(*required_permissions: Permission) -> Callable:
    """RBAC Capability Dependency Factory: Enforces granular capabilities from the RBAC Matrix
    (e.g., `Permission.MANAGE_USERS`, `Permission.DELETE_RESOURCES`).
    """

    async def permission_checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        user_role = resolve_role(current_user.role)
        missing = [
            perm.value
            for perm in required_permissions
            if not has_permission(user_role, perm)
        ]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Role '{user_role.value}' lacks required permission(s): "
                    f"{', '.join(missing)}."
                ),
            )
        return current_user

    return permission_checker
