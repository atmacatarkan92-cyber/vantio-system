# Tenancies column usage — read-only report

**Scope:** References to tenancies columns `start_date`, `end_date`, `monthly_rent`, `move_in_date`, `move_out_date`, `rent_chf` across the codebase.  
**No code or schema changes.**

---

## Section A — start_date usage

| File | Line(s) | Type | Role | Active vs legacy |
|------|---------|------|------|------------------|
| **seed_billing_data.py** | 4, 28 | Docstring; raw SQL (INSERT column list) | Schema / write | **Legacy** — script deprecated; inserts into old tenancy schema. |
| **services/billing_service.py** | 4, 19, 22, 33, 37 | Docstring; local variable; return value; raw SQL (SELECT, WHERE filter) | Schema; read; filter | **Legacy** — module marked DEPRECATED; uses raw SQL against start_date/end_date. |

**Summary:** `start_date` is only referenced in **legacy/deprecated** code (billing_service, seed_billing_data). No active routers, active services, or SQLModel use it. All uses are **read** or **write** in raw SQL or docstrings.

---

## Section B — end_date usage

| File | Line(s) | Type | Role | Active vs legacy |
|------|---------|------|------|------------------|
| **seed_billing_data.py** | 4, 28 | Docstring; raw SQL (INSERT column list) | Schema / write | **Legacy.** |
| **services/billing_service.py** | 4, 21, 22, 33, 38 | Docstring; local variable; return; raw SQL (SELECT, WHERE filter) | Schema; read; filter | **Legacy** — DEPRECATED module. |

**Summary:** `end_date` is only in **legacy** code. No active runtime code or SQLModel references it.

---

## Section C — monthly_rent usage

| File | Line(s) | Type | Role | Active vs legacy |
|------|---------|------|------|------------------|
| **seed_billing_data.py** | 4, 23, 28 | Docstring; raw SQL (WHERE filter, INSERT column + values) | Schema; filter; write | **Legacy.** |
| **services/billing_service.py** | 4, 33, 97, 105 | Docstring; raw SQL (SELECT); mapping to invoice amount; pass-through to PDF | Schema; read; mapping | **Legacy** — DEPRECATED; reads tenancy["monthly_rent"] and maps to invoice amount. |

**Summary:** `monthly_rent` appears only in **legacy** code (raw SQL read/write and mapping). No active routers, app services, or SQLModel use it.

---

## Section D — move_in_date usage

| File | Line(s) | Type | Role | Active vs legacy |
|------|---------|------|------|------------------|
| **db/models.py** | 169 | SQLModel field | Schema field | **Active** — Tenancy model definition. |
| **alembic/versions/001_initial_schema_from_models.py** | 161 | Migration DDL | Schema definition | **Migration** — creates column; still relevant to schema understanding. |
| **seed_billing_data.py** | 5 | Docstring | Comment only | Legacy — describes current model. |
| **services/billing_service.py** | 6 | Docstring | Comment only | Legacy. |
| **app/services/invoice_generation_service.py** | 42, 63 | ORM filter; read / compute | Filter; read | **Active** — select(Tenancy).where(move_in_date <= last); then t.move_in_date for overlap. |
| **app/services/occupancy_service.py** | 16–17, 25, 29, 31, 33, 74, 79 | Docstring; order_by; read / condition | Filter; read | **Active** — queries and logic use Tenancy.move_in_date. |
| **app/services/revenue_forecast.py** | 35, 41, 42 | ORM filter; read | Filter; read | **Active.** |
| **app/api/v1/routes_admin_tenancies.py** | 28, 41, 49, 83, 98, 122, 139, 145, 174 | API response mapping; Pydantic schema; overlap check; order_by; create body; patch body | Read; schema; filter; write (body) | **Active** — list/detail return move_in_date; create/patch accept and write via Tenancy(). |

**Summary:** `move_in_date` is the **current** date field in the Tenancy model and is used everywhere in **active** code (routers, invoice_generation, occupancy, revenue_forecast). Legacy modules only mention it in docstrings.

---

## Section E — move_out_date usage

| File | Line(s) | Type | Role | Active vs legacy |
|------|---------|------|------|------------------|
| **db/models.py** | 170 | SQLModel field | Schema field | **Active.** |
| **alembic/versions/001_initial_schema_from_models.py** | 162 | Migration DDL | Schema definition | **Migration.** |
| **seed_billing_data.py** | 5 | Docstring | Comment | Legacy. |
| **services/billing_service.py** | 6 | Docstring | Comment | Legacy. |
| **app/services/invoice_generation_service.py** | 43, 62 | ORM filter; read | Filter; read | **Active.** |
| **app/services/occupancy_service.py** | 16, 28, 78 | Docstring; read | Read | **Active.** |
| **app/services/revenue_forecast.py** | 36, 40 | ORM filter; read | Filter; read | **Active.** |
| **app/api/v1/routes_admin_tenancies.py** | 29, 42, 50, 80, 139, 146, 175 | Response; Pydantic; overlap; read; create/patch body | Read; schema; write (body) | **Active.** |

