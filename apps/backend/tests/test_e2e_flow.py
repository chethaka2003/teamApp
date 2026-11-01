from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.roles import PointCategory, UserRole
from app.db.bootstrap import DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD
from app.db.session import Base, get_db
from app.main import app
from app.models.gamification import PointTransaction
from app.models.team import Team, TeamMember, TeamMentor
from app.models.user import User


@pytest_asyncio.fixture
async def db_session():
    """Create an isolated async database engine and schema for the E2E scenario."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    TestSessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )

    async def override_get_db():
        async with TestSessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with TestSessionLocal() as session:
        yield session

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_complete_team_app_e2e_flow(db_session: AsyncSession):
    """End-to-End Integration Test for Team_APP covering all 9 requirements:
    1) Default Admin fallback login (`admin@summit.io`) when `users` table is empty.
    2) Direct Mentor registration is blocked; Member registers as PARTICIPANT and is
       found via Organizer search & promoted to MENTOR (and demoted/re-promoted).
    3) Organizer creates a Summit Event (`POST /api/v1/events`) and a Team (`POST /api/v1/teams`)
       with a generated Team Invite QR Code (`teamapp://join?code=...`).
    4) Participant joins the Event and joins the Team via the invite code.
    5) Multiple Mentors join the same Team via QR code (`POST /api/v1/teams/mentor/join`),
       while a Mentor is blocked from joining a second team.
    6) Organizer scans the Member's User ID QR code, selects the Event, and awards points
       to both the Individual Member and the Entire Team.
    7) Both Team Leaderboard and Individual Leaderboard reflect the updated 1st/2nd rankings.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # ---------------------------------------------------------------------
        # 1. Default Organizer Fallback Login when `users` table is empty
        # ---------------------------------------------------------------------
        default_org_login = await client.post(
            "/api/v1/auth/login",
            json={
                "email": DEFAULT_ADMIN_EMAIL,
                "password": DEFAULT_ADMIN_PASSWORD,
            },
        )
        assert default_org_login.status_code == 200, default_org_login.text
        org_token = default_org_login.json()["access_token"]
        assert default_org_login.json()["role"] == "ORGANIZER"

        # ---------------------------------------------------------------------
        # 2. Verify direct Mentor registration is blocked (Requirement 2)
        # ---------------------------------------------------------------------
        blocked_mentor_reg = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "direct_mentor@summit.io",
                "password": "Password123!",
                "full_name": "Blocked Direct Mentor",
                "role": "MENTOR",
            },
        )
        assert blocked_mentor_reg.status_code == 403

        # Register two Participant accounts (one will be promoted to Mentor)
        part_reg = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "participant@summit.io",
                "password": "Password123!",
                "full_name": "Liam Chen",
                "role": "PARTICIPANT",
                "department_or_track": "AI & Robotics",
            },
        )
        assert part_reg.status_code == 201, part_reg.text
        participant_id = part_reg.json()["id"]

        mentor_candidate_reg = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "marcus@summit.io",
                "password": "Password123!",
                "full_name": "Dr. Marcus Sterling",
                "role": "PARTICIPANT",
                "department_or_track": "Cloud Architecture",
            },
        )
        assert mentor_candidate_reg.status_code == 201
        mentor_id = mentor_candidate_reg.json()["id"]

        second_mentor_reg = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "sarah.mentor@summit.io",
                "password": "Password123!",
                "full_name": "Sarah Jenkins",
                "role": "PARTICIPANT",
            },
        )
        assert second_mentor_reg.status_code == 201
        second_mentor_id = second_mentor_reg.json()["id"]

        # ---------------------------------------------------------------------
        # 3. Organizer searches members and promotes/demotes roles (Requirement 3)
        # ---------------------------------------------------------------------
        search_res = await client.get(
            "/api/v1/users?search=Marcus",
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert search_res.status_code == 200
        found_users = search_res.json()
        assert len(found_users) == 1
        assert found_users[0]["id"] == mentor_id

        # Promote Marcus to MENTOR
        promote_res = await client.patch(
            f"/api/v1/users/{mentor_id}/role",
            headers={"Authorization": f"Bearer {org_token}"},
            json={"role": "MENTOR"},
        )
        assert promote_res.status_code == 200
        assert promote_res.json()["role"] == "MENTOR"

        # Promote Sarah to ORGANIZER, then demote to PARTICIPANT, then promote to MENTOR
        org_promote_res = await client.patch(
            f"/api/v1/users/{second_mentor_id}/role",
            headers={"Authorization": f"Bearer {org_token}"},
            json={"role": "ORGANIZER"},
        )
        assert org_promote_res.status_code == 200
        assert org_promote_res.json()["role"] == "ORGANIZER"

        demote_res = await client.patch(
            f"/api/v1/users/{second_mentor_id}/role",
            headers={"Authorization": f"Bearer {org_token}"},
            json={"role": "PARTICIPANT"},
        )
        assert demote_res.status_code == 200
        assert demote_res.json()["role"] == "PARTICIPANT"

        await client.patch(
            f"/api/v1/users/{second_mentor_id}/role",
            headers={"Authorization": f"Bearer {org_token}"},
            json={"role": "MENTOR"},
        )

        # ---------------------------------------------------------------------
        # 4. Organizer creates a Summit Event & Participant/Mentor join it (Req 4)
        # ---------------------------------------------------------------------
        create_event_res = await client.post(
            "/api/v1/events",
            headers={"Authorization": f"Bearer {org_token}"},
            json={
                "title": "AI Prototype Demo Sprint",
                "description": "Build and demo a working prototype",
                "location": "Innovation Lab",
                "default_points": 50,
            },
        )
        assert create_event_res.status_code == 201, create_event_res.text
        event_data = create_event_res.json()
        event_id = event_data["id"]

        part_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "participant@summit.io", "password": "Password123!"},
        )
        part_token = part_login.json()["access_token"]

        mentor_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "marcus@summit.io", "password": "Password123!"},
        )
        mentor_token = mentor_login.json()["access_token"]

        second_mentor_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "sarah.mentor@summit.io", "password": "Password123!"},
        )
        second_mentor_token = second_mentor_login.json()["access_token"]

        join_evt_part = await client.post(
            f"/api/v1/events/{event_id}/join",
            headers={"Authorization": f"Bearer {part_token}"},
        )
        assert join_evt_part.status_code == 200
        assert join_evt_part.json()["is_joined"] is True
        assert join_evt_part.json()["participant_count"] == 1

        join_evt_mentor = await client.post(
            f"/api/v1/events/{event_id}/join",
            headers={"Authorization": f"Bearer {mentor_token}"},
        )
        assert join_evt_mentor.status_code == 200
        assert join_evt_mentor.json()["participant_count"] == 2

        # ---------------------------------------------------------------------
        # 5. Organizer creates Teams with Team Invite QR Codes; Participant &
        #    Mentors join via QR Code (Requirements 6 & 7)
        # ---------------------------------------------------------------------
        create_team_res = await client.post(
            "/api/v1/teams",
            headers={"Authorization": f"Bearer {org_token}"},
            json={
                "name": "Apex Innovators",
                "description": "E2E Summit Test Team",
                "max_capacity": 6,
            },
        )
        assert create_team_res.status_code == 201
        team_data = create_team_res.json()
        team_id = team_data["id"]
        invite_code = team_data["invite_code"]
        qr_payload = team_data["qr_payload"]
        assert qr_payload == f"teamapp://join?code={invite_code}"

        second_team_res = await client.post(
            "/api/v1/teams",
            headers={"Authorization": f"Bearer {org_token}"},
            json={"name": "Quantum Builders", "max_capacity": 6},
        )
        second_team_qr = second_team_res.json()["qr_payload"]

        # Participant joins Team 1
        join_res = await client.post(
            "/api/v1/teams/join",
            headers={"Authorization": f"Bearer {part_token}"},
            json={"invite_code": qr_payload},
        )
        assert join_res.status_code == 200
        assert join_res.json()["member_count"] == 1

        # Mentor 1 joins Team 1 by scanning Team QR Code
        mentor1_join = await client.post(
            "/api/v1/teams/mentor/join",
            headers={"Authorization": f"Bearer {mentor_token}"},
            json={"invite_code": qr_payload},
        )
        assert mentor1_join.status_code == 200
        assert mentor1_join.json()["mentor_count"] == 1

        # Mentor 2 also joins Team 1 (1 Team can have multiple Mentors)
        mentor2_join = await client.post(
            "/api/v1/teams/mentor/join",
            headers={"Authorization": f"Bearer {second_mentor_token}"},
            json={"invite_code": qr_payload},
        )
        assert mentor2_join.status_code == 200
        assert mentor2_join.json()["mentor_count"] == 2

        # Mentor 1 attempts to join Team 2 -> Rejected (A Mentor can only join 1 team)
        mentor1_second_join = await client.post(
            "/api/v1/teams/mentor/join",
            headers={"Authorization": f"Bearer {mentor_token}"},
            json={"invite_code": second_team_qr},
        )
        assert mentor1_second_join.status_code == 409

        # ---------------------------------------------------------------------
        # 6. Organizer scans Member QR Code (`participant_id`), selects Event,
        #    and awards points to Individual Member & Entire Team (Req 5 & 8)
        # ---------------------------------------------------------------------
        scanned_profile = await client.get(
            f"/api/v1/users/{participant_id}",
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert scanned_profile.status_code == 200
        assert scanned_profile.json()["full_name"] == "Liam Chen"

        # Award 50 points to the Team and Individual Member linked to the Event
        award_res = await client.post(
            "/api/v1/gamification/points/award",
            headers={"Authorization": f"Bearer {mentor_token}"},
            json={
                "target_team_id": team_id,
                "target_user_id": participant_id,
                "event_id": event_id,
                "points_delta": 50,
                "category": "MILESTONE",
                "reason": "Completed Phase 1 Prototype Milestone",
            },
        )
        assert award_res.status_code == 201, award_res.text
        tx_data = award_res.json()
        assert tx_data["target_team_id"] == team_id
        assert tx_data["target_user_id"] == participant_id
        assert tx_data["event_id"] == event_id
        assert tx_data["points_delta"] == 50

        # Verify Mentor Dashboard sees team members with updated individual point balance (50 pts)
        mentor_teams_res = await client.get(
            "/api/v1/teams?scope=accessible",
            headers={"Authorization": f"Bearer {mentor_token}"},
        )
        assert mentor_teams_res.status_code == 200
        mentored_team = mentor_teams_res.json()[0]
        assert mentored_team["id"] == team_id
        assert mentored_team["members"][0]["user_id"] == participant_id
        assert mentored_team["members"][0]["individual_points"] == 50

        # ---------------------------------------------------------------------
        # 7. Verify Global Team Leaderboard & Individual Leaderboard (Req 9)
        # ---------------------------------------------------------------------
        team_lb_res = await client.get(
            "/api/v1/gamification/leaderboard/teams",
            headers={"Authorization": f"Bearer {part_token}"},
        )
        assert team_lb_res.status_code == 200
        team_lb = team_lb_res.json()
        assert len(team_lb) == 2
        assert team_lb[0]["rank"] == 1
        assert team_lb[0]["team_name"] == "Apex Innovators"
        assert team_lb[0]["total_points"] == 50
        assert team_lb[1]["rank"] == 2
        assert team_lb[1]["team_name"] == "Quantum Builders"
        assert team_lb[1]["total_points"] == 0

        ind_lb_res = await client.get(
            "/api/v1/gamification/leaderboard/participants",
            headers={"Authorization": f"Bearer {part_token}"},
        )
        assert ind_lb_res.status_code == 200
        ind_lb = ind_lb_res.json()
        assert ind_lb[0]["rank"] == 1
        assert ind_lb[0]["user_id"] == participant_id
        assert ind_lb[0]["full_name"] == "Liam Chen"
        assert ind_lb[0]["individual_points"] == 50
