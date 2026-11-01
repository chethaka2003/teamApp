from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.roles import PointCategory
from app.db.session import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.team import Team
    from app.models.user import User


class PointBadge(Base):
    __tablename__ = "point_badges"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_points: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # Relationships
    creator: Mapped[User] = relationship(
        "User",
        back_populates="created_badges",
        foreign_keys=[created_by],
    )
    transactions: Mapped[list[PointTransaction]] = relationship(
        "PointTransaction",
        back_populates="badge",
    )


class PointTransaction(Base):
    __tablename__ = "point_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    target_team_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    awarded_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    badge_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("point_badges.id", ondelete="SET NULL"),
        nullable=True,
    )
    points_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[PointCategory] = mapped_column(
        Enum(PointCategory, name="point_category_enum"),
        nullable=False,
        index=True,
    )
    reason: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    # Relationships
    target_team: Mapped[Team | None] = relationship(
        "Team",
        back_populates="point_transactions",
        foreign_keys=[target_team_id],
    )
    target_user: Mapped[User | None] = relationship(
        "User",
        back_populates="received_point_transactions",
        foreign_keys=[target_user_id],
    )
    event: Mapped[Event | None] = relationship(
        "Event",
        back_populates="point_transactions",
        foreign_keys=[event_id],
    )
    awarded_by: Mapped[User] = relationship(
        "User",
        back_populates="awarded_point_transactions",
        foreign_keys=[awarded_by_id],
    )
    badge: Mapped[PointBadge | None] = relationship(
        "PointBadge",
        back_populates="transactions",
        foreign_keys=[badge_id],
    )
