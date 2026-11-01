"""SQLAlchemy 2.0 ORM models package.

Importing all models here ensures they are registered on `Base.metadata`
for Alembic autogeneration.
"""

from app.core.roles import (
    AllocationMethod,
    Permission,
    PointCategory,
    PollStatus,
    UserRole,
)
from app.models.event import Event, EventParticipant
from app.models.gamification import PointBadge, PointTransaction
from app.models.poll import PollOption, PollVote, TeamPoll
from app.models.session import RevokedToken
from app.models.team import Team, TeamMember, TeamMentor
from app.models.user import User

__all__ = [
    "AllocationMethod",
    "Event",
    "EventParticipant",
    "Permission",
    "PointBadge",
    "PointCategory",
    "PointTransaction",
    "PollOption",
    "PollStatus",
    "PollVote",
    "RevokedToken",
    "Team",
    "TeamMember",
    "TeamMentor",
    "TeamPoll",
    "User",
    "UserRole",
]
