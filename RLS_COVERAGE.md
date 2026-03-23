# RLS coverage (PostgreSQL)

Source: `backend/alembic/versions/025_rls_core_tables.py` (and policy names therein). Policies compare `organization_id` (or parent unit) to `current_setting('app.current_organization_id', true)` — see migration header comments for UUID/VARCHAR text matching.

**FORCE ROW LEVEL SECURITY:** Not used on these core tables in `025` — only `ENABLE ROW LEVEL SECURITY` + policies. (Other migrations: `023_rls_unit_tenant_room.py` uses `FORCE` on `unit`, `tenant`, `room`; out of scope for the table list below.)

## Core tables

| Table | RLS enabled | FORCE RLS | Policy type |
|-------|-------------|-----------|-------------|
| `invoices` | yes | no | `org_isolation_invoices` — `organization_id` matches session GUC (`FOR ALL`, `USING` / `WITH CHECK`) |
| `landlords` | yes | no | `org_isolation_landlords` — same direct `organization_id` pattern |
| `tenancies` | yes | no | `org_isolation_tenancies` — same direct `organization_id` pattern |
| `properties` | yes | no | `org_isolation_properties` — same direct `organization_id` pattern |
| `unit_costs` | yes | no | `org_isolation_unit_costs` — **no `organization_id` column**; isolation via `EXISTS` subquery on `unit` where `unit.id = unit_costs.unit_id` and `unit.organization_id` matches GUC (`FOR ALL`, `USING` / `WITH CHECK`) |

## Deferred / not covered by `025`

| Table | Notes |
|-------|--------|
| `users` | Explicitly out of scope in migration `025` docstring; no RLS policy added there. |
| `audit_logs` | Explicitly out of scope in migration `025` docstring; table created in `013_audit_logs.py` without RLS. |

## Policy pattern

- **Direct org columns:** `tenancies`, `invoices`, `properties`, `landlords` — row `organization_id::text = current_setting('app.current_organization_id', true)`.
- **Indirect:** `unit_costs` — parent `unit.organization_id` must match the same GUC.

Application-side GUC binding: `backend/db/rls.py` (`apply_pg_organization_context`, `Session.after_begin`).
