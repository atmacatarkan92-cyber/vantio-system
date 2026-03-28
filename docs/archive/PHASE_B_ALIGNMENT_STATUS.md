# Phase B alignment status: tenancies and invoices (read-only analysis)

**Scope:** Database schema vs SQLModel definitions for `tenancies` and `invoices`.  
**No code, migrations, or renames were modified.**

---

## Section A — Tenancies: DB columns

Columns currently present in the **PostgreSQL** `tenancies` table (from `information_schema.columns` and `inspect(engine).get_columns`):

| # | Column name (as in DB) |
|---|------------------------|
| 1 | id |
| 2 | tenant_id |
| 3 | room_id |
| 4 | start_date |
| 5 | end_date |
| 6 | monthly_rent |
| 7 | deposit_amount |
| 8 | billing_cycle |
| 9 | notice_period_months |
| 10 | status |
| 11 | contract_signed_at |
| 12 | move_in_date |
| 13 | move_out_date date *(possible single column name including space; or display artifact)* |
| 14 | notes |
| 15 | created_at |

**Presence of legacy-style columns:**

- **start_date:** Present in DB.
- **end_date:** Present in DB.
- **monthly_rent:** Present in DB.

**Presence of model-style columns:**

- **move_in_date:** Present in DB.
- **move_out_date:** DB shows a column that may be named `move_out_date` or `move_out_date date` (see note above).

**Not present in DB (expected by SQLModel):**

- **rent_chf:** Not in the listed DB columns (DB has `monthly_rent` instead).
- **deposit_chf:** Not in the listed DB columns (DB has `deposit_amount` instead).
- **unit_id:** Not in the listed DB columns (model has `unit_id`).

So the live `tenancies` table appears to use a legacy layout (start_date, end_date, monthly_rent, deposit_amount, etc.) and does **not** expose `rent_chf`, `deposit_chf`, or `unit_id` in the inspected column set. If the app uses the Tenancy model against this table as-is, reads/writes for those fields would fail unless the table was later altered or the inspector list is incomplete.

---

## Section B — Tenancies: SQLModel fields

Fields defined on the **Tenancy** SQLModel class (`backend/db/models.py`):

| Field | Type | Notes |
|-------|------|--------|
| id | str (PK) | |
| tenant_id | str (FK tenant.id) | |
| room_id | str (FK room.id) | |
| unit_id | str (FK unit.id) | |
| move_in_date | date | Required. |
| move_out_date | Optional[date] | |
| rent_chf | float | Default 0. |
| deposit_chf | Optional[float] | |
| status | TenancyStatus (Enum) | |
| created_at | datetime | |

**Presence of model-only fields:**

- **move_in_date:** Yes, in model.
- **move_out_date:** Yes, in model.
- **rent_chf:** Yes, in model (no `monthly_rent` in model).

**Not in SQLModel (but present in DB):**

- start_date  
- end_date  
- monthly_rent  
- deposit_amount  
- billing_cycle  
- notice_period_months  
- contract_signed_at  
- notes  

---

## Section C — Tenancies: Mismatches

| Category | DB | SQLModel | Mismatch |
|----------|----|----------|----------|
| Date range (legacy) | start_date, end_date | — | Model has no start_date/end_date; DB has both. |
| Date range (current) | move_in_date, move_out_date (or similar) | move_in_date, move_out_date | move_out_date column name in DB may be `move_out_date date` (space); needs verification. |
| Rent | monthly_rent | rent_chf | Different names; DB has monthly_rent, model has rent_chf. |
| Deposit | deposit_amount | deposit_chf | Different names; DB has deposit_amount, model has deposit_chf. |
| Unit link | (not in inspected columns) | unit_id | Model has unit_id; DB column list did not include unit_id. |
| Extra in DB | billing_cycle, notice_period_months, contract_signed_at, notes | — | Model does not define these. |

**Summary:**

- **DB uses:** start_date, end_date, monthly_rent, deposit_amount (and move_in_date; move_out_date naming unclear).  
- **SQLModel uses:** move_in_date, move_out_date, rent_chf, deposit_chf, unit_id.  
- **Naming mismatch:** rent_chf ↔ monthly_rent, deposit_chf ↔ deposit_amount.  
- **Structural mismatch:** Model expects unit_id and rent_chf/deposit_chf; DB (from this inspection) has legacy names and no unit_id in the list.  
- **Risk:** If the table was never migrated to add rent_chf, deposit_chf, unit_id (and to keep move_in_date/move_out_date), OR if the application runs against a DB that only has the legacy columns, ORM reads/writes for Tenancy will fail or be wrong for those fields.

---

## Section D — Invoices: DB columns

