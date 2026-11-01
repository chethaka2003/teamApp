# Team_APP — Mobile Summit Application Monorepo

A monorepo for **Team_APP**, a mobile summit management application featuring Role-Based Access Control (Organizers, Mentors, Participants), team formation & allocation, a gamified point system with leaderboards, and real-time in-team polling.

## Monorepo Structure

```text
Team_APP/
├── apps/
│   ├── mobile/                 # React Native (Expo Router + TypeScript) frontend
│   │   ├── src/
│   │   │   ├── app/            # Expo Router screens ((auth), (tabs), role views)
│   │   │   ├── api/            # Axios/Fetch client & endpoint hooks
│   │   │   ├── components/     # Reusable UI components
│   │   │   ├── context/        # Auth & Role state management
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── types/          # Shared TypeScript interfaces
│   │   │   └── utils/          # Helper functions
│   │   ├── app.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── backend/                # Python FastAPI + SQLAlchemy (Async) backend
│       ├── app/
│       │   ├── api/            # Versioned API routers & RBAC dependencies
│       │   ├── core/           # Config, JWT security, RBAC permissions
│       │   ├── db/             # PostgreSQL async engine, session & Base
│       │   ├── models/         # SQLAlchemy ORM models (skeleton)
│       │   ├── schemas/        # Pydantic v2 schemas (skeleton)
│       │   ├── services/       # Business logic layer (skeleton)
│       │   └── main.py         # FastAPI entry point
│       ├── alembic/            # Database migrations directory
│       ├── .env.example
│       └── requirements.txt
├── docker-compose.yml          # Local PostgreSQL 16 database instance
└── package.json                # Root workspace scripts
```

## Quick Start

### 1. Start PostgreSQL Database
```bash
docker compose up -d
```

### 2. Backend Setup (FastAPI)
```bash
cd apps/backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

### 3. Mobile Frontend Setup (Expo)
```bash
cd apps/mobile
npm install
npx expo start
```
