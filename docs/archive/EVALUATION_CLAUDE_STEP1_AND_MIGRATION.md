# Evaluation: Claude’s “Step 1” vs Actual Codebase & Migration Strategy

This document compares Claude’s technical recommendation with the **current FeelAtHomeNow codebase** and proposes a safe migration path.

---

## 1. Current State (Actual Codebase)

### 1.1 What’s Already in Place

| Area | Current implementation |
|------|------------------------|
| **PostgreSQL** | In use. `db/database.py` uses **sync** SQLAlchemy + **psycopg2** (not asyncpg). `DATABASE_URL` or `PG_*` env vars. |
| **ORM** | **SQLModel** (SQLAlchemy 2) with many models: City, Unit, Room, Listing, ListingImage, ListingAmenity, Inquiry, Tenant, Tenancy, UnitCost, Invoice, User, UserCredentials. |
| **Migrations** | **No Alembic.** Schema changes via `create_db()` at startup (`SQLModel.metadata.create_all`) and **manual scripts** in `backend/scripts/` (e.g. `ensure_units_rooms_tenants_columns.py`, `ensure_invoice_tenancy_columns.py`, `fix_listing_availability_column.py`). |
| **Apartments API** | `GET /api/apartments` and `GET /api/apartments/{id}`: **PostgreSQL first** (listings_service), **Airtable fallback** when `engine is None` or listing not found. |
| **Contact / Inquiries** | **PostgreSQL only.** `POST /api/contact` and `GET /api/admin/inquiries` use `Inquiry` model. No MongoDB in runtime. |
| **MongoDB** | **Not in `requirements.txt`.** Only referenced in: (1) `scripts/migrate_mongo_inquiries_to_postgres.py` (one-off migration), (2) test string in `test_apartments_contacts.py` (“MongoDB database” – copy only; API uses PostgreSQL). |
| **Airtable** | **Still used.** In `requirements.txt`: `airtable-python-wrapper`, `pyairtable`. Used in `airtable_service.py` and `app/api/v1/routes_apartments.py` as fallback when PostgreSQL is not configured or has no listing. |
| **Docker** | **No `docker-compose`** in the repo. |

### 1.2 Dependencies (requirements.txt)

- **Present:** fastapi, uvicorn, python-dotenv, requests, pydantic, airtable-python-wrapper, pyairtable, sendgrid, sqlalchemy, sqlmodel, psycopg2-binary, passlib[argon2], pyjwt.  
- **Not present:** pymongo, motor, alembic, asyncpg, pydantic-settings (optional).

---

## 2. Evaluation of Claude’s Recommendation

Claude’s “Step 1” is aimed at a **greenfield or earlier state**. Applied literally to your **current** repo, several points are wrong or risky.

### 2.1 What’s Correct or Useful

- **PostgreSQL as single DB** – Aligns with your goal; you’re already mostly there (inquiries and listings path use PostgreSQL).
- **Local PostgreSQL via Docker** – Good idea; you don’t have compose yet, so adding it is helpful.
- **Cleaning .env** – Sensible (remove unused Airtable/Mongo vars when you stop using them).
- **Alembic for migrations** – Good long-term; right now you use `create_db()` + manual scripts.

### 2.2 What’s Wrong or Risky

| Claude’s suggestion | Issue in your codebase |
|---------------------|-------------------------|
| **Use `sqlalchemy[asyncio]` and `asyncpg`** | Your entire backend is **sync**: `db/database.py` uses `create_engine` + `Session` (psycopg2). All routes and services use sync `get_session()`. Switching to async now would mean rewriting every DB call and session usage. **Not recommended as Step 1.** |
| **`DATABASE_URL=postgresql+asyncpg://...`** | Your code expects **psycopg2** and sync engine. An async URL would require a full async refactor. |
| **Remove Airtable “and” Mongo immediately** | **Mongo:** Already gone from runtime; only migration script + test text. **Airtable:** Still the **fallback** for apartments when PostgreSQL is missing or empty. Removing Airtable before ensuring listings are in PostgreSQL and API uses only PG would break `GET /api/apartments` when DB is unconfigured or has no data. |
| **Remove pymongo / motor** | Already not in `requirements.txt`; nothing to remove. |
| **Remove Airtable dependencies** | Only safe **after** you’ve migrated listing data and removed the Airtable fallback from `routes_apartments.py`. |

### 2.3 If You Follow Claude’s Step 1 Literally

- **Switching to async SQLAlchemy + asyncpg**  
  - You’d have to change `db/database.py` to async engine and async sessions, and every place that uses `get_session()` (server.py, all admin routes, invoice routes, auth, services, scripts) to `async with session` / `await`.  
  - High risk of regressions and no immediate feature benefit. **Recommendation: do not do this as Step 1.**

- **Removing Airtable immediately**  
  - `routes_apartments.py` would have no fallback. If `engine is None` (no DB) or no listing in PG, you’d return `[]` or 404.  
  - So: either keep Airtable until listings are fully in PostgreSQL and API is PG-only, or explicitly accept “no DB = no listings.”

- **Adding Alembic**  
  - Technically fine. Your schema is currently managed by `create_db()` and manual ALTER scripts. Introducing Alembic is a **new process** (generate revisions, run upgrades); it doesn’t by itself remove the need to run existing scripts for already-deployed DBs.

---

## 3. Recommendation: A vs B

