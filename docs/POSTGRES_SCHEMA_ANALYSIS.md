# PostgreSQL Schema & SQLModel Analysis — FeelAtHomeNow

**Purpose:** Verify whether the database schema matches the intended core architecture.  
**Constraints:** Analysis only. No code changes, no new migrations. PostgreSQL only; Alembic for future migrations.

---

## SECTION 1 — Existing SQLModel models

All table-backed models are in `backend/db/models.py`. Summary:

| Model             | Table name         | Purpose |
|-------------------|--------------------|--------|
| City              | `cities`           | Reference: city code, name_de, name_en |
| Unit              | `unit`             | Operational property/unit (address, rooms, city_id) |
| Room              | `room`             | Rentable room within a unit (unit_id, name, price, floor, is_active) |
| Listing           | `listings`         | Public website listing (unit_id, room_id?, city_id, slug, titles, price, is_published, etc.) |
| ListingImage      | `listing_images`   | Images for a listing (listing_id, url, is_main, position) |
| ListingAmenity    | `listing_amenities`| Amenities per listing (listing_id, label_de, label_en) |
| Inquiry           | `inquiries`        | Contact form submissions (name, email, message, apartment_id→listings.id) |
| Tenant            | `tenant`           | Tenant person (name, email, room_id?, phone, company) |
| Tenancy           | `tenancies`        | Tenant–room–unit link over time (tenant_id, room_id, unit_id, move_in/out, rent_chf, status) |
| Invoice           | `invoices`         | Billing (tenant_id, tenancy_id, room_id, unit_id, amount, status, paid_at, etc.) |
| UnitCost          | `unit_costs`       | Costs per unit (unit_id, cost_type, amount_chf) |
| User              | `users`            | Auth user (email, full_name, role, is_active) |
| UserCredentials   | `user_credentials` | Password credentials (user_id→users.id, password_hash) |

**Total: 14 SQLModel tables.**  
There is no SQLModel for: `properties` (separate from units), or a table named `contact_leads` (concept covered by `inquiries`).

---

## SECTION 2 — Actual PostgreSQL tables

Tables present in the database (from `inspect(engine).get_table_names()`):

| Table               | Source / use |
|---------------------|--------------|
| `alembic_version`   | Alembic |
| `cities`            | SQLModel (City) |
| `unit`              | SQLModel (Unit) |
| `room`              | SQLModel (Room) |
| `listings`          | SQLModel (Listing) |
| `listing_images`    | SQLModel (ListingImage) |
| `listing_amenities` | SQLModel (ListingAmenity) |
| `inquiries`         | SQLModel (Inquiry) |
| `tenant`            | SQLModel (Tenant) |
| `tenancies`         | SQLModel (Tenancy) — **note:** DB columns may differ (see Section 5) |
| `invoices`          | SQLModel (Invoice) — **note:** DB has extra columns (e.g. period_start, period_end, invoice_type, notes) |
| `unit_costs`        | SQLModel (UnitCost) |
| `users`             | SQLModel (User) |
| `user_credentials`  | SQLModel (UserCredentials) |
| `billing_runs`      | Legacy / other (no SQLModel in current codebase) |
| `documents`         | Legacy / other |
| `expenses`          | Legacy / other |
| `landlords`         | Legacy / other |
| `management_companies` | Legacy / other |
| `payments`          | Legacy / other |
| `property_managers` | Legacy / other |
| `rooms`             | Legacy (plural; different schema from `room`) |
| `tenants`           | Legacy (plural; different schema from `tenant`) |
| `units`             | Legacy (plural; different schema from `unit`) |

**Core tables used by the app (singular / SQLModel):**  
`cities`, `unit`, `room`, `listings`, `listing_images`, `listing_amenities`, `inquiries`, `tenant`, `tenancies`, `invoices`, `unit_costs`, `users`, `user_credentials`.

