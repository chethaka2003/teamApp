from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionContext, get_current_session
from app.core.roles import ROLE_PERMISSIONS, UserRole, resolve_role
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    revoke_jti_in_memory,
    verify_password,
)
from app.db.bootstrap import ensure_default_organizer
from app.db.session import get_db
from app.models.session import RevokedToken
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    LogoutResponse,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_user(
    payload: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Register a new summit account.
    Requirement 2: Direct signup is restricted to ORGANIZER and PARTICIPANT (Member).
    Mentors must be promoted by an Organizer from the Role Management dashboard.
    """
    await ensure_default_organizer(db)

    canonical_role = resolve_role(payload.role)
    if canonical_role == UserRole.MENTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Direct signup as Mentor is disabled. Please register as a "
                "Participant/Member and ask an Organizer to promote your account."
            ),
        )

    existing_stmt = select(User).where(User.email == payload.email.lower())
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    new_user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=canonical_role,
        department_or_track=payload.department_or_track,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Authenticate user credentials (`email` + `password`) and issue a signed
    JWT access token and refresh token with RBAC role and permissions.
    Automatically seeds the default Organizer account if the users table is empty.
    """
    await ensure_default_organizer(db)

    stmt = select(User).where(User.email == payload.email.lower())
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled.",
        )

    canonical_role = resolve_role(user.role)
    access_token, jti, expires_at = create_access_token(
        subject=user.id,
        role=canonical_role,
    )
    refresh_token, _, _ = create_refresh_token(
        subject=user.id,
        role=canonical_role,
    )

    permissions = sorted(
        ROLE_PERMISSIONS.get(canonical_role, frozenset()),
        key=lambda p: p.value,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_at=expires_at,
        jti=jti,
        role=canonical_role,
        permissions=permissions,
    )


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    session: Annotated[SessionContext, Depends(get_current_session)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: Annotated[LogoutRequest | None, Body()] = None,
) -> LogoutResponse:
    """Invalidate the current JWT session token (and optional refresh token)
    by persisting its `jti` claim in `revoked_tokens` and the in-memory revocation cache.
    """
    now = datetime.now(timezone.utc)
    revoke_jti_in_memory(session.jti)

    revoked_entry = RevokedToken(
        jti=session.jti,
        token_type="access",
        user_id=session.user.id,
        expires_at=session.expires_at,
        revoked_at=now,
    )
    db.add(revoked_entry)

    if body and body.refresh_token:
        try:
            refresh_payload = decode_token(body.refresh_token)
            refresh_jti = refresh_payload.get("jti")
            refresh_exp = refresh_payload.get("exp")
            if refresh_jti and refresh_exp:
                revoke_jti_in_memory(refresh_jti)
                db.add(
                    RevokedToken(
                        jti=refresh_jti,
                        token_type="refresh",
                        user_id=session.user.id,
                        expires_at=datetime.fromtimestamp(
                            refresh_exp, tz=timezone.utc
                        ),
                        revoked_at=now,
                    )
                )
        except JWTError:
            pass

    await db.commit()
    return LogoutResponse(
        status="logged_out",
        revoked_jti=session.jti,
        revoked_at=now,
    )
