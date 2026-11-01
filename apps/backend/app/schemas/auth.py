from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.roles import Permission, UserRole

EmailAddress = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=5,
        max_length=255,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    ),
]


class LoginRequest(BaseModel):
    email: EmailAddress
    password: str = Field(..., min_length=6, max_length=128)


class RegisterRequest(BaseModel):
    email: EmailAddress
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=255)
    role: UserRole = Field(default=UserRole.PARTICIPANT)
    department_or_track: str | None = Field(default=None, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_at: datetime
    jti: str
    role: UserRole
    permissions: list[Permission]


class LogoutRequest(BaseModel):
    refresh_token: str | None = Field(
        default=None,
        description="Optional refresh token to invalidate alongside the current access token.",
    )


class LogoutResponse(BaseModel):
    status: str = "logged_out"
    revoked_jti: str
    revoked_at: datetime


class RoleUpdateRequest(BaseModel):
    role: str = Field(
        ...,
        description="Target role (ORGANIZER/ADMIN, MENTOR/MANAGER, PARTICIPANT/MEMBER, or GUEST).",
    )


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    avatar_url: str | None = None
    department_or_track: str | None = None
    individual_points: int = 0
    is_active: bool = True
    created_at: datetime
