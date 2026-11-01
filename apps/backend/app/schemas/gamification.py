from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.roles import PointCategory


class PointAwardRequest(BaseModel):
    target_team_id: uuid.UUID | None = None
    target_user_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    points_delta: int = Field(..., description="Positive or negative integer points")
    category: PointCategory = Field(default=PointCategory.MILESTONE)
    reason: str = Field(..., min_length=2, max_length=512)
    badge_id: uuid.UUID | None = None


class PointTransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    target_team_id: uuid.UUID | None = None
    target_user_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    awarded_by_id: uuid.UUID
    badge_id: uuid.UUID | None = None
    points_delta: int
    category: PointCategory
    reason: str
    created_at: datetime


class TeamLeaderboardEntry(BaseModel):
    rank: int
    team_id: uuid.UUID
    team_name: str
    invite_code: str
    total_points: int
    member_count: int


class ParticipantLeaderboardEntry(BaseModel):
    rank: int
    user_id: uuid.UUID
    full_name: str
    department_or_track: str | None = None
    individual_points: int


class ScheduleEventItem(BaseModel):
    id: str
    title: str
    description: str
    location: str
    track: str
    starts_at: datetime
    ends_at: datetime
    speaker: str | None = None