Columns currently present in the **PostgreSQL** `invoices` table:

| # | Column name |
|---|-------------|
| 1 | id |
| 2 | tenancy_id |
| 3 | invoice_number |
| 4 | invoice_type |
| 5 | issue_date |
| 6 | due_date |
| 7 | period_start |
| 8 | period_end |
| 9 | amount |
| 10 | currency |
| 11 | status |
| 12 | notes |
| 13 | created_at |
| 14 | paid_at |
| 15 | payment_method |
| 16 | payment_reference |
| 17 | tenant_id |
| 18 | room_id |
| 19 | unit_id |
| 20 | billing_year |
| 21 | billing_month |

**Presence of reference columns:**

- **tenant_id:** Present in DB.  
- **unit_id:** Present in DB.  
- **tenancy_id:** Present in DB and is the intended primary relational reference (invoices → tenancies).

So the DB has both the denormalized refs (tenant_id, room_id, unit_id) and tenancy_id.

---

## Section E — Invoices: SQLModel fields

Fields defined on the **Invoice** SQLModel class (`backend/db/models.py`):

| Field | Type | Notes |
|-------|------|--------|
| id | Optional[int] (PK) | |
| invoice_number | Optional[str] | |
| tenant_id | Optional[str] | |
| tenancy_id | Optional[str] | |
| room_id | Optional[str] | |
| unit_id | Optional[str] | |
| billing_year | Optional[int] | |
| billing_month | Optional[int] | |
| amount | float | |
| currency | str | |
| status | str | |
| issue_date | date | |
| due_date | date | |
| paid_at | Optional[datetime] | |
| payment_method | Optional[str] | |
| payment_reference | Optional[str] | |

**Not in SQLModel (but present in DB):**

- invoice_type  
- period_start  
- period_end  
- notes  
- created_at  

---

## Section F — Invoices: Mismatches

| Category | DB | SQLModel | Mismatch |
|----------|----|----------|----------|
| Primary reference | tenancy_id | tenancy_id | Aligned; tenancy_id exists and is the main link to tenancies. |
| Denormalized refs | tenant_id, room_id, unit_id | tenant_id, room_id, unit_id | Aligned; both DB and model have them. |
| Extra in DB | invoice_type, period_start, period_end, notes, created_at | — | Model does not define these; they are “extra” in DB only. |

**Summary:**

- **tenant_id:** Present in DB and in SQLModel.  
- **unit_id:** Present in DB and in SQLModel.  
- **tenancy_id:** Present in DB and in SQLModel; it is the intended primary relational reference.  
- No naming mismatch for these columns; only extra DB columns (invoice_type, period_start, period_end, notes, created_at) are absent from the model.

---

## Section G — Risk notes for Phase B migration/alignment

**Tenancies**

1. **Column name / existence:** The DB may not have `rent_chf`, `deposit_chf`, or `unit_id`. If so, either add them via migration (additive) or map model fields to existing columns (e.g. rent_chf → monthly_rent in code or migration). Additive approach: add columns rent_chf, deposit_chf, unit_id; backfill from monthly_rent, deposit_amount, and tenant/room data; then optionally stop writing to legacy columns.  
2. **Legacy columns:** start_date, end_date, monthly_rent, deposit_amount, billing_cycle, notice_period_months, contract_signed_at, notes exist in DB. Do not drop them in Phase B if any legacy code (e.g. billing_service, seed_billing_data) or reports still use them.  
3. **move_out_date:** Confirm actual column name in DB (`move_out_date` vs `move_out_date date`). If it is the latter, Phase B may need a migration to rename it or to map it in the application.  
4. **unit_id:** If tenancies in DB really lacks unit_id, add it (nullable or backfilled from room → unit) so the model and DB align.

**Invoices**

1. **Tenancy-only reference (target):** The consolidation plan says invoices should reference only tenancy_id. Today both DB and model also have tenant_id, room_id, unit_id. Phase B can keep those columns but move application logic to use tenancy_id only and derive tenant/room/unit from the tenancy when needed; no need to drop columns in this phase.  
2. **Extra columns:** invoice_type, period_start, period_end, notes, created_at are in DB but not in the model. Adding them to the model is optional; leaving them as “DB-only” is safe and additive.

**General**

- Any Phase B migration should be additive (add missing columns, optional backfill). Do not drop or rename columns in this step if legacy code or other consumers might still depend on them.  
- Verify tenancies table again (e.g. `SELECT column_name FROM information_schema.columns WHERE table_name = 'tenancies'`) to confirm rent_chf, deposit_chf, unit_id presence/absence and the exact move_out_date column name before implementing Phase B.

---

**End of report. No code or migrations were modified.**