**Legacy/other tables (no current SQLModel or different concept):**  
`units`, `rooms`, `tenants`, `billing_runs`, `documents`, `expenses`, `landlords`, `management_companies`, `payments`, `property_managers`.

---

## SECTION 3 — Tables matching the target architecture

Target concepts you asked about: **users**, **properties**, **units**, **listings**, **tenancies**, **contact_leads**.

| Target table    | Current state | Notes |
|-----------------|---------------|--------|
| **users**       | ✅ Exists      | `users` — id, email, full_name, role, is_active, last_login_at, created_at, updated_at. Matches User model. |
| **properties**  | ❌ No table    | No `properties` table. Operational “property” is represented by **unit** (one table for the rentable unit/building). If “property” = building and “unit” = apartment, you could introduce `properties` later and link `unit` to it. |
| **units**       | ✅ Exists      | **Table name is `unit`** (singular). Columns: id, title, address, city, rooms, type, city_id, created_at. Matches Unit model. |
| **listings**    | ✅ Exists      | `listings` — full listing layer (unit_id, room_id, city_id, slug, title_de/en, price_chf_month, is_published, availability_status, etc.). Matches Listing model. |
| **tenancies**   | ✅ Exists      | `tenancies` — tenant_id, room_id, move_in_date, move_out_date, status, etc. **Schema drift:** DB also has start_date, end_date, monthly_rent, deposit_amount, billing_cycle, notice_period_months, contract_signed_at, notes. Model has rent_chf, deposit_chf (no start_date/end_date). See Section 5. |
| **contact_leads** | ✅ Concept exists, different name | **`inquiries`** — contact form submissions. Fields: id, name, email, message, phone, company, language, apartment_id (→ listings.id), email_sent, created_at. Same concept as “contact_leads”. |

**Summary:**  
- **users**, **units** (as `unit`), **listings**, **tenancies** exist and are the main tables for the app.  
- **contact_leads** is implemented as **inquiries**.  
- **properties** does not exist; “property” is currently folded into **unit**.

---

## SECTION 4 — Missing tables

- **properties** — Not present. Optional if you later want a hierarchy: property (building) → units. Not required for current architecture.
- No other *required* core tables are missing for the current codebase; all SQLModel-backed features have a matching table.

**Legacy tables that have no SQLModel** (present in DB but not in `db/models.py`):  
`billing_runs`, `documents`, `expenses`, `landlords`, `management_companies`, `payments`, `property_managers`, `rooms`, `tenants`, `units`.  
These are “missing” from the model layer, not from the DB; the app does not rely on them in the current architecture.

---

## SECTION 5 — Tables that should probably be renamed or merged

### 5.1 Duplicate / parallel concepts (singular vs plural)

| Current (used by app) | Legacy (plural)   | Recommendation |
|------------------------|-------------------|----------------|
| `unit`                 | `units`           | Keep `unit` as source of truth. Treat `units` as legacy; migrate data into `unit` if needed, then deprecate or drop `units` via Alembic when safe. |
| `room`                 | `rooms`           | Same: keep `room`, treat `rooms` as legacy; consolidate then deprecate. |
| `tenant`               | `tenants`         | Same: keep `tenant`, treat `tenants` as legacy; consolidate then deprecate. |

Naming: the app and SQLModel use **singular** names (`unit`, `room`, `tenant`). No need to rename these to plural; the “duplication” is the extra **plural** tables with different schemas.

### 5.2 Schema drift (same table name, different columns)

- **tenancies**  
  - **Model:** tenant_id, room_id, unit_id, move_in_date, move_out_date, rent_chf, deposit_chf, status, created_at.  
  - **DB:** Also has start_date, end_date, monthly_rent, deposit_amount, billing_cycle, notice_period_months, contract_signed_at, notes.  
  - **Risk:** If the app only uses model-mapped columns, extra columns are harmless. If any code or report uses start_date/end_date or monthly_rent/deposit_amount, align naming (e.g. map to move_in/out, rent_chf, deposit_chf) or add columns to the model. Prefer **additive** Alembic migrations (add missing columns; avoid dropping columns with data until you are sure).

