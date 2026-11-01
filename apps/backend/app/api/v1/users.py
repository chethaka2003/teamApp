from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionContext,
    get_current_session,
    get_current_user,
    require_permissions,
    require_roles,
)
from app.core.roles import Permission, UserRole, resolve_role
from app.core.security import hash_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import RoleUpdateRequest, UserResponse
from app.schemas.team import UserCreateRequest, UserUpdateRequest

router = APIRouter(prefix="/users", tags=["Users & RBAC"])


@router.get("/me", response_model=UserResponse)
async def read_current_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Return the authenticated user's profile (accessible to all authenticated roles)."""
    return current_user


@router.get("/me/permissions")
async def read_current_permissions(
    session: Annotated[SessionContext, Depends(get_current_session)],
) -> dict:
    """Inspect the caller's resolved role and active RBAC permissions."""
    return {
        "user_id": str(session.user.id),
        "role": session.role.value,
        "permissions": sorted(p.value for p in session.permissions),
    }


@router.get(
    "",
    response_model=list[UserResponse],
    dependencies=[
        Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
        Depends(require_permissions(Permission.VIEW_USERS)),
    ],
)
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    role: UserRole | None = Query(default=None),
    search: str | None = Query(
        default=None,
        description="Search members by name, email, or department/track.",
    ),
) -> list[User]:
    """List and search users in the directory (Requirement 3).
    Restricted to ORGANIZER (Admin) and MENTOR (Manager).
    """
    stmt = select(User).order_by(User.created_at.desc())
    if role is not None:
        stmt = stmt.where(User.role == resolve_role(role))
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                User.full_name.ilike(q),
                User.email.ilike(q),
                User.department_or_track.ilike(q),
            )
        )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_roles(UserRole.ADMIN)),
        Depends(require_permissions(Permission.MANAGE_USERS)),
    ],
)
async def create_user(
    payload: UserCreateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Create a new user account directly. Restricted strictly to ORGANIZER (Admin)."""
    existing_stmt = select(User).where(User.email == payload.email.lower())
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    canonical_role = resolve_role(payload.role)
    new_user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=canonical_role,
        department_or_track=payload.department_or_track,
        avatar_url=payload.avatar_url,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Retrieve a user by ID (used when Organizer scans a Member/Mentor Profile QR code)."""
    caller_role = resolve_role(current_user.role)
    if user_id != current_user.id and caller_role not in {
        UserRole.ORGANIZER,
        UserRole.MENTOR,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are only permitted to view your own user profile.",
        )

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return target_user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Update user profile attributes."""
    caller_role = resolve_role(current_user.role)
    is_admin = caller_role == UserRole.ORGANIZER

    if user_id != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin (ORGANIZER) can update another user's account.",
        )

    if (payload.role is not None or payload.is_active is not None) and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin (ORGANIZER) can modify role or active status.",
        )

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if payload.full_name is not None:
        target_user.full_name = payload.full_name
    if payload.department_or_track is not None:
        target_user.department_or_track = payload.department_or_track
    if payload.avatar_url is not None:
        target_user.avatar_url = payload.avatar_url
    if payload.is_active is not None:
        target_user.is_active = payload.is_active
    if payload.role is not None:
        try:
            target_user.role = resolve_role(payload.role)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc

    await db.commit()
    await db.refresh(target_user)
    return target_user


@router.patch(
    "/{user_id}/role",
    response_model=UserResponse,
    dependencies=[
        Depends(require_roles(UserRole.ADMIN)),
        Depends(require_permissions(Permission.MANAGE_USERS)),
    ],
)
async def update_user_role(
    user_id: uuid.UUID,
    payload: RoleUpdateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Promote or demote a user's role (`ORGANIZER`, `MENTOR`, `PARTICIPANT`).
    Restricted strictly to ORGANIZER (Admin) with `MANAGE_USERS` permission.
    """
    try:
        new_role = resolve_role(payload.role)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    target_user.role = new_role
    await db.commit()
    await db.refresh(target_user)
    return target_user


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(require_roles(UserRole.ADMIN)),
        Depends(
            require_permissions(
                Permission.MANAGE_USERS,
                Permission.DELETE_RESOURCES,
            )
        ),
    ],
)
async def delete_user_resource(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a user resource. Restricted strictly to ORGANIZER (Admin)."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own active account.",
        )

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    await db.delete(target_user)
    await db.commit()
