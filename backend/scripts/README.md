# Backend Scripts Inventory

## Purpose

This directory holds **operational and maintenance scripts** for the FeelAtHomeNow backend: database bootstrap helpers, privileged audits, production seed utilities, container entrypoints, and development-only test data tools. It is not part of the request-handling application code; scripts are invoked deliberately by operators or CI.

**Any script that can change production data or schema must be reviewed in full before execution in production**—including those marked “safe” for read-only use, if they are pointed at a production URL by mistake.

## Safety rules

- **Read the script** (and its module docstring) before running it against any shared or production database.
- **Never run data-changing scripts on production without a verified backup** and a clear rollback or recovery plan.
- **Prefer dry-run or audit modes** when the script offers them (for example, run `audit_invoice_tenancy_linkage` without `--apply` first).
- **Schema changes belong in Alembic** in normal releases. One-off `ALTER` or `create_all()` repair scripts are escape hatches; coordinate with the current Alembic revision (`alembic current` / `alembic history`) so manual fixes do not fight automated migrations.
- **Privileged URLs**: scripts that require `MIGRATE_DATABASE_URL` bypass RLS or use superuser-style access—use only with credentials and scope you intend.

## Status legend

| Status | Meaning |
|--------|---------|
| **ACTIVE** | Still relevant to production operations, deployment, or supported repair/bootstrap flows today. |
| **DEV_ONLY** | Useful for local development, staging experiments, or diagnostics; not intended as routine production operations. |
| **OBSOLETE** | Superseded by migrations, removed schema, or completed one-offs; kept under `obsolete/` for history and forensics, not for casual re-runs. |

## Inventory

