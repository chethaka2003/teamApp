from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EventCreateRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=200)
    default_points: int = Field(default=50, ge=0, le=10000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class EventUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=200)
    default_points: int | None = Field(default=None, ge=0, le=10000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool | None = None


class EventParticipantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    user_id: uuid.UUID
    joined_at: datetime
    user_full_name: str | None = None
    user_role: str | None = None


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None = None
    location: str | None = None
    default_points: int
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool
    created_by: uuid.UUID
    created_at: datetime
    participant_count: int = 0
    is_joined: bool = False
    participants: list[EventParticipantResponse] = Field(default_factory=list)
