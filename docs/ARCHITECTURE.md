# Architecture

## 1. System Overview

**Production layout:** Browser → **React** SPA (hosted on **Vercel**) → HTTPS → **FastAPI** (`backend/server.py`, hosted on **Render**) → **PostgreSQL** (Render) via **SQLModel** (SQLAlchemy) with **psycopg2** as the database driver.

**Request flow:** HTTP request hits FastAPI routing → dependency-injected `Session` runs SQL against Postgres → JSON/HTML response. The SPA stores a short-lived **JWT** (Bearer) and an **HttpOnly** refresh cookie for session continuation. **Row Level Security (RLS)** on the database enforces tenant boundaries; the API must set PostgreSQL session variables so policies allow the intended rows.

**Single source of truth:** All durable business and auth state lives in Postgres. Schema changes go through **Alembic** only in production (`ENVIRONMENT=production` skips `create_all` on startup).

---

## 2. Backend Architecture

### Layout (`backend/`)

| Area | Role |
|------|------|
| `server.py` | FastAPI app: middleware stack, CORS, router registration, startup (`validate_auth_config`, optional `create_db` in non-production). |
| `app/api/v1/routes_*.py` | HTTP handlers: admin (units, rooms, tenants, tenancies, properties, landlords, users, documents, audit logs, dashboard, listings), tenant/landlord portals, invoices, health, contact, apartments. |
| `app/services/` | Domain helpers (e.g. tenant CRM, occupancy, invoice generation) called from routes. |
| `app/core/` | Cross-cutting: rate limiting, request logging, security headers, R2 storage helpers. |
| `auth/` | `/auth/*` routes (`routes.py`), JWT/password helpers (`security.py`), `get_current_user` and `get_db_session` (`dependencies.py`). |
| `db/` | `database.py` (engine, `get_session`), `models.py` (SQLModel tables), `rls.py` (GUCs + `Session` hooks), `audit.py`, `organization.py`. |
| `alembic/` | Migrations; authoritative schema in production. |
| `pdf/`, `email_service.py` | Supporting services. |

### Sessions and dependencies

- **`get_db_session`** (`auth/dependencies.py`): yields a **new** `Session` per request and **closes** it in `finally`.
- **`get_session`** (`db/database.py`): constructs `Session(engine)`; if the request **ContextVar** `get_request_organization_id()` is set (after auth), calls **`apply_pg_organization_context`** so `session.info["rls_org_id"]` is set and **`Session.after_begin`** issues `SET LOCAL app.current_organization_id` for each transaction.
- **Unauthenticated routes** (e.g. login) use the same session factory but **no** org ContextVar until auth code sets GUCs explicitly.

### Where RLS context is applied

- **`db/rls.py`:** `apply_pg_organization_context`, `apply_pg_user_context`, `apply_pg_auth_unscoped_user_lookup`, `apply_pg_refresh_token_hash_lookup`; listener on `Session.after_begin` reapplies stored GUCs after `commit()`.
- **`get_current_user`:** `apply_pg_user_context` → load `users` row → `set_request_organization_id` + `apply_pg_organization_context` from the user’s `organization_id` before downstream queries.
- **Auth routes** (`auth/routes.py`): set unscoped / org / refresh-hash GUCs per step (see §6).
- **Scripts / tests:** must call `apply_pg_organization_context` (and related helpers) before touching RLS-protected tables when no HTTP ContextVar exists.

---

## 3. Database Architecture

- **Engine:** One PostgreSQL database; connection string from `DATABASE_URL` (see `db/database.py`).
- **Migrations:** **Alembic** under `backend/alembic/versions/`. Production relies on `alembic upgrade head`; do not hand-edit production schema outside migrations.
- **ORM:** **SQLModel** models in `db/models.py` mirror tables; drift is resolved by new revisions, not ad-hoc DDL.

### Data model concepts (tenant boundary)

- **`organization`:** Top-level tenant; `organization_id` on scoped rows.
- **`users`:** Login identity; FK to `organization`. Email uniqueness is scoped (see migrations / models).
- **`user_credentials`:** Password hash; PK `user_id` → `users.id`; **`organization_id`** added in migration **043**, RLS in **044**.
- **`refresh_tokens`:** Rotating sessions; **`organization_id`** (043), RLS (044).
- **`tenancies`:** Links tenant, room, unit, dates, status; carries `organization_id`.
- **`unit`, `room`, `tenant`:** Core inventory/CRM; RLS from early migrations (**023** onward).
- **`properties`, `landlords`, `invoices`, …:** Core business tables; RLS on tenant-scoped entities per migration **025** and later (CRM **030**, users/audit **042**).