| Script | Status | Purpose | Safe in production? | Notes |
|--------|--------|---------|---------------------|-------|
| `__init__.py` | ACTIVE | Declares `scripts` as a Python package. | N/A | Not executed standalone. |
| `audit_invoice_tenancy_linkage.py` | ACTIVE | Classifies invoice→tenancy linkage using **MIGRATE_DATABASE_URL** (RLS bypass); optional `--apply` sets `tenancy_id` only for `RECOVERABLE` rows. | **WITH REVIEW** | Default run is read/classify only. `--apply` mutates invoices—review output and backup first. ⚠️ WRITES TO DATABASE |
| `ci_grant_app_role.py` | ACTIVE | Creates/updates `feelathomenow_app` role, grants DML on `public`, default privileges from migration role. | **WITH REVIEW** | Invoked from `entrypoint.sh` after migrations. Alters roles and grants; requires privileged DB URL. ⚠️ WRITES TO DATABASE |
| `entrypoint.sh` | ACTIVE | Container startup: `alembic upgrade head`, `ci_grant_app_role.py`, then `uvicorn`. | **WITH REVIEW** | Defines production boot sequence; not run ad hoc on a workstation against prod without intent. ⚠️ WRITES TO DATABASE |
| `ensure_units_rooms_tenants_columns.py` | ACTIVE | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on `unit`, `room`, `tenant` for columns expected by admin APIs (referenced in app error hints). | **WITH REVIEW** | Schema drift repair. Prefer Alembic in normal process; use when DB lags migrations. ⚠️ WRITES TO DATABASE |
| `seed_production_admin.py` | ACTIVE | Idempotent creation of default org admin user + credentials (`test@feelathomenow.com`). | **WITH REVIEW** | Writes users and credentials to the DB pointed to by `DATABASE_URL`. Known default password in source—only for agreed bootstrap scenarios. ⚠️ WRITES TO DATABASE |
| `seed_production_portal_users.py` | ACTIVE | Idempotent tenant/landlord test users; **always resets password hashes** to documented test values. | **WITH REVIEW** | Mutates credentials on every run for existing users. Intended for controlled production test accounts, not arbitrary prod DBs. ⚠️ DESTRUCTIVE (DELETE / OVERWRITE) |
| `verify_listing_tables.py` | ACTIVE | Read-only check that listing-layer tables exist (`cities`, `listings`, etc.). | **YES** | No writes; safe health check if listing stack is deployed. |
| `create_landlord_test_user.py` | DEV_ONLY | Ensures landlord test user + `Landlord` row (prompt/env password). | **NO** | Test account workflow; overlaps conceptually with portal seed scripts—avoid on production unless explicitly intended. ⚠️ WRITES TO DATABASE |
| `ensure_listing_tables.py` | DEV_ONLY | `SQLModel.metadata.create_all()` for listing tables only. | **NO** | Bypasses Alembic ordering; risk of drift vs migration history on shared DBs. For local/bootstrap only. ⚠️ WRITES TO DATABASE |
| `phase_e_audit_tables.py` | DEV_ONLY | Lists public tables and row counts (read-only). | **NO** | Embeds a default local connection string if `DATABASE_URL` unset—easy to hit the wrong DB. Prefer explicit env in any shared environment. |
| `README_LISTING_SEED.md` | DEV_ONLY | Documents listing verify/ensure/seed flow. | **N/A** | Documentation only. |
| `seed_listing_test_data.py` | DEV_ONLY | Inserts one published test listing (Zurich slug) for API smoke tests. | **NO** | Inserts marketing/listing rows; idempotent by slug but inappropriate for real prod catalog. ⚠️ WRITES TO DATABASE |
| `seed_listing_test_data.sql` | DEV_ONLY | SQL equivalent of listing test seed (fixed UUIDs). | **NO** | Same intent as Python seed; run only in dev/staging. ⚠️ WRITES TO DATABASE |
| `seed_tenant_portal_test_data.py` | DEV_ONLY | Creates minimal unit/room/tenant links; hard-coded test user id; may reassign orphan tenancy. | **NO** | Mutates tenancy linkage for test convenience. ⚠️ WRITES TO DATABASE |
| `seed_tenant_portal_tenancy_invoice.py` | DEV_ONLY | Links/creates tenancy and test invoice for a hard-coded tenant id. | **NO** | Raw SQL updates; writes tenancies/invoices. ⚠️ WRITES TO DATABASE |
| `show_users_check.py` | DEV_ONLY | Prints `users` check constraints from PostgreSQL. | **YES** | Read-only; ad hoc debugging. |
| `test_tenant_portal_api.py` | DEV_ONLY | FastAPI `TestClient` smoke test for tenant JWT and portal routes. | **YES** | No direct DB script; uses app + optional login. For local verification. |
| `obsolete/__init__.py` | OBSOLETE | Marker for legacy script package. | **N/A** | See `obsolete/` directory. |
| `obsolete/check_legacy_tables.py` | OBSOLETE | Counted rows in legacy plural table names (`rooms`, etc.). | **NO** | Obsolete: `rooms` and related legacy paths removed (e.g. Alembic 009). |
| `obsolete/delete_orphan_test_tenant.py` | OBSOLETE | Deleted one hard-coded tenant UUID. | **NO** | One-off cleanup by hard-coded tenant id. ⚠️ DESTRUCTIVE (DELETE / OVERWRITE) |
| `obsolete/ensure_invoice_payment_columns.py` | OBSOLETE | `ALTER TABLE invoices` add payment columns. | **NO** | Obsolete: superseded by Alembic baseline/migrations for invoice schema. ⚠️ WRITES TO DATABASE |
| `obsolete/ensure_invoice_tenancy_columns.py` | OBSOLETE | `ALTER TABLE invoices` add tenancy-related columns. | **NO** | Obsolete: superseded by Alembic. ⚠️ WRITES TO DATABASE |
| `obsolete/fix_listing_availability_column.py` | OBSOLETE | Added `listings.availability_status`. | **NO** | Obsolete: column belongs in normal schema/migrations. ⚠️ WRITES TO DATABASE |
| `obsolete/update_tenant_test_email_sql.py` | OBSOLETE | One-off email domain rewrite. | **NO** | Historical data fix. ⚠️ WRITES TO DATABASE |
| `obsolete/update_users_role_and_check.py` | OBSOLETE | Enum/`users.role` migration (`platform_admin` → `admin`). | **NO** | Obsolete: role model handled in migrations. ⚠️ WRITES TO DATABASE |

## Notes

- **Obsolete scripts are not deleted** so past incidents, diffs, and runbooks remain traceable. Treat them as archival unless you have a specific forensic need.
- When in doubt between **ACTIVE** and **OBSOLETE**, this inventory errs toward **ACTIVE** if the script could still help a recovery, and toward **DEV_ONLY** if it is useful but unsafe or irrelevant for routine production use.
