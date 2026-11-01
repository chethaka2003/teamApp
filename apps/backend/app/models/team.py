from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    desc,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.roles import AllocationMethod
from app.db.session import Base

if TYPE_CHECKING:
    from app.models.gamification import PointTransaction
    from app.models.poll import TeamPoll
    from app.models.user import User


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (
        Index("idx_teams_total_points_desc", desc("total_points")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    invite_code: Mapped[str] = mapped_column(
        String(16), unique=True, index=True, nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    mentor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    max_capacity: Mapped[int] = mapped_column(
        Integer, nullable=False, default=6, server_default="6"
    )
    total_points: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    is_locked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    mentor: Mapped[User | None] = relationship(
        "User",
        back_populates="mentored_teams",
        foreign_keys=[mentor_id],
    )
    creator: Mapped[User] = relationship(
        "User",
        back_populates="created_teams",
        foreign_keys=[created_by],
    )
    members: Mapped[list[TeamMember]] = relationship(
        "TeamMember",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    mentor_assignments: Mapped[list[TeamMentor]] = relationship(
        "TeamMentor",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    point_transactions: Mapped[list[PointTransaction]] = relationship(
        "PointTransaction",
        back_populates="target_team",
        foreign_keys="PointTransaction.target_team_id",
    )
    polls: Mapped[list[TeamPoll]] = relationship(
        "TeamPoll",
        back_populates="team",
        cascade="all, delete-orphan",
    )


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_team_members_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_team_lead: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    allocation_method: Mapped[AllocationMethod] = mapped_column(
        Enum(AllocationMethod, name="allocation_method_enum"),
        nullable=False,
        default=AllocationMethod.MANUAL,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    team: Mapped[Team] = relationship("Team", back_populates="members")
    user: Mapped[User] = relationship("User", back_populates="team_membership")


class TeamMentor(Base):
    """Enforces Requirement 6 & 7: A Mentor can only join 1 team (`uq_team_mentors_mentor_id`),
    while 1 Team can have multiple Mentors (`team_id` is indexed, non-unique).
    """

    __tablename__ = "team_mentors"
    __table_args__ = (
        UniqueConstraint("mentor_id", name="uq_team_mentors_mentor_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mentor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    team: Mapped[Team] = relationship("Team", back_populates="mentor_assignments")
    mentor: Mapped[User] = relationship("User", back_populates="mentor_team_assignment")
