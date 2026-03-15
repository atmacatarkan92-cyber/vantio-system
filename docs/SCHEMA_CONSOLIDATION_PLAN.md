# PostgreSQL Schema Consolidation Plan — FeelAtHomeNow

**Document type:** Implementation planning (no code or migration changes in this step)  
**Constraints:** PostgreSQL only; no Airtable/MongoDB for core runtime; Alembic for schema evolution; additive changes first; no deletion of legacy tables yet; no destructive migrations.

---

## Executive summary

The codebase uses **14 SQLModel-backed tables** (singular names: `unit`, `room`, `tenant`, plus `cities`, `listings`, `listing_images`, `listing_amenities`, `inquiries`, `tenancies`, `invoices`, `unit_costs`, `users`, `user_credentials`). The database also contains **legacy/duplicate tables** (`units`, `rooms`, `tenants`, `landlords`, `payments`, `billing_runs`, etc.) that are not used by the current application code. Schema drift exists on `tenancies` (DB has start_date/end_date/monthly_rent vs model move_in_date/move_out_date/rent_chf), `invoices` (DB has extra columns; target is tenancy_id-only reference), and `unit_costs` (no `billing_cycle` in DB or model today). The plan aligns the schema with the target direction (users, landlords, properties, units, rooms, listings, listing_images, listing_amenities, inquiries, tenants, tenancies, invoices, payments, unit_costs) via **additive migrations and clear table-by-table actions**. The smallest safe first step is to add a single Alembic migration that introduces **only additive changes** (e.g. `listings.available_from` / `available_to`, `payments.external_payment_id`, `unit_costs.billing_cycle`, and optionally `users.role` as a PostgreSQL ENUM) and to document the invoice/tenancy consolidation path without dropping or renaming tables yet.

---

## SECTION 1 — Current active schema in code

Tables that the application **actually uses** (via SQLModel and API/services):

| Table name           | Model      | Used by (examples) |
|----------------------|------------|--------------------|
| `cities`             | City       | listings_service, admin listings, units (city_id) |
| `unit`               | Unit       | routes_admin_units, listings (unit_id), tenancies, unit_costs, seed_listing_test_data |
| `room`               | Room       | routes_admin_rooms, listings (room_id), tenancies, occupancy_service |
| `listings`           | Listing    | routes_apartments, routes_admin_listings, listings_service, inquiries (apartment_id) |
| `listing_images`    | ListingImage | listings_service |
| `listing_amenities`  | ListingAmenity | listings_service |
| `inquiries`          | Inquiry    | server (contact), routes_admin_inquiries, migrate_mongo_inquiries |
| `tenant`             | Tenant     | routes_admin_tenants, tenancies |
| `tenancies`          | Tenancy    | routes_admin_tenancies, occupancy_service, revenue_forecast, invoice_generation_service, profit_service |
| `invoices`           | Invoice    | routes_invoices, invoice_service, invoice_generation_service |
| `unit_costs`         | UnitCost   | profit_service, routes_admin_dashboard (profit) |
| `users`              | User       | auth routes, create_admin_user, dependencies |
| `user_credentials`  | UserCredentials | auth routes, create_admin_user |

**Not in SQLModel but present in DB (legacy):**  
`units`, `rooms`, `tenants`, `landlords`, `management_companies`, `property_managers`, `payments`, `billing_runs`, `documents`, `expenses`.

**Reference data:**  
`cities` is the only reference table in the active schema; there is no `properties` or `landlords` model yet.

---

## SECTION 2 — Legacy / duplicate / conflicting tables

| Table                  | Role / conflict |
|------------------------|-----------------|
| `units`                | Legacy duplicate of `unit`. Different schema (e.g. landlord_id, management_company_id, total_rooms, unit_type). **Not** referenced in current app code. |
| `rooms`                | Legacy duplicate of `room`. Different columns (room_name, room_number, size_sqm, monthly_rent, status). **Not** referenced in current app code. |
| `tenants`              | Legacy duplicate of `tenant`. Different columns (first_name, last_name, nationality, birth_date). **Not** referenced in current app code. |
| `landlords`            | Legacy; no SQLModel. Columns: id, name, company, email, phone, address, zip, city, created_at. Target final schema includes `landlords`; to be adopted via new model + optional data migration from legacy. |
| `management_companies` | Legacy; no SQLModel. |
| `property_managers`    | Legacy; no SQLModel. |
| `payments`             | Legacy; no SQLModel. Columns: id, invoice_id, payment_date, amount, payment_method, reference, notes, created_at. Target schema includes `payments` with `external_payment_id` (nullable). |
| `billing_runs`         | Legacy; no SQLModel. |
| `documents`            | Legacy; no SQLModel. |
| `expenses`             | Legacy; no SQLModel. |

