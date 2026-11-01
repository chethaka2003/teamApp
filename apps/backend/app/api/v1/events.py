from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_user,
    require_permissions,
    require_roles,
)
from app.core.roles import Permission, UserRole
from app.db.session import get_db
from app.models.event import Event, EventParticipant
from app.models.user import User
from app.schemas.event import (
    EventCreateRequest,
    EventParticipantResponse,
    EventResponse,
    EventUpdateRequest,
)

router = APIRouter(prefix="/events", tags=["Events System"])


def _serialize_event(
    event: Event, current_user_id: uuid.UUID | None = None
) -> EventResponse:
    participants_list: list[EventParticipantResponse] = []
    is_joined = False
    for p in event.participants:
        if current_user_id and p.user_id == current_user_id:
            is_joined = True
        participants_list.append(
            EventParticipantResponse(
                id=p.id,
                event_id=p.event_id,
                user_id=p.user_id,
                joined_at=p.joined_at,
                user_full_name=p.user.full_name if p.user else None,
                user_role=p.user.role.value if p.user else None,
            )
        )

    return EventResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        location=event.location,
        default_points=event.default_points,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        is_active=event.is_active,
        created_by=event.created_by,
        created_at=event.created_at,
        participant_count=len(participants_list),
        is_joined=is_joined,
        participants=participants_list,
    )


@router.get("", response_model=list[EventResponse])
async def list_events(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[EventResponse]:
    """List all summit events (accessible to Organizers, Mentors, and Members)."""
    stmt = (
        select(Event)
        .options(selectinload(Event.participants).selectinload(EventParticipant.user))
        .order_by(Event.created_at.desc())
    )
    events = (await db.execute(stmt)).scalars().unique().all()
    return [_serialize_event(e, current_user.id) for e in events]


@router.post(
    "",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_roles(UserRole.ORGANIZER)),
        Depends(require_permissions(Permission.CREATE_RESOURCES)),
    ],
)
async def create_event(
    payload: EventCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EventResponse:
    """Create a new summit Event (restricted to Organizers - Requirement 4)."""
    new_event = Event(
        title=payload.title.strip(),
        description=payload.description,
        location=payload.location,
        default_points=payload.default_points,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        is_active=True,
        created_by=current_user.id,
    )
    db.add(new_event)
    await db.commit()

    stmt = (
        select(Event)
        .options(selectinload(Event.participants).selectinload(EventParticipant.user))
        .where(Event.id == new_event.id)
    )
    refreshed = (await db.execute(stmt)).scalar_one()
    return _serialize_event(refreshed, current_user.id)


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EventResponse:
    """Retrieve a single summit event by ID."""
    stmt = (
        select(Event)
        .options(selectinload(Event.participants).selectinload(EventParticipant.user))
        .where(Event.id == event_id)
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found.",
        )
    return _serialize_event(event, current_user.id)


@router.patch(
    "/{event_id}",
    response_model=EventResponse,
    dependencies=[
        Depends(require_roles(UserRole.ORGANIZER)),
        Depends(require_permissions(Permission.UPDATE_RESOURCES)),
    ],
)
async def update_event(
    event_id: uuid.UUID,
    payload: EventUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EventResponse:
    """Update an existing summit Event (restricted to Organizers)."""
    stmt = (
        select(Event)
        .options(selectinload(Event.participants).selectinload(EventParticipant.user))
        .where(Event.id == event_id)
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found.",
        )

    if payload.title is not None:
        event.title = payload.title.strip()
    if payload.description is not None:
        event.description = payload.description
    if payload.location is not None:
        event.location = payload.location
    if payload.default_points is not None:
        event.default_points = payload.default_points
    if payload.starts_at is not None:
        event.starts_at = payload.starts_at
    if payload.ends_at is not None:
        event.ends_at = payload.ends_at
    if payload.is_active is not None:
        event.is_active = payload.is_active

    await db.commit()
    refreshed = (await db.execute(stmt)).scalar_one()
    return _serialize_event(refreshed, current_user.id)


@router.delete(
    "/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(require_roles(UserRole.ORGANIZER)),
        Depends(require_permissions(Permission.DELETE_RESOURCES)),
    ],
)
async def delete_event(
    event_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete an Event (restricted to Organizers)."""
    stmt = select(Event).where(Event.id == event_id)
    event = (await db.execute(stmt)).scalar_one_or_none()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found.",
        )
    await db.delete(event)
    await db.commit()


@router.post("/{event_id}/join", response_model=EventResponse)
async def join_event(
    event_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EventResponse:
    """Allow Members and Mentors (and Organizers) to join an active Event (Requirement 4)."""
    stmt = (
        select(Event)
        .options(selectinload(Event.participants).selectinload(EventParticipant.user))
        .where(Event.id == event_id)
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found.",
        )

    if not event.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event is closed.",
        )

    existing = (
        await db.execute(
            select(EventParticipant).where(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return _serialize_event(event, current_user.id)

    participation = EventParticipant(
        event_id=event.id,
        user_id=current_user.id,
    )
    db.add(participation)
    await db.commit()

    stmt_refresh = (
        select(Event)
        .options(selectinload(Event.participants).selectinload(EventParticipant.user))
        .where(Event.id == event_id)
        .execution_options(populate_existing=True)
    )
    refreshed = (await db.execute(stmt_refresh)).scalar_one()
    return _serialize_event(refreshed, current_user.id)