---

## 4. Multi-Tenancy Model

- **Primary key for isolation:** `organization_id` on rows that belong to a tenant. API handlers typically take the org from **`get_current_user`** / **`get_current_organization`** and filter or write with that id.
- **Application `WHERE` clauses are not sufficient** for security: mistakes or future code paths could omit filters. **RLS** ensures that even with a bug, the DB role used by the app only sees rows matching `SET LOCAL app.current_organization_id` (plus documented exceptions).
- **DB-level enforcement** is required so compromise of one layer (e.g. one endpoint) does not expose other tenants’ rows.

---

## 5. Row Level Security (RLS)

### Mechanism

PostgreSQL policies on selected tables use **`USING` / `WITH CHECK`** expressions comparing `organization_id::text` to **`current_setting('app.current_organization_id', true)`** (and variants). **`SET LOCAL`** in a transaction binds the GUC for that transaction only.

**RLS context injection:** Isolation is applied **per HTTP request** (and again after each `commit()` opens a new transaction). Values are written with **`SET LOCAL`** (transaction-scoped) through helpers in **`db/rls.py`** (`apply_pg_organization_context`, `apply_pg_user_context`, `apply_pg_auth_unscoped_user_lookup`, `apply_pg_refresh_token_hash_lookup`) and the **`Session.after_begin`** listener, which reapplies stored values on the connection. Those helpers must run **before** tenant-scoped `SELECT`/`INSERT`/`UPDATE`/`DELETE` so policies see the intended context. Primary parameters are **`app.current_organization_id`** and **`app.current_user_id`**; trusted auth-only parameters include **`app.auth_unscoped_user_lookup`** and **`app.current_refresh_token_hash`** on the routes that require them.

**`FORCE ROW LEVEL SECURITY`** is used on sensitive tables (e.g. `users`, `audit_logs`, `user_credentials`, `refresh_tokens`) so the table owner cannot bypass policies.

### Tables with RLS (by migration lineage)

Examples: `unit`, `tenant`, `room` (**023**); `tenancies`, `invoices`, `properties`, `landlords`, `unit_costs` (**025**); tenant CRM tables (**030**); `users`, `audit_logs` (**042**); `user_credentials`, `refresh_tokens` (**044**). See `docs/RLS_COVERAGE.md` and individual revision files for exact policy names.

### Context variables (GUCs)

| GUC | Use |
|-----|-----|
| `app.current_organization_id` | Default tenant scope for ORM queries. |
| `app.current_user_id` | Allows a row in `users` matching JWT `sub` before org is known. |
| `app.auth_unscoped_user_lookup` | Short-lived, **trusted** path: resolve `users` by email (login / forgot-password) before org GUC is set. Cleared before unrelated commits. |
| `app.current_refresh_token_hash` | **Trusted** path: resolve `refresh_tokens` by hash before org GUC is set; cleared immediately after lookup. |

### Auth exceptions (not “open” bypass)

- **Unscoped user lookup:** Only for controlled auth endpoints; must be cleared so it does not leak across requests/transactions.
- **Refresh hash:** Binds to the single hashed value for the current cookie; not a broad table scan.

---

## 6. Authentication Flow (Technical)

### Login (`POST /auth/login`)

1. `apply_pg_auth_unscoped_user_lookup(session)` — enables email-based `users` visibility per policy **042**.
2. `SELECT` **only** `User` by email (optional `organization_id` in body).
3. `apply_pg_organization_context(session, str(user.organization_id))`.
4. `SELECT UserCredentials` for `user.id` — **requires** org GUC; **no** reliance on joining under unscoped for credentials.
5. Verify password; pop unscoped flag; `commit()`.
6. `apply_pg_user_context` + `apply_pg_organization_context`; reload user and credentials for token building; update `last_login_at`; issue JWT; insert **`RefreshToken`** with `organization_id`; `commit()`; set refresh cookie.

### Refresh (`POST /auth/refresh`)