**Schema drift (same table name, different columns vs model):**

- **tenancies**  
  - **DB:** start_date, end_date, monthly_rent, deposit_amount, billing_cycle, notice_period_months, contract_signed_at, move_in_date, move_out_date, notes, …  
  - **Model:** move_in_date, move_out_date, rent_chf, deposit_chf, status, created_at (no start_date, end_date, monthly_rent, deposit_amount, billing_cycle in model).  
  - **Risk:** App uses model columns only. Legacy code (e.g. billing_service, seed_billing_data) may reference old column names. Additive approach: keep DB columns; ensure model has the columns the app needs; add missing model columns via Alembic if not present in DB.

- **invoices**  
  - **DB:** tenant_id, tenancy_id, room_id, unit_id, billing_year, billing_month, invoice_type, period_start, period_end, notes, …  
  - **Model:** Same plus paid_at, payment_method, payment_reference.  
  - **Target decision:** Invoices should reference **only tenancy_id** (tenant/room/unit derived from tenancy). Consolidation = stop writing tenant_id/room_id/unit_id in new code and, in a later phase, add a migration that backfills or constrains; do **not** drop columns in this plan.

- **unit_costs**  
  - **DB:** id, unit_id, cost_type, amount_chf, created_at (no billing_cycle).  
  - **Model:** Same.  
  - **Target decision:** Keep billing_cycle as source of truth. **Action:** Add `billing_cycle` (e.g. nullable or default 'monthly') via Alembic; then add to model.

---

## SECTION 3 — Final target schema mapping

Target tables (from your list):  
**users, landlords, properties, units, rooms, listings, listing_images, listing_amenities, inquiries, tenants, tenancies, invoices, payments, unit_costs.**

| Target table         | Current table(s)      | Intended action |
|----------------------|------------------------|-----------------|
| users                | `users`               | KEEP AND EXTEND (role as PG ENUM) |
| (user_credentials)   | `user_credentials`    | KEEP (auth; often implied by “users”) |
| landlords            | `landlords` (legacy)  | ADD NEW TABLE or adopt legacy: define SQLModel + optional data migration from existing `landlords`. |
| properties           | —                     | ADD NEW TABLE (optional; link unit → property later). |
| units                | `unit` (singular)     | KEEP; final name can stay `unit` or align to `units` only after legacy `units` is deprecated. |
| rooms                | `room` (singular)     | KEEP; same as above. |
| listings             | `listings`            | KEEP AND EXTEND (slug convention + auto-generate; available_from, available_to). |
| listing_images       | `listing_images`      | KEEP. |
| listing_amenities     | `listing_amenities`   | KEEP. |
| inquiries            | `inquiries`           | KEEP (contact_leads concept). |
| tenants              | `tenant` (singular)   | KEEP; align to `tenants` only after legacy `tenants` deprecated. |
| tenancies            | `tenancies`           | KEEP AND EXTEND (resolve drift: ensure move_in/out, rent_chf, deposit_chf in DB; keep or add billing_cycle as needed). |
| invoices             | `invoices`            | KEEP AND EXTEND (move to tenancy_id-only reference; additive only; do not drop tenant_id/room_id/unit_id yet). |
| payments             | `payments` (legacy)   | ADD NEW TABLE or adopt legacy: add SQLModel, add `external_payment_id` (nullable); link to invoices. |
| unit_costs           | `unit_costs`          | KEEP AND EXTEND (add billing_cycle). |

**cities:** Keep as reference; not in target list but required by listings/units.

---

## SECTION 4 — Exact table-by-table consolidation actions