- **invoices**  
  - **DB** has extra columns (e.g. invoice_type, period_start, period_end, notes) vs the current Invoice model.  
  - Same approach: additive migrations only; add to the model only what the app needs; avoid deleting existing columns until data is migrated or no longer needed.

### 5.3 Foreign keys

- **Room.unit_id** — Model has `unit_id` with no explicit `foreign_key="unit.id"` in the snippet; in DB it’s likely an index. Ensure FK to `unit.id` exists in DB for integrity.
- **Tenant.room_id** — Optional; no FK to `room.id` in model (index only). Optional FKs are acceptable; add one in DB if you want referential integrity.
- **Invoice** — tenant_id, tenancy_id, room_id, unit_id are optional and not declared as FKs in the model; they are string refs. For strict integrity you could add FKs in DB; current design allows flexibility (e.g. orphaned invoices).

No **incorrect** FKs were identified; only optional tightening (Room→unit, Tenant→room, Invoice refs).

### 5.4 Fields that “should” exist (by common convention)

- **Unit:** No `property_id` — only relevant if you add a `properties` table later.
- **Listing:** Has unit_id, room_id, city_id — sufficient for current design.
- **Inquiry:** Has `apartment_id` → listings.id — correct for “contact lead” per listing.

No critical missing fields for the current architecture; optional future additions (e.g. soft deletes, updated_at on all tables) can be done via Alembic.

---

## SECTION 6 — Safest migration strategy (no data loss)

1. **Do not delete or drop** existing tables or columns that might hold data. Prefer additive changes only.
2. **Use Alembic** for all schema changes from now on (no ad‑hoc SQL or `create_all` for new changes).
3. **Duplicate tables (unit vs units, room vs rooms, tenant vs tenants):**
   - If `units`/`rooms`/`tenants` have data you need: write an Alembic migration that **copies** data into `unit`/`room`/`tenant` (with mapping and deduplication), then point all code at the singular tables.
   - After verification, stop writing to the plural tables; later, a separate migration can drop them (or rename to `_deprecated_units` etc.) once nothing reads them.
4. **Schema drift (tenancies, invoices):**
   - Add any **missing** columns from the model to the DB (e.g. rent_chf, deposit_chf if not present) via Alembic; do not drop existing columns (start_date, monthly_rent, etc.) until you have migrated logic and data.
   - Optionally add columns to the SQLModel so they are explicit (e.g. notes, period_start/end on Invoice) if the app will use them.
5. **New concepts (e.g. properties):**
   - Add new tables only via Alembic; add FKs (e.g. unit.property_id) in a follow‑up migration if you introduce `properties`.
6. **Renames:**  
   Avoid renaming tables that are in use; create new tables and migrate data, then switch the app and finally drop the old table, or use Alembic’s `alter_table` rename only when you are sure nothing else references the old name.
7. **Contact leads:**  
   No rename needed; keep `inquiries` as the table name. If you want “contact_leads” in the API or docs, do it at the API/naming layer, not by renaming the table (to avoid breaking existing code and references).

---

## Summary

- **SQLModel:** 14 tables; all have a corresponding table in PostgreSQL used by the app (`cities`, `unit`, `room`, `listings`, `listing_images`, `listing_amenities`, `inquiries`, `tenant`, `tenancies`, `invoices`, `unit_costs`, `users`, `user_credentials`).
- **Target architecture:** users ✅, units ✅ (as `unit`), listings ✅, tenancies ✅, contact_leads ✅ (as `inquiries`). properties ❌ (optional; currently covered by `unit`).
- **Issues:** Legacy duplicate tables (`units`, `rooms`, `tenants`); schema drift on `tenancies` and `invoices`; no incorrect FKs, only optional additions.
- **Strategy:** Additive Alembic migrations only; consolidate plural → singular with data migration; then deprecate/remove legacy tables; no PostgreSQL removal, no MongoDB/Airtable.
