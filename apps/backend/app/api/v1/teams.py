from __future__ import annotations

import secrets
import string
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_user,
    require_permissions,
    require_roles,
)
from app.core.roles import AllocationMethod, Permission, UserRole, resolve_role
from app.db.session import get_db
from app.models.team import Team, TeamMember, TeamMentor
from app.models.user import User
from app.schemas.team import (
    TeamCreateRequest,
    TeamJoinRequest,
    TeamMemberAddRequest,
    TeamMemberResponse,
    TeamMentorResponse,
    TeamResponse,
    TeamUpdateRequest,
)

router = APIRouter(prefix="/teams", tags=["Teams & Allocation"])


def _generate_invite_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _extract_code(raw_code: str) -> str:
    trimmed = raw_code.strip()
    if "code=" in trimmed.lower():
        parts = trimmed.split("code=", 1)[1].split("&", 1)[0]
        return parts.strip().upper()
    return trimmed.upper()


def _team_query_with_relations():
    return (
        select(Team)
        .options(
            selectinload(Team.members).selectinload(TeamMember.user),
            selectinload(Team.mentor_assignments).selectinload(TeamMentor.mentor),
        )
        .execution_options(populate_existing=True)
    )


def _serialize_team(team: Team) -> TeamResponse:
    members_list: list[TeamMemberResponse] = []
    for m in team.members:
        members_list.append(
            TeamMemberResponse(
                id=m.id,
                team_id=m.team_id,
                user_id=m.user_id,
                is_team_lead=m.is_team_lead,
                allocation_method=m.allocation_method,
                joined_at=m.joined_at,
                user_full_name=m.user.full_name if m.user else None,
                user_email=m.user.email if m.user else None,
                individual_points=m.user.individual_points if m.user else 0,
            )
        )

    mentors_list: list[TeamMentorResponse] = []
    for ma in team.mentor_assignments:
        mentors_list.append(
            TeamMentorResponse(
                id=ma.id,
                team_id=ma.team_id,
                mentor_id=ma.mentor_id,
                joined_at=ma.joined_at,
                mentor_full_name=ma.mentor.full_name if ma.mentor else None,
                mentor_email=ma.mentor.email if ma.mentor else None,
            )
        )

    return TeamResponse(
        id=team.id,
        name=team.name,
        invite_code=team.invite_code,
        qr_payload=f"teamapp://join?code={team.invite_code}",
        description=team.description,
        mentor_id=team.mentor_id,
        created_by=team.created_by,
        max_capacity=team.max_capacity,
        total_points=team.total_points,
        is_locked=team.is_locked,
        created_at=team.created_at,
        member_count=len(members_list),
        mentor_count=len(mentors_list),
        members=members_list,
        mentors=mentors_list,
    )


@router.get("", response_model=list[TeamResponse])
async def list_teams(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: str = "accessible",
) -> list[TeamResponse]:
    """Retrieve a list of teams accessible by the authenticated user."""
    caller_role = resolve_role(current_user.role)
    stmt = _team_query_with_relations().order_by(
        Team.total_points.desc(), Team.created_at.desc()
    )

    if scope != "all" and caller_role != UserRole.ORGANIZER:
        if caller_role == UserRole.MENTOR:
            mentor_team_ids = select(TeamMentor.team_id).where(
                TeamMentor.mentor_id == current_user.id
            )
            stmt = stmt.where(
                or_(
                    Team.id.in_(mentor_team_ids),
                    Team.mentor_id == current_user.id,
                    Team.created_by == current_user.id,
                )
            )
        elif caller_role == UserRole.PARTICIPANT:
            member_team_ids = select(TeamMember.team_id).where(
                TeamMember.user_id == current_user.id
            )
            stmt = stmt.where(
                or_(
                    Team.id.in_(member_team_ids),
                    Team.created_by == current_user.id,
                )
            )

    result = await db.execute(stmt)
    teams = result.scalars().unique().all()
    return [_serialize_team(t) for t in teams]


@router.post(
    "",
    response_model=TeamResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
        Depends(require_permissions(Permission.CREATE_RESOURCES)),
    ],
)
async def create_team(
    payload: TeamCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamResponse:
    """Create a new team instance with a generated 6-character `invite_code` and `qr_payload`."""
    existing_stmt = select(Team).where(Team.name == payload.name.strip())
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A team with this name already exists.",
        )

    invite_code = _generate_invite_code()
    for _ in range(5):
        code_check = await db.execute(
            select(Team.id).where(Team.invite_code == invite_code)
        )
        if code_check.scalar_one_or_none() is None:
            break
        invite_code = _generate_invite_code()

    caller_role = resolve_role(current_user.role)
    mentor_id = payload.mentor_id
    if mentor_id is None and caller_role == UserRole.MENTOR:
        mentor_id = current_user.id

    new_team = Team(
        name=payload.name.strip(),
        invite_code=invite_code,
        description=payload.description,
        max_capacity=payload.max_capacity,
        mentor_id=mentor_id,
        created_by=current_user.id,
    )
    db.add(new_team)
    await db.commit()

    stmt = _team_query_with_relations().where(Team.id == new_team.id)
    refreshed = (await db.execute(stmt)).scalar_one()
    return _serialize_team(refreshed)


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    team_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamResponse:
    """Retrieve a specific team by ID with its member and mentor rosters."""
    stmt = _team_query_with_relations().where(Team.id == team_id)
    result = await db.execute(stmt)
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )
    return _serialize_team(team)