| Current table        | Final table   | Action                | Notes |
|----------------------|---------------|------------------------|-------|
| `users`              | users         | **KEEP AND EXTEND**   | Add PostgreSQL ENUM for `role`; keep existing columns. |
| `user_credentials`   | user_credentials | **KEEP**           | No change for consolidation. |
| `unit`               | units         | **KEEP**              | Keep as primary; optionally add property_id later when properties exists. Do not rename to `units` until legacy `units` is deprecated. |
| `room`               | rooms         | **KEEP**              | Same; add explicit FK unit_id → unit.id if missing in DB. |
| `tenant`             | tenants       | **KEEP**              | Same; no rename until legacy `tenants` deprecated. |
| `cities`             | cities        | **KEEP**              | Reference data. |
| `listings`           | listings      | **KEEP AND EXTEND**   | Add available_from, available_to (date, nullable); define slug convention and default/auto-generation in app; add migration for new columns only. |
| `listing_images`    | listing_images | **KEEP**            | No change. |
| `listing_amenities`  | listing_amenities | **KEEP**          | No change. |
| `inquiries`          | inquiries     | **KEEP**              | Contact leads; no rename to contact_leads. |
| `tenancies`          | tenancies     | **KEEP AND EXTEND**   | Add missing model columns to DB if absent (rent_chf, deposit_chf); add billing_cycle if desired; do not drop start_date/end_date/monthly_rent yet. |
| `invoices`           | invoices      | **KEEP AND EXTEND**   | New code: reference only tenancy_id; add migration to add any missing columns; do not drop tenant_id/room_id/unit_id in this phase. |
| `unit_costs`         | unit_costs    | **KEEP AND EXTEND**   | Add billing_cycle (nullable or default 'monthly'); add to model. |
| `units` (legacy)     | —             | **MARK AS LEGACY**    | Do not drop; document as deprecated; later migrate data into `unit` if needed, then deprecate. |
| `rooms` (legacy)     | —             | **MARK AS LEGACY**    | Same. |
| `tenants` (legacy)   | —             | **MARK AS LEGACY**    | Same. |
| `landlords` (legacy) | landlords     | **MIGRATE INTO FINAL TABLE** or **ADD NEW TABLE** | Introduce Landlord SQLModel; either point to existing `landlords` table (after verifying schema) or create new table and migrate data. Prefer additive: new model on existing table if schema fits. |
| `payments` (legacy)  | payments      | **MIGRATE INTO FINAL TABLE** or **ADD NEW TABLE** | Add Payment SQLModel; add column external_payment_id (nullable); use existing `payments` table if schema fits, else new table + migration. |
| `properties`         | properties    | **ADD NEW TABLE**     | Optional; only when property hierarchy is needed; then add unit.property_id. |
| `billing_runs`       | —             | **MARK AS LEGACY**    | Do not drop. |
| `documents`          | —             | **MARK AS LEGACY**    | Do not drop. |
| `expenses`           | —             | **MARK AS LEGACY**    | Do not drop. |
| `management_companies` | —           | **MARK AS LEGACY**    | Do not drop. |
| `property_managers`  | —             | **MARK AS LEGACY**    | Do not drop. |

---

## SECTION 5 — Safe migration order

Recommended sequence (additive only; no drops or renames in this plan):

1. **Phase A — Additive only (safest first)**  
   - Add `listings.available_from`, `listings.available_to` (DATE, nullable).  
   - Add `unit_costs.billing_cycle` (VARCHAR, nullable or default 'monthly').  
   - Add `payments.external_payment_id` (VARCHAR, nullable) to existing `payments` table.  
   - Optionally: create PostgreSQL ENUM for `users.role` and add migration that adds the enum type and alters `users.role` to use it (additive: new type, then ALTER column to use it; preserve existing values).

2. **Phase B — Model and code alignment**  
   - Add Listing.available_from, Listing.available_to to SQLModel.  
   - Add UnitCost.billing_cycle to SQLModel.  
   - Introduce Payment SQLModel (and optionally Landlord SQLModel) mapping to existing tables; add external_payment_id to Payment if not already in table.  
   - Ensure Tenancy model and DB have consistent columns (rent_chf, deposit_chf, move_in_date, move_out_date); add any missing columns in DB via Alembic.  
   - Document and, in application code, prefer tenancy_id-only for new invoice rows; do not remove tenant_id/room_id/unit_id from DB or model yet.

3. **Phase C — Slug and listing convention**  
   - Define slug convention (e.g. `{city_code}-{title_slug}-{id_suffix}`); implement default/auto-generation in create/update listing service; add migration only if a new column or constraint is needed (e.g. default expression). Prefer app-level generation first.