1. `apply_pg_refresh_token_hash_lookup(session, token_hash)` — policy allows row where `token_hash` matches GUC.
2. `SELECT RefreshToken` by hash, valid, not revoked.
3. Clear hash lookup GUC.
4. `apply_pg_user_context` / `apply_pg_organization_context` from row or user; revoke old row, insert new `RefreshToken`, issue JWT.

### Logout (`POST /auth/logout`)

1. Hash cookie; `apply_pg_refresh_token_hash_lookup` → `SELECT` row → clear hash GUC.
2. `apply_pg_organization_context` from `row.organization_id`; set `revoked_at`; `commit()`.

---

## 7. Request Lifecycle (authenticated admin/API)

1. Request enters FastAPI; **`OrgContextMiddleware`** resets org ContextVar per request.
2. **`get_db_session`** → **`get_session`**: if ContextVar is unset, session has no `rls_org_id` until something sets it.
3. **`get_current_user`**: decode JWT → `apply_pg_user_context` → load `User` → `set_request_organization_id` + `apply_pg_organization_context` for that user’s org.
4. Route handler runs `session.exec(...)` / `session.add(...)`; **`after_begin`** has applied `SET LOCAL` for org (and user id if set) — same **per-request / per-transaction** rule as §5: context from `db/rls.py` must precede RLS-backed access.
5. Postgres evaluates RLS on each statement; responses return to client.

Routes that do not use `get_current_user` must set GUCs explicitly (auth routes, some bootstrap paths).

---

## 8. Testing & CI

- **`.github/workflows/ci.yml`:** Spins up **PostgreSQL 16**, runs **`alembic upgrade head`**, creates a non-superuser app role without **BYPASSRLS**, runs **`pytest`** with `DATABASE_URL` / `TEST_DATABASE_URL` pointing at that role.
- **RLS-aware tests** (`tests/test_rls.py`, integration tests): use `apply_pg_organization_context` and real SQL; naive `DELETE` without org context deletes zero rows under RLS.
- **Fixtures** that create `UserCredentials` / `RefreshToken` must set **`organization_id`** and often **flush per org** to avoid batched inserts under the wrong GUC; cleanup deletes **per org** in order: `refresh_tokens` → `user_credentials` → `users` (see `tests/org_scoped_cleanup.py`).

---

## 9. Failure Modes

| Risk | Consequence | Mitigation in this codebase |
|------|-------------|-----------------------------|
| **Insert without `organization_id` (or NULL)** | RLS **`WITH CHECK`** rejects the row; insert fails with insufficient privilege / policy violation. | Models and write paths set `organization_id`; migration 043 backfilled; auth routes set org before credential/token writes. |
| **Query before org context** | Policies hide rows: **`SELECT` returns empty** or “missing” data even when rows exist; updates may affect **0** rows. | `get_session` + `get_current_user`; explicit `apply_pg_*` in auth and scripts before tenant-scoped queries. |
| **Mixed orgs in one flush / transaction** | **`WITH CHECK`** or **`USING`** mismatch: e.g. batched **`INSERT`** for two orgs while **`app.current_organization_id`** matches only one → **RLS violation** on commit or flush. | Tests **flush per org** after credential inserts where needed (`test_admin_create_user`); production paths avoid batching cross-org writes under one GUC. |
| **Delete parent before child** | **Foreign key violation** (e.g. delete `users` while `user_credentials` / `refresh_tokens` still reference `users.id`). | Tests delete in order **per org**: `refresh_tokens` → `user_credentials` → `users` (`org_scoped_cleanup`); org GUC so RLS allows those deletes. |
| **Leaving `auth_unscoped` set** | Over-broad **`users`** visibility in the same transaction. | Auth code pops `rls_auth_unscoped` before commits that should not see unscoped `users`. |

---

## 10. Non-Goals

- **No separate auth microservice** — JWT and refresh handling live in this FastAPI app.
- **No org hierarchy in the schema** — isolation is a flat `organization_id`, not nested tenants-of-tenants.
- **Not all tables necessarily have RLS** — e.g. `password_reset_tokens` exists without the same RLS rollout as auth-session tables; assume non-RLS tables are still protected by application logic and least-privilege where applicable.
- **Cross-organization reporting in one query** is not a first-class pattern — would require explicit superuser or separate reporting role (not the default app role).

For policy-level detail and migration IDs, see **`docs/RLS_COVERAGE.md`**.