**Summary:** `move_out_date` is the **current** end-date field in the model and is used in all **active** tenancy and invoice logic. No writes to `end_date` in active code.

---

## Section F — rent_chf usage

| File | Line(s) | Type | Role | Active vs legacy |
|------|---------|------|------|------------------|
| **db/models.py** | 171 | SQLModel field | Schema field | **Active.** |
| **alembic/versions/001_initial_schema_from_models.py** | 163 | Migration DDL | Schema definition | **Migration.** |
| **seed_billing_data.py** | 5 | Docstring | Comment | Legacy. |
| **services/billing_service.py** | 6 | Docstring | Comment | Legacy. |
| **app/services/invoice_generation_service.py** | 30, 66 | Docstring; read / compute | Read; mapping | **Active** — prorated_amount from t.rent_chf. |
| **app/api/v1/routes_admin_units.py** | 44 | Response key "base_rent_chf" from room price | Mapping (room, not tenancy) | **Active** but not tenancies.rent_chf — room price. |
| **app/services/occupancy_service.py** | 67, 80 | Docstring; return value | Read | **Active** — returns rent_chf for room occupancy. |
| **app/services/revenue_forecast.py** | 46 | Read / compute | Read | **Active.** |
| **app/api/v1/routes_admin_tenancies.py** | 30, 43, 51, 147 | Response; Pydantic schema; create body | Read; schema; write (body) | **Active** — list/detail, create/patch use rent_chf. |
| **app/api/v1/routes_admin_rooms.py** | 28 | "base_rent_chf": price | Mapping (room) | **Active** but room field, not tenancy.rent_chf. |

**Summary:** `rent_chf` is the **current** rent field in the Tenancy model. All active tenancy/invoice/occupancy/revenue code uses **rent_chf**. `routes_admin_units` and `routes_admin_rooms` use a **different** field name `base_rent_chf` for **room** price, not tenancy rent.

---

## Section G — Mixed-usage risk summary

1. **No mixed old/new in the same flow**  
   - **Active path:** Only `move_in_date`, `move_out_date`, `rent_chf` (and model fields) are used — in `app/services/*`, `app/api/v1/routes_admin_tenancies.py`, and `db.models.Tenancy`.  
   - **Legacy path:** Only `start_date`, `end_date`, `monthly_rent` (and billing_cycle, etc.) are used — in `services/billing_service.py` and `seed_billing_data.py`.  
   There is no file that both reads/writes legacy columns and reads/writes the new columns in the same request or service flow.

2. **Legacy code is isolated and deprecated**  
   - `billing_service.generate_monthly_invoices` is only referenced from `test_billing.py`, not from the main app or invoice routes.  
   - `seed_billing_data` is only invoked from its own `if __name__ == "__main__"` (or similar).  
   - Both modules are explicitly marked DEPRECATED and document the current model (move_in_date, move_out_date, rent_chf).

3. **Runtime assumption**  
   Active code assumes the **Tenancy** table has **move_in_date**, **move_out_date**, **rent_chf** (and unit_id, etc.). If the live DB only has start_date/end_date/monthly_rent and not these columns, ORM reads and admin create/patch would fail. The report does not change any code; it only states that active code is aligned to the **new** column names.

4. **Migrations**  
   `001_initial_schema_from_models.py` defines the **new** schema (move_in_date, move_out_date, rent_chf). It is the canonical schema for new environments. Existing DBs that were created with an older schema may still have only legacy columns until an additive migration adds or maps the new ones.

5. **Summary table**

| Column      | Active runtime (read/write/filter/schema) | Legacy / migration only |
|------------|--------------------------------------------|--------------------------|
| start_date | None                                        | billing_service, seed_billing_data |
| end_date   | None                                        | billing_service, seed_billing_data |
| monthly_rent | None                                      | billing_service, seed_billing_data |
| move_in_date | Yes — models, routers, invoice_generation, occupancy, revenue_forecast | Docstrings in legacy; 001 migration |
| move_out_date | Yes — same as above                      | Docstrings in legacy; 001 migration |
| rent_chf   | Yes — same as above                        | Docstrings in legacy; 001 migration |

**Conclusion:** No mixed usage in a single flow. Old columns are confined to deprecated scripts and a deprecated service; all active tenancy and invoice logic uses the new columns only.

---

**End of report. No changes were made.**