4. **Phase D — Optional: properties and landlords**  
   - If desired: create `properties` table and unit.property_id; create Landlord model on `landlords` if schema fits; data migration from legacy only if needed.

5. **Phase E — Legacy deprecation (later, out of scope for “no destructive” plan)**  
   - After all consumers are off legacy tables: mark `units`, `rooms`, `tenants` as deprecated; eventually migrate data and drop only when safe.

---

## SECTION 6 — Risks / edge cases / things that could break

- **Invoice generation:** Currently writes tenant_id, room_id, unit_id from the tenancy. Moving to “tenancy_id only” is a **code change** (read tenant/room/unit from Tenancy when needed). Do not drop columns before all readers are updated; otherwise reporting or PDF generation could break.
- **Tenancies drift:** Legacy code (billing_service, seed_billing_data) references start_date, end_date, monthly_rent, billing_cycle. The active app uses move_in_date, move_out_date, rent_chf. Adding columns to the model that already exist in DB can cause SQLAlchemy to see them; ensure no duplicate column names. If you add rent_chf/deposit_chf to DB, legacy code using monthly_rent/deposit_amount remains valid until that code is removed.
- **users.role as ENUM:** Changing column type to ENUM can fail if existing values are not in the enum. Add enum with all current role values (platform_admin, ops_admin, tenant, landlord, property_manager); backfill or constrain invalid values before altering.
- **listings.slug auto-generation:** If you add a DB default (e.g. generated column), existing rows may need backfill. Safer: implement in application code first; add DB default later if required.
- **Room.unit_id:** Model has no explicit `foreign_key="unit.id"`; the 001 migration adds the FK. Ensure DB actually has the constraint; if not, add via Alembic (additive).
- **Legacy tables:** Any script or report that still reads from `units`, `rooms`, `tenants`, or old tenancy/invoice columns will keep working until those are dropped or renamed. Mark-as-legacy and documentation reduce risk of new dependencies.

---

## SECTION 7 — Files that will likely need updating later

(When you implement migrations and code changes in a later step.)

| Area | Files |
|------|--------|
| **Models** | `backend/db/models.py` (Listing available_from/available_to; UnitCost billing_cycle; User role enum; Payment/Landlord if added; Invoice eventually tenancy_id-only in code). |
| **Migrations** | `backend/alembic/versions/` (new revision(s) for additive columns and enum). |
| **Listings** | `backend/app/services/listings_service.py` (slug default/auto; available_from/available_to); `backend/app/api/v1/routes_admin_listings.py` (accept new fields). |
| **Invoices** | `backend/app/services/invoice_generation_service.py` (stop writing tenant_id/room_id/unit_id; use tenancy_id only; derive tenant/room/unit from Tenancy when needed); `backend/app/services/invoice_service.py` (API can still return derived tenant/room/unit for backward compatibility). |
| **Profit / unit_costs** | `backend/app/services/profit_service.py` (use billing_cycle when present). |
| **Auth** | `backend/auth/` (ensure role enum values match DB enum). |
| **Legacy** | `backend/services/billing_service.py`, `backend/seed_billing_data.py` (already deprecated; do not rely on for new logic). |
| **Admin / frontend** | Any admin UI that edits listings (slug, availability), invoices, or payments. |
| **Tests** | `backend/tests/test_apartments_contacts.py` and any tests hitting invoices, tenancies, or listings. |

---

## Explicit mapping: current table → final table → action → notes

