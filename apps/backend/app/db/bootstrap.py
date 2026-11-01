from __future__ import annotations

import logging
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.roles import UserRole
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.user import User

logger = logging.getLogger(__name__)

DEFAULT_ADMIN_EMAIL = "admin@summit.io"
DEFAULT_ADMIN_PASSWORD = "AdminPassword123!"
DEFAULT_ADMIN_NAME = "Default Summit Organizer"


async def ensure_default_organizer(session: AsyncSession) -> User:
    """Ensure at least one default Organizer account exists if the `users` table is empty
    (or if no Organizer exists yet).
    """
    count_stmt = select(func.count(User.id))
    total_users = (await session.execute(count_stmt)).scalar_one()

    if total_users == 0:
        default_admin = User(
            email=DEFAULT_ADMIN_EMAIL,
            password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
            full_name=DEFAULT_ADMIN_NAME,
            role=UserRole.ORGANIZER,
            department_or_track="Summit Operations",
            is_active=True,
        )
        session.add(default_admin)
        await session.commit()
        await session.refresh(default_admin)
        logger.info("Created default Organizer account: %s", DEFAULT_ADMIN_EMAIL)
        return default_admin

    existing_org = (
        await session.execute(
            select(User).where(User.role == UserRole.ORGANIZER).limit(1)
        )
    ).scalar_one_or_none()
    if existing_org is not None:
        return existing_org

    # Fallback if users exist but none is an Organizer
    fallback_admin = User(
        email=DEFAULT_ADMIN_EMAIL,
        password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
        full_name=DEFAULT_ADMIN_NAME,
        role=UserRole.ORGANIZER,
        department_or_track="Summit Operations",
        is_active=True,
    )
    session.add(fallback_admin)
    await session.commit()
    await session.refresh(fallback_admin)
    return fallback_admin


async def run_startup_bootstrap() -> None:
    """Startup hook called by FastAPI lifespan to seed the default Organizer if the DB is reachable."""
    try:
        async with AsyncSessionLocal() as session:
            await ensure_default_organizer(session)
    except Exception as exc:
        logger.warning(
            "Database bootstrap skipped during startup (DB offline or unmigrated): %s",
            exc,
        )
