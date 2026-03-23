# System architecture

Concise description of the repository as implemented today.

## Tech stack

| Layer | Technology |
|--------|------------|
| Backend API | FastAPI (`backend/server.py`, routers under `backend/app/api/`) |
| Database | PostgreSQL (SQLModel/SQLAlchemy; connection via `DATABASE_URL` / `PG_*` in `backend/db/database.py`) |
| Admin / landlord UI | React (`frontend/`, Craco) |
| Migrations | Alembic (`backend/alembic/`) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |
| Hosting | Not defined in-repo. Operational docs reference PaaS-style deployment and **Render** for PostgreSQL URL / backup examples (`PRODUCTION_READINESS.md`, `.github/workflows/BACKUP_RESTORE.md`). There is no `render.yaml` or equivalent checked in; services are configured via environment variables. |

## High-level folder structure

- **`backend/`** — FastAPI app, auth, DB models, Alembic migrations, pytest suite.
- **`frontend/`** — React SPA (admin and landlord areas).
- **`tenant-app/`** — Separate tenant UI codebase; see `tenant-app/DECISION.md` (deferred, not wired to production API as the primary product surface).
- **`e2e/`** — Playwright tests for admin flows (optional credentials; local).
- **`docs/`** — Additional technical notes (testing, plans).
- **`.github/workflows/`** — CI (`ci.yml`), backup workflow (`backup.yml`).

## Authentication

- **JWT access tokens:** Bearer `Authorization` header; validated in `auth/dependencies.get_current_user` via `decode_access_token` (`auth/security.py`). Payload includes `sub` (user id); optional `pv` for password-rotation invalidation.
- **Refresh tokens:** HttpOnly cookie flow (Phase 2 auth); see `auth/` routes and `auth/security.py`.
- **API docs:** OpenAPI JWT scheme is registered for Swagger when not in production (`server.py`).

## Request context and organization

- **Per-request org id:** `ContextVar` in `db/rls.py` (`set_request_organization_id` / `get_request_organization_id`). `OrgContextMiddleware` resets the var at the start of each request to avoid cross-request leakage.
- **After login resolution:** `get_current_user` loads `User` by JWT `sub`, then sets org context from `user.organization_id` and calls `apply_pg_organization_context(db, org_id)` so PostgreSQL session GUC is set for the ORM session.
- **Dependencies:** `get_current_organization` returns the authenticated user’s `organization_id` (403 if missing). `require_roles(...)` wraps role checks (admin/manager/landlord/etc. as string values on `User.role`).

## Multi-tenancy model

- Data is scoped by **`organization_id`** on core entities (and on `users`).
- **Application layer:** Routes filter by `organization_id` from `Depends(get_current_organization)` where applicable.
- **Database layer:** RLS policies compare row `organization_id` (or related parent) to `current_setting('app.current_organization_id', true)` — see `db/rls.py` and `alembic/versions/025_rls_core_tables.py`.

## Row Level Security (RLS)

- **Enforcement:** Policies use `SET LOCAL app.current_organization_id` on the SQLAlchemy connection (`apply_pg_organization_context`, `Session.after_begin` listener in `db/rls.py`). Missing or NULL setting yields no matching rows (fail-closed per migration comments).
- **App DB role:** CI creates a non-superuser app role without `BYPASSRLS` (`scripts/ci_grant_app_role.py`) so tests exercise RLS.
- **Role-based access:** HTTP layer uses JWT + `User.role`; RLS does not replace role checks — it constrains org visibility for the app role used by the API.

## Migrations

- **Tool:** Alembic (`backend/alembic/`, `alembic.ini`).
- **Production:** `startup_event` in `server.py` skips `create_all` when `ENVIRONMENT=production`; schema is expected to come from Alembic only.
- **CI:** `alembic upgrade head` runs against Postgres 16 before pytest (`.github/workflows/ci.yml`).

## CI/CD

- **Test pipeline (`ci.yml`):**
  - **Backend:** Install deps → `alembic upgrade head` → create app role + grants → `pytest` with `feelathomenow_app` DB URL (RLS).
  - **Frontend:** `npm ci` → Jest subset (`--testPathPattern="landlord"`) → `npm run build`.
- **Deploy:** The workflow comment states CI does **not** deploy; release/deploy is out of band (env + secrets on the host).

## Related docs

- `RLS_COVERAGE.md` — RLS by table.
- `alembic/versions/025_rls_core_tables.py` — Core RLS policies and GUC semantics.
