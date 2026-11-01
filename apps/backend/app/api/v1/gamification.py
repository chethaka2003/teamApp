from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    require_permissions,
    require_roles,
)
from app.core.roles import Permission, UserRole
from app.db.session import get_db
from app.models.event import Event
from app.models.gamification import PointTransaction
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.gamification import (
    ParticipantLeaderboardEntry,
    PointAwardRequest,
    PointTransactionResponse,
    ScheduleEventItem,
    TeamLeaderboardEntry,
)

router = APIRouter(prefix="/gamification", tags=["Gamification & Leaderboard"])


@router.post(
    "/points/award",
    response_model=PointTransactionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_roles(UserRole.ORGANIZER, UserRole.MENTOR)),
        Depends(require_permissions(Permission.AWARD_POINTS)),
    ],
)
async def award_points(
    payload: PointAwardRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PointTransaction:
    """Award or deduct points for an Individual Member (`target_user_id`) and/or an
    Entire Team (`target_team_id`), optionally tied to an `event_id` (Requirements 5 & 8).
    """
    if payload.target_team_id is None and payload.target_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must specify at least one of target_team_id or target_user_id.",
        )

    if payload.points_delta == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="points_delta cannot be zero.",
        )

    if payload.event_id is not None:
        evt_res = await db.execute(select(Event).where(Event.id == payload.event_id))
        if evt_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Selected Event not found.",
            )

    if payload.target_team_id is not None:
        team_res = await db.execute(
            select(Team).where(Team.id == payload.target_team_id)
        )
        team = team_res.scalar_one_or_none()
        if team is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target team not found.",
            )
        team.total_points = (team.total_points or 0) + payload.points_delta

    if payload.target_user_id is not None:
        user_res = await db.execute(
            select(User).where(User.id == payload.target_user_id)
        )
        target_user = user_res.scalar_one_or_none()
        if target_user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target user not found.",
            )
        target_user.individual_points = (
            target_user.individual_points or 0
        ) + payload.points_delta

    tx = PointTransaction(
        target_team_id=payload.target_team_id,
        target_user_id=payload.target_user_id,
        event_id=payload.event_id,
        awarded_by_id=current_user.id,
        badge_id=payload.badge_id,
        points_delta=payload.points_delta,
        category=payload.category,
        reason=payload.reason.strip(),
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return tx


@router.get(
    "/leaderboard/teams",
    response_model=list[TeamLeaderboardEntry],
    dependencies=[Depends(require_permissions(Permission.VIEW_PUBLIC_RESOURCES))],
)
async def get_team_leaderboard(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TeamLeaderboardEntry]:
    """Return global team leaderboard ordered by `total_points DESC` (Ranked 1st, 2nd, 3rd, etc.)."""
    stmt = (
        select(
            Team,
            func.count(TeamMember.id).label("member_count"),
        )
        .outerjoin(TeamMember, TeamMember.team_id == Team.id)
        .group_by(Team.id)
        .order_by(Team.total_points.desc(), Team.name.asc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        TeamLeaderboardEntry(
            rank=idx + 1,
            team_id=team.id,
            team_name=team.name,
            invite_code=team.invite_code,
            total_points=team.total_points,
            member_count=int(member_count or 0),
        )
        for idx, (team, member_count) in enumerate(rows)
    ]


@router.get(
    "/leaderboard/participants",
    response_model=list[ParticipantLeaderboardEntry],
    dependencies=[Depends(require_permissions(Permission.VIEW_PUBLIC_RESOURCES))],
)
async def get_participant_leaderboard(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ParticipantLeaderboardEntry]:
    """Return global individual leaderboard ordered by `individual_points DESC` (Ranked 1st, 2nd, 3rd, etc.)."""
    stmt = (
        select(User)
        .where(User.is_active.is_(True))
        .order_by(User.individual_points.desc(), User.full_name.asc())
        .limit(100)
    )
    users = (await db.execute(stmt)).scalars().all()
    return [
        ParticipantLeaderboardEntry(
            rank=idx + 1,
            user_id=u.id,
            full_name=u.full_name,
            department_or_track=u.department_or_track,
            individual_points=u.individual_points,
        )
        for idx, u in enumerate(users)
    ]


@router.get("/schedule", response_model=list[ScheduleEventItem])
async def get_summit_schedule() -> list[ScheduleEventItem]:
    """Return dynamic summit schedule sessions for mobile schedule display and offline caching."""
    return [
        ScheduleEventItem(
            id="evt-01",
            title="Opening Keynote & Summit Kickoff",
            description="Welcome address, summit rules, and challenge track overview.",
            location="Main Auditorium",
            track="General",
            starts_at=datetime(2026, 10, 25, 9, 0, tzinfo=timezone.utc),
            ends_at=datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc),
            speaker="Dr. Elena Vance",
        ),
        ScheduleEventItem(
            id="evt-02",
            title="Team Formation & QR Code Check-In",
            description="Scan your team QR code or enter your 6-character invite code to lock in your roster.",
            location="Breakout Hall A",
            track="Teams",
            starts_at=datetime(2026, 10, 25, 10, 15, tzinfo=timezone.utc),
            ends_at=datetime(2026, 10, 25, 11, 30, tzinfo=timezone.utc),
            speaker="Summit Organizers",
        ),
        ScheduleEventItem(
            id="evt-03",
            title="Architecture & Rapid Prototyping Sprint",
            description="Mentors circulate across teams to review system designs and award milestone bonus points.",
            location="Innovation Lab",
            track="Engineering",
            starts_at=datetime(2026, 10, 25, 12, 30, tzinfo=timezone.utc),
            ends_at=datetime(2026, 10, 25, 15, 0, tzinfo=timezone.utc),
            speaker="Mentor Panel",
        ),
        ScheduleEventItem(
            id="evt-04",
            title="Final Pitch & Live Leaderboard Awards",
            description="Final team demos, live audience polling, and trophy ceremony.",
            location="Main Auditorium",
            track="Finals",
            starts_at=datetime(2026, 10, 25, 16, 0, tzinfo=timezone.utc),
            ends_at=datetime(2026, 10, 25, 18, 0, tzinfo=timezone.utc),
            speaker="Judging Committee",
        ),
    ]
