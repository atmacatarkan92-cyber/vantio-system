# Step 1: Docker PostgreSQL + Alembic (sync psycopg2)

## Files created or modified

| Action | Path |
|--------|------|
| **Created** | `docker-compose.yml` (repo root) |
| **Modified** | `backend/.env.example` |
| **Modified** | `backend/requirements.txt` (added `alembic`) |
| **Created** | `backend/alembic.ini` |
| **Created** | `backend/alembic/env.py` |
| **Created** | `backend/alembic/script.py.mako` |
| **Created** | `backend/alembic/versions/.gitkeep` |

Airtable fallback is **not** removed; it remains in use and in `.env.example`.

## Run PostgreSQL locally (Docker)

From repo root:

```bash
docker compose up -d db
```

Then in `backend/.env` (copy from `backend/.env.example` if needed):

```env
DATABASE_URL=postgresql+psycopg2://feelathomenow:localdevpassword@localhost:5432/feelathomenow_dev
```

## Alembic (from backend directory)

```bash
cd backend
pip install -r requirements.txt
alembic revision -m "description"   # create a new migration
alembic upgrade head              # apply migrations (new DB only)
alembic stamp head                # mark DB as up-to-date without running DDL (existing DB)
alembic current                    # show current revision
```

Alembic uses the same `backend/.env` and `db/database.py` (sync engine). All tables from `db/models.py` are registered via `SQLModel.metadata`.

### First migration (initial schema)

- **New or empty database:** run `alembic upgrade head` to create all tables.
- **Existing database** (tables already created by `create_db()` or scripts): run **`alembic stamp head`** only. Do **not** run `alembic upgrade head`, or you will get "relation already exists" errors.

## Safe .env behaviour

- `.env.example` documents Docker URL and keeps Airtable/Mongo as optional.
- Do **not** remove Airtable vars until the apartments API no longer uses them.
