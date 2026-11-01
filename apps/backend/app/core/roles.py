from enum import StrEnum


class UserRole(StrEnum):
    """Canonical summit roles stored in PostgreSQL (`user_role_enum`),
    with aliases for standard RBAC hierarchy names (ADMIN, MANAGER, MEMBER, GUEST).
    """

    ORGANIZER = "ORGANIZER"
    MENTOR = "MENTOR"
    PARTICIPANT = "PARTICIPANT"
    GUEST = "GUEST"

    # Standard RBAC aliases mapped to canonical summit roles
    ADMIN = "ORGANIZER"
    MANAGER = "MENTOR"
    MEMBER = "PARTICIPANT"


class Permission(StrEnum):
    """Granular RBAC capabilities enforced across protected endpoints."""

    MANAGE_USERS = "MANAGE_USERS"
    VIEW_USERS = "VIEW_USERS"
    CREATE_RESOURCES = "CREATE_RESOURCES"
    UPDATE_RESOURCES = "UPDATE_RESOURCES"
    DELETE_RESOURCES = "DELETE_RESOURCES"
    ALLOCATE_TEAMS = "ALLOCATE_TEAMS"
    AWARD_POINTS = "AWARD_POINTS"
    MANAGE_BADGES = "MANAGE_BADGES"
    CREATE_POLLS = "CREATE_POLLS"
    VOTE_POLLS = "VOTE_POLLS"
    VIEW_PUBLIC_RESOURCES = "VIEW_PUBLIC_RESOURCES"


ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    # Admin / Organizer: full access including Managing Users and Deleting Resources
    UserRole.ORGANIZER: frozenset(Permission),
    # Manager / Mentor: manage teams/polls/points, view users, update resources (no user management or resource deletion)
    UserRole.MENTOR: frozenset(
        {
            Permission.VIEW_USERS,
            Permission.CREATE_RESOURCES,
            Permission.UPDATE_RESOURCES,
            Permission.AWARD_POINTS,
            Permission.CREATE_POLLS,
            Permission.VIEW_PUBLIC_RESOURCES,
        }
    ),
    # Member / Participant: create/vote in team polls, join teams, view leaderboards & own team
    UserRole.PARTICIPANT: frozenset(
        {
            Permission.CREATE_POLLS,
            Permission.VOTE_POLLS,
            Permission.VIEW_PUBLIC_RESOURCES,
        }
    ),
    # Guest: read-only access to public summit resources (leaderboards, schedules)
    UserRole.GUEST: frozenset(
        {
            Permission.VIEW_PUBLIC_RESOURCES,
        }
    ),
}


ROLE_ALIAS_MAP: dict[str, UserRole] = {
    "ORGANIZER": UserRole.ORGANIZER,
    "ADMIN": UserRole.ORGANIZER,
    "MENTOR": UserRole.MENTOR,
    "MANAGER": UserRole.MENTOR,
    "PARTICIPANT": UserRole.PARTICIPANT,
    "MEMBER": UserRole.PARTICIPANT,
    "GUEST": UserRole.GUEST,
}


def resolve_role(role: UserRole | str) -> UserRole:
    """Normalize a role enum or role alias string ('ADMIN', 'MANAGER', 'MEMBER', 'GUEST')
    to its canonical UserRole.
    """
    if isinstance(role, UserRole):
        return role
    normalized = role.strip().upper()
    if normalized in ROLE_ALIAS_MAP:
        return ROLE_ALIAS_MAP[normalized]
    raise ValueError(f"Unknown RBAC role: {role}")


def has_permission(role: UserRole | str, permission: Permission) -> bool:
    """Return True if the resolved role grants the specified permission."""
    resolved = resolve_role(role)
    return permission in ROLE_PERMISSIONS.get(resolved, frozenset())


class AllocationMethod(StrEnum):
    MANUAL = "MANUAL"
    AUTO_ASSIGNED = "AUTO_ASSIGNED"
    INVITE_CODE = "INVITE_CODE"


class PointCategory(StrEnum):
    MILESTONE = "MILESTONE"
    MENTOR_BONUS = "MENTOR_BONUS"
    CHALLENGE = "CHALLENGE"
    PENALTY = "PENALTY"
    POLL_PARTICIPATION = "POLL_PARTICIPATION"


class PollStatus(StrEnum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"
