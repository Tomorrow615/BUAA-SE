# Project Bootstrap

Current code layout:

- `frontend-user/`: user-facing web app
- `frontend-admin/`: admin web app
- `backend-api/`: API service
- `backend-worker/`: background task worker
- `shared/`: shared constants, schemas, and utilities

Before starting services:

1. Copy `.env.example` to `.env`
2. From `src/`, run `docker compose up -d`
3. Confirm containers are healthy

Recommended next implementation order:

1. `backend-api`
2. `backend-worker`
3. `frontend-user`
4. `frontend-admin`
