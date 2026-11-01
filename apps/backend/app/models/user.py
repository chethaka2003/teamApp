from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.roles import UserRole
from app.db.session import Base

if TYPE_CHECKING:
    from app.models.event import Event, EventParticipant
    from app.models.gamification import PointBadge, PointTransaction
    from app.models.poll import PollVote, TeamPoll
    from app.models.session import RevokedToken
    from app.models.team import Team, TeamMember, TeamMentor


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role_enum"),
        nullable=False,
        default=UserRole.PARTICIPANT,
        index=True,
    )
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    department_or_track: Mapped[str | None] = mapped_column(String(128), nullable=True)
    individual_points: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    mentored_teams: Mapped[list[Team]] = relationship(
        "Team",
        back_populates="mentor",
        foreign_keys="Team.mentor_id",
    )
    mentor_team_assignment: Mapped[TeamMentor | None] = relationship(
        "TeamMentor",
        back_populates="mentor",
        uselist=False,
        cascade="all, delete-orphan",
    )
    created_teams: Mapped[list[Team]] = relationship(
        "Team",
        back_populates="creator",
        foreign_keys="Team.created_by",
    )
    team_membership: Mapped[TeamMember | None] = relationship(
        "TeamMember",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    created_events: Mapped[list[Event]] = relationship(
        "Event",
        back_populates="creator",
        foreign_keys="Event.created_by",
    )
    event_participations: Mapped[list[EventParticipant]] = relationship(
        "EventParticipant",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    created_badges: Mapped[list[PointBadge]] = relationship(
        "PointBadge",
        back_populates="creator",
        foreign_keys="PointBadge.created_by",
    )
    received_point_transactions: Mapped[list[PointTransaction]] = relationship(
        "PointTransaction",
        back_populates="target_user",
        foreign_keys="PointTransaction.target_user_id",
    )
    awarded_point_transactions: Mapped[list[PointTransaction]] = relationship(
        "PointTransaction",
        back_populates="awarded_by",
        foreign_keys="PointTransaction.awarded_by_id",
    )
    created_polls: Mapped[list[TeamPoll]] = relationship(
        "TeamPoll",
        back_populates="created_by",
        foreign_keys="TeamPoll.created_by_id",
    )
    poll_votes: Mapped[list[PollVote]] = relationship(
        "PollVote",
        back_populates="voter",
        cascade="all, delete-orphan",
    )
    revoked_tokens: Mapped[list[RevokedToken]] = relationship(
        "RevokedToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
