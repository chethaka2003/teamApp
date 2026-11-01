from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.roles import AllocationMethod, UserRole

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


class UserCreateRequest(BaseModel):
    email: EmailAddress
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=255)
    role: UserRole = Field(default=UserRole.PARTICIPANT)
    department_or_track: str | None = Field(default=None, max_length=128)
    avatar_url: str | None = Field(default=None, max_length=512)


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    department_or_track: str | None = Field(default=None, max_length=128)
    avatar_url: str | None = Field(default=None, max_length=512)
    is_active: bool | None = None
    role: str | None = None


class TeamMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    user_id: uuid.UUID
    is_team_lead: bool
    allocation_method: AllocationMethod
    joined_at: datetime
    user_full_name: str | None = None
    user_email: str | None = None
    individual_points: int = 0


class TeamMentorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    mentor_id: uuid.UUID
    joined_at: datetime
    mentor_full_name: str | None = None
    mentor_email: str | None = None


class TeamCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    description: str | None = Field(default=None, max_length=1000)
    max_capacity: int = Field(default=6, ge=1, le=50)
    mentor_id: uuid.UUID | None = None


class TeamUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=128)
    description: str | None = Field(default=None, max_length=1000)
    max_capacity: int | None = Field(default=None, ge=1, le=50)
    mentor_id: uuid.UUID | None = None
    is_locked: bool | None = None


class TeamMemberAddRequest(BaseModel):
    user_id: uuid.UUID
    is_team_lead: bool = False
    allocation_method: AllocationMethod = AllocationMethod.MANUAL


class TeamJoinRequest(BaseModel):
    invite_code: str = Field(..., min_length=4, max_length=64)


class TeamResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    invite_code: str
    qr_payload: str = ""
    description: str | None = None
    mentor_id: uuid.UUID | None = None
    created_by: uuid.UUID
    max_capacity: int
    total_points: int
    is_locked: bool
    created_at: datetime
    member_count: int = 0
    mentor_count: int = 0
    members: list[TeamMemberResponse] = Field(default_factory=list)
    mentors: list[TeamMentorResponse] = Field(default_factory=list)