| Current table | Final table | Action | Notes |
|---------------|-------------|--------|--------|
| users | users | KEEP AND EXTEND | Add PG ENUM for role. |
| user_credentials | user_credentials | KEEP | No schema change. |
| unit | units (conceptual) | KEEP | Keep table name `unit` until legacy `units` deprecated. |
| room | rooms (conceptual) | KEEP | Keep table name `room`; ensure FK to unit. |
| tenant | tenants (conceptual) | KEEP | Keep table name `tenant`. |
| cities | cities | KEEP | Reference. |
| listings | listings | KEEP AND EXTEND | Add available_from, available_to; slug convention + auto. |
| listing_images | listing_images | KEEP | — |
| listing_amenities | listing_amenities | KEEP | — |
| inquiries | inquiries | KEEP | Contact leads. |
| tenancies | tenancies | KEEP AND EXTEND | Align model/DB (rent_chf, deposit_chf, billing_cycle); do not drop legacy columns yet. |
| invoices | invoices | KEEP AND EXTEND | Code: reference only tenancy_id; DB: keep columns, no drop. |
| unit_costs | unit_costs | KEEP AND EXTEND | Add billing_cycle. |
| payments (legacy) | payments | MIGRATE INTO FINAL TABLE | Add model + external_payment_id. |
| landlords (legacy) | landlords | MIGRATE INTO FINAL TABLE | Add model; adopt table if schema fits. |
| units (legacy) | — | MARK AS LEGACY | Do not drop. |
| rooms (legacy) | — | MARK AS LEGACY | Do not drop. |
| tenants (legacy) | — | MARK AS LEGACY | Do not drop. |
| properties (missing) | properties | ADD NEW TABLE | Optional; when needed. |

---

## Smallest safe first implementation step (recommended)

**Do not create migrations or change code in this step.** When you are ready to implement:

1. **Create one Alembic revision** (additive only) that:
   - Adds `listings.available_from` (DATE, nullable) and `listings.available_to` (DATE, nullable).
   - Adds `unit_costs.billing_cycle` (VARCHAR(50), nullable or default `'monthly'`).
   - Adds `payments.external_payment_id` (VARCHAR(255), nullable) to the existing `payments` table.

2. **Update SQLModel only** for these columns:  
   Add `available_from` and `available_to` to `Listing`; add `billing_cycle` to `UnitCost`.  
   Do **not** yet add a Payment model or change invoice/tenancy logic.

3. **Run the migration** on a copy of the DB or dev; run the app and confirm no regressions.

This gives you a single, reversible, additive migration and aligns the schema with the stated decisions (listings availability, unit_costs billing_cycle, payments external_payment_id) without touching legacy tables, invoice references, or role enum yet.

---

## Phase E candidates

Columns/tables that are legacy-only and candidates for removal in a later Phase E (after all consumers are migrated):

- **tenancies.start_date** — legacy; only used in deprecated billing_service.
- **tenancies.end_date** — legacy; only used in deprecated billing_service.
- **tenancies.monthly_rent** — legacy; only used in deprecated billing_service.

(Do not drop these in Phase B; list here for future cleanup.)

---

## Phase C completed (listings.slug convention)

- **Convention:** Slug is lowercase, hyphen-separated, ASCII-safe, deterministic. Source: `city_code` + `"-"` + normalized title (e.g. `title_en` or `title_de`). Example: `zurich-studio-zentrum`. Non-ASCII (ä, ö, ü, ß) normalized to ASCII.
- **Duplicates:** When generating on create, if the candidate slug already exists, append `-2`, `-3`, etc. until unique.
- **Public API:** List and detail responses now include `slug`. No migration (column and unique index already existed).
- **Lookup by slug:** `GET /api/apartments/{apartment_id}` accepts either id or slug: tries id first, then slug. Backward compatible.
- **Create:** Admin create listing accepts optional `slug`; if omitted, slug is auto-generated from city + title with uniqueness.
- **Limitations / follow-up:** Frontend still uses id in URLs (`/apartments/:id`). Optional Phase D/E: switch frontend to slug-based URLs for SEO; no further schema change required.

---

## Phase D completed (properties table, landlords structure)

- **landlords_legacy:** Existing `landlords` table was renamed to `landlords_legacy` (not dropped; no data migration). It is a **Phase E cleanup candidate** when migrating data into the new `landlords` table.
- **landlords (new):** New table with id, user_id (nullable, FK users.id), company_name, contact_name, email, phone, notes, status, created_at, updated_at, deleted_at. SQLModel: `Landlord`.
- **properties (new):** New table with id, landlord_id (nullable, FK landlords.id), title, street, house_number, zip_code, city, country, lat, lng, status, notes, created_at, updated_at, deleted_at. SQLModel: `Property`.
- **unit.property_id:** Added nullable column with FK to properties.id and index. No NOT NULL; existing units unchanged.
- **Migration:** Single revision `005_phase_d_properties_landlords`. No router, service, or frontend changes in this phase.

---

**End of consolidation plan.** No code or migrations have been generated; this document is for implementation planning only.
