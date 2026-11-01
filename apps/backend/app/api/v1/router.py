from fastapi import APIRouter

from app.api.v1 import auth, events, gamification, teams, users

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(teams.router)
api_router.include_router(events.router)
api_router.include_router(gamification.router)
