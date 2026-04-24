# Project Bootstrap

Current code layout:

- `frontend-user/`: user-facing web app
- `frontend-admin/`: admin web app
- `backend-api/`: API service
- `backend-worker/`: background task worker
- `shared/`: shared constants, schemas, and utilities

## Current implementation status

As of 2026-04-24, the runnable DeepResearch pipeline is still stock-first:

- Stock research can create tasks, collect real market materials, call Gemini, generate reports, and show results in the user UI.
- Company and commodity entries exist in the product surface, but the backend task API and worker still reject non-stock research tasks.
- Gemini API key and Google Search grounding are supported through `GEMINI_API_KEY` and `GEMINI_GOOGLE_SEARCH_ENABLED`.
- The currently implemented stock source is the Eastmoney public quote interface. It is useful for the demo pipeline, but it should be treated as a medium-authority market data source, not the final authoritative source layer.

Next development should focus on the information-source layer: add source adapters, normalize them into `materials`, rank/deduplicate materials, then let Gemini analyze only after traceable sources have been collected.

## Recommended startup

If you already completed the one-time dependency setup, the fastest way to run the project is from `src/`:

```powershell
.\dev-start.cmd
```

Useful variants:

```powershell
.\dev-start.cmd -InitDb
.\dev-start.cmd -WithAdmin
.\dev-start.cmd -NoWorker
.\dev-status.cmd
.\dev-stop.cmd
```

By default, `dev-start` will:

1. Start PostgreSQL and Redis through `docker compose`
2. Start `backend-api`
3. Start `frontend-user`
4. Start `backend-worker`

Notes:

- `-InitDb` runs Alembic migrations and `seed_initial_data.py` before startup
- `-WithAdmin` also starts `frontend-admin`
- `-NoWorker` is useful when you only want frontend or API debugging
- The script assumes the Python virtual environments and frontend dependencies are already installed

## One-time setup

Before the first startup on a new machine:

1. Prepare `src/.env`
2. Create virtual environments and install Python dependencies for `backend-api` and `backend-worker`
3. Install frontend dependencies in `frontend-user` and `frontend-admin`
4. Make sure Docker Desktop is available

Environment file:

```powershell
Copy-Item .env.example .env
```

## Manual startup

The original manual startup flow is still supported:

1. From `src/`, run `docker compose up -d`
2. Start `backend-api`
3. Start `backend-worker`
4. Start `frontend-user`
5. Start `frontend-admin` if needed

This is still the best option when you want to debug one service at a time.
