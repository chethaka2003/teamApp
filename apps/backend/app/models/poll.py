from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.roles import PollStatus
from app.db.session import Base

if TYPE_CHECKING:
    from app.models.team import Team
    from app.models.user import User


class TeamPoll(Base):
    __tablename__ = "team_polls"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    question: Mapped[str] = mapped_column(String(512), nullable=False)
    is_multiple_choice: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_anonymous: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    status: Mapped[PollStatus] = mapped_column(
        Enum(PollStatus, name="poll_status_enum"),
        nullable=False,
        default=PollStatus.OPEN,
        server_default="OPEN",
        index=True,
    )
    closes_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    team: Mapped[Team] = relationship("Team", back_populates="polls")
    created_by: Mapped[User] = relationship(
        "User",
        back_populates="created_polls",
        foreign_keys=[created_by_id],
    )
    options: Mapped[list[PollOption]] = relationship(
        "PollOption",
        back_populates="poll",
        cascade="all, delete-orphan",
        order_by="PollOption.display_order",
    )
    votes: Mapped[list[PollVote]] = relationship(
        "PollVote",
        back_populates="poll",
        cascade="all, delete-orphan",
    )


class PollOption(Base):
    __tablename__ = "poll_options"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    poll_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_polls.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    option_text: Mapped[str] = mapped_column(String(255), nullable=False)
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # Relationships
    poll: Mapped[TeamPoll] = relationship("TeamPoll", back_populates="options")
    votes: Mapped[list[PollVote]] = relationship(
        "PollVote",
        back_populates="option",
        cascade="all, delete-orphan",
    )


class PollVote(Base):
    __tablename__ = "poll_votes"
    __table_args__ = (
        UniqueConstraint(
            "poll_id",
            "option_id",
            "voter_id",
            name="uq_poll_votes_poll_option_voter",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    poll_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_polls.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    option_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("poll_options.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    voter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    voted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    poll: Mapped[TeamPoll] = relationship("TeamPoll", back_populates="votes")
    option: Mapped[PollOption] = relationship("PollOption", back_populates="votes")
    voter: Mapped[User] = relationship("User", back_populates="poll_votes")