**Do not (A) remove Airtable and Mongo “immediately” in one go.**

**Do (B) keep PostgreSQL as primary and migrate gradually:**

1. **MongoDB** – Already out of the hot path. Only optional migration script and test wording remain. You can leave the script as-is or remove it later; no urgency.
2. **Airtable** – Keep as **fallback** until:
   - Listing data is in PostgreSQL (cities, listings, listing_images, listing_amenities),
   - Public apartments API is tested and optionally made PG-only,
   - Then remove Airtable from code and from `requirements.txt`.

So: **B) Introduce PostgreSQL alongside (already done) and migrate gradually; remove Airtable only after listings and API are fully on PostgreSQL.**

---

## 4. Migration Strategy (Concrete Steps)

### Step 1 – Infrastructure

- Add **Docker PostgreSQL** for local dev (no need to change sync/async).
  - Add `docker-compose.yml` with a `db` service (e.g. Postgres 15/16), port 5432, volume, env for user/password/db name.
  - Document: `docker compose up -d db`, then set `DATABASE_URL=postgresql+psycopg2://...` (keep **psycopg2**, not asyncpg).
- **Do not** switch to async SQLAlchemy or asyncpg in this step.
- **Do not** remove Airtable or Airtable deps yet.

### Step 2 – Database models and schema

- You already have SQLModel models and `create_db()`. Keep using them.
- For **new** schema changes, you can:
  - **Option A:** Keep current approach: `create_db()` + manual scripts (e.g. `ensure_*_columns.py`) for existing DBs.
  - **Option B:** Introduce **Alembic** and start generating revisions for **new** changes only; run existing scripts once for existing DBs, then manage going forward with Alembic.
- Ensure `backend/.env` has a valid `DATABASE_URL` (or `PG_*`) for local Docker Postgres.

### Step 3 – Data migration from Airtable

- Build a **one-off script** (or use existing patterns): connect to Airtable, fetch apartments, map to your PostgreSQL schema (City, Listing, ListingImage, ListingAmenity, Unit if needed), insert via SQLModel/session. Run against local (or staging) DB.
- Validate: `GET /api/apartments` and `GET /api/apartments/{id}` return the same shape from PostgreSQL.
- Optionally add a **feature flag or env** to force “PostgreSQL only” for apartments so you can test without Airtable.

### Step 4 – API refactoring (apartments)

- When listings are in PostgreSQL and you’re confident:
  - Change `routes_apartments.py` to use **only** PostgreSQL (listings_service); remove Airtable fallback and `airtable_service` import.
  - Return 404 or empty list when DB is missing or has no data, if that’s acceptable.
- Then remove Airtable from `requirements.txt` and delete or archive `airtable_service.py`. Clean `.env` (remove Airtable vars).

### Step 5 – Remove Airtable and Mongo completely

- Remove Airtable packages and code (see Step 4).
- MongoDB: already unused at runtime. Optionally remove `migrate_mongo_inquiries_to_postgres.py` or keep for historical reference; update test copy in `test_apartments_contacts.py` from “MongoDB database” to “PostgreSQL” (or similar).

---

## 5. Specific Evaluations

### 5.1 Is async SQLAlchemy appropriate here?

- **Current:** Sync SQLModel/SQLAlchemy with psycopg2; FastAPI runs sync route code in a thread pool.
- **Verdict:** Async is **not** required for correctness or for your current scale. Introducing it would be a large refactor (engine, sessions, all usages) with little short-term benefit. **Recommendation:** stay **sync** for now; consider async only if you later have clear performance or concurrency needs.

### 5.2 Is Docker PostgreSQL the best local setup?

- **Verdict:** **Yes.** You have no compose file today; adding a `db` service gives a consistent local Postgres and matches the suggested pattern. Use `postgresql+psycopg2` in `DATABASE_URL`, not `asyncpg`.

### 5.3 Should Alembic be introduced now?

- **Verdict:** **Optional, not blocking.** Your current approach (create_db + manual ALTER scripts) works. Introducing Alembic is useful once you want versioned, repeatable migrations and multiple environments. If you introduce it:
  - Add `alembic` to `requirements.txt`, run `alembic init`.
  - Either create an initial revision from the current schema or start using Alembic only for **new** changes and keep running existing scripts once for existing DBs.

---

## 6. Summary Table

| Claude’s Step 1 item | Use as-is? | Action in your repo |
|----------------------|------------|----------------------|
| Docker Postgres      | Yes        | Add `docker-compose.yml`; use `postgresql+psycopg2` in URL. |
| Update requirements  | Partially  | Do **not** add asyncpg or sqlalchemy[asyncio]. Do **not** remove Airtable until Step 4. Add alembic only if you want it. |
| Alembic init         | Optional   | Yes if you want versioned migrations; not required for “Step 1”. |
| Clean .env           | After migration | Remove Airtable/Mongo vars only after removing their usage (Step 4/5). |
| Remove pymongo/motor | N/A        | Already not in requirements. |
| Remove Airtable      | No (not yet) | Only after listings are in PostgreSQL and API is refactored (Steps 3–4). |

**Bottom line:** Claude’s direction (PostgreSQL as single DB, Docker, cleaner env) is right, but the **implementation** must match your **current sync stack** and **existing use of Airtable as fallback**. Prefer the gradual migration (B) and the step order above; avoid a big-bang switch to async or dropping Airtable before the data and API are on PostgreSQL.