@router.patch(
    "/{team_id}",
    response_model=TeamResponse,
    dependencies=[
        Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
        Depends(require_permissions(Permission.UPDATE_RESOURCES)),
    ],
)
async def update_team(
    team_id: uuid.UUID,
    payload: TeamUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamResponse:
    """Update a team's details."""
    stmt = _team_query_with_relations().where(Team.id == team_id)
    result = await db.execute(stmt)
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    caller_role = resolve_role(current_user.role)
    mentor_ids = {ma.mentor_id for ma in team.mentor_assignments}
    if (
        caller_role == UserRole.MENTOR
        and team.mentor_id != current_user.id
        and current_user.id not in mentor_ids
        and team.created_by != current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mentors can only update teams they oversee or created.",
        )

    if payload.name is not None:
        team.name = payload.name.strip()
    if payload.description is not None:
        team.description = payload.description
    if payload.max_capacity is not None:
        team.max_capacity = payload.max_capacity
    if payload.mentor_id is not None:
        team.mentor_id = payload.mentor_id
    if payload.is_locked is not None:
        team.is_locked = payload.is_locked

    await db.commit()
    refreshed = (await db.execute(stmt)).scalar_one()
    return _serialize_team(refreshed)


@router.delete(
    "/{team_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(require_roles(UserRole.ADMIN)),
        Depends(require_permissions(Permission.DELETE_RESOURCES)),
    ],
)
async def delete_team(
    team_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a specific team. Strictly requires the Admin (`ORGANIZER`) role."""
    stmt = select(Team).where(Team.id == team_id)
    result = await db.execute(stmt)
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    await db.delete(team)
    await db.commit()


@router.post(
    "/{team_id}/members",
    response_model=TeamResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_roles(UserRole.ADMIN)),
        Depends(require_permissions(Permission.ALLOCATE_TEAMS)),
    ],
)
async def add_team_member(
    team_id: uuid.UUID,
    payload: TeamMemberAddRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamResponse:
    """Allocate a participant to a team (Admin/Organizer only). Enforces single-team constraint."""
    stmt = _team_query_with_relations().where(Team.id == team_id)
    team = (await db.execute(stmt)).scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    if len(team.members) >= team.max_capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team has reached maximum capacity.",
        )

    existing_member = await db.execute(
        select(TeamMember).where(TeamMember.user_id == payload.user_id)
    )
    if existing_member.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already assigned to a team.",
        )

    member = TeamMember(
        team_id=team.id,
        user_id=payload.user_id,
        is_team_lead=payload.is_team_lead,
        allocation_method=payload.allocation_method,
    )
    db.add(member)
    await db.commit()

    refreshed = (await db.execute(stmt)).scalar_one()
    return _serialize_team(refreshed)


@router.post("/join", response_model=TeamResponse)
async def join_team_by_invite_code(
    payload: TeamJoinRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamResponse:
    """Join a team via QR code or `invite_code`.
    - If caller is a PARTICIPANT (Member): joins `team_members` (1 team max per participant).
    - If caller is a MENTOR: joins `team_mentors` enforcing Requirement 6:
      A Mentor can only join 1 team, while 1 Team can have multiple Mentors.
    """
    code = _extract_code(payload.invite_code)
    stmt = _team_query_with_relations().where(Team.invite_code == code)
    team = (await db.execute(stmt)).scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid team invite code or QR payload.",
        )

    caller_role = resolve_role(current_user.role)
    if caller_role == UserRole.MENTOR:
        existing_mentor = (
            await db.execute(
                select(TeamMentor).where(TeamMentor.mentor_id == current_user.id)
            )
        ).scalar_one_or_none()
        if existing_mentor is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A Mentor can only join 1 team. You are already mentoring a team.",
            )

        mentor_assignment = TeamMentor(
            team_id=team.id,
            mentor_id=current_user.id,
        )
        if team.mentor_id is None:
            team.mentor_id = current_user.id
        db.add(mentor_assignment)
        await db.commit()
        refreshed = (await db.execute(stmt)).scalar_one()
        return _serialize_team(refreshed)

    if team.is_locked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This team is locked and no longer accepting members.",
        )

    if len(team.members) >= team.max_capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This team is already full.",
        )

    existing_member = await db.execute(
        select(TeamMember).where(TeamMember.user_id == current_user.id)
    )
    if existing_member.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already belong to a summit team.",
        )

    member = TeamMember(
        team_id=team.id,
        user_id=current_user.id,
        is_team_lead=False,
        allocation_method=AllocationMethod.INVITE_CODE,
    )
    db.add(member)
    await db.commit()

    refreshed = (await db.execute(stmt)).scalar_one()
    return _serialize_team(refreshed)


@router.post(
    "/mentor/join",
    response_model=TeamResponse,
    dependencies=[Depends(require_roles(UserRole.MENTOR))],
)
async def mentor_join_team_by_qr(
    payload: TeamJoinRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamResponse:
    """Dedicated endpoint for Mentors scanning a Team QR Code (Requirement 6 & 7).
    Enforces: A Mentor can only join 1 team (`uq_team_mentors_mentor_id`),
    but 1 Team can have multiple Mentors.
    """
    code = _extract_code(payload.invite_code)
    stmt = _team_query_with_relations().where(Team.invite_code == code)
    team = (await db.execute(stmt)).scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid Team QR Code.",
        )

    existing_mentor = (
        await db.execute(
            select(TeamMentor).where(TeamMentor.mentor_id == current_user.id)
        )
    ).scalar_one_or_none()
    if existing_mentor is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A Mentor can only join 1 team. You have already joined a team.",
        )

    mentor_link = TeamMentor(
        team_id=team.id,
        mentor_id=current_user.id,
    )
    if team.mentor_id is None:
        team.mentor_id = current_user.id
    db.add(mentor_link)
    await db.commit()

    refreshed = (await db.execute(stmt)).scalar_one()
    return _serialize_team(refreshed)
