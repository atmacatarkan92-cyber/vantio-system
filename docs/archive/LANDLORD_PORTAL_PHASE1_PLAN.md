# Landlord Portal Phase 1 — Implementation Plan

**Scope:** Planning only. No code changes in this document.  
**Canonical model:** Landlord → Property → Unit → Tenancy → Invoice.  
**Constraint:** Preserve all working tenant portal, auth, admin, and invoice flows.

---

## 1. Backend endpoints for Landlord Portal Phase 1

All under prefix **`/api/landlord`**, protected by a landlord-scoped dependency (see §4). Phase 1 is **read-only** for landlords (no create/update/delete from the landlord portal).

| Method | Path | Purpose |
|--------|------|--------|
| GET | `/api/landlord/me` | Current user + landlord record (landlord_id, contact_name, company_name, email, etc.). Same pattern as `/api/tenant/me`. |
| GET | `/api/landlord/properties` | List properties where `property.landlord_id = current_landlord.id`. Order by title. |
| GET | `/api/landlord/properties/{property_id}` | Single property detail; **404** if `property.landlord_id != current_landlord.id`. |
| GET | `/api/landlord/units` | List units that belong to the landlord’s properties (`unit.property_id IN landlord_property_ids`). Optional query: `?property_id=...` to filter by one property. |
| GET | `/api/landlord/tenancies` | List tenancies for the landlord’s units (`tenancy.unit_id IN landlord_unit_ids`). Optional: `?property_id=`, `?unit_id=`, `?status=`. |
| GET | `/api/landlord/invoices` | List invoices for the landlord’s units (`invoice.unit_id IN landlord_unit_ids`). Reuse existing invoice API shape (e.g. from `invoice_service._invoice_to_api`). Optional filter by status if needed. |

**No Phase 1 endpoints:** POST/PUT/DELETE for properties, units, tenancies, or invoices. Landlord only views data. Admin/manager continue to manage these via existing `/api/admin/*` routes.

**Auth:** Same as tenant portal: JWT from `POST /auth/login`; landlord routes require `role=landlord` and a resolved `Landlord` row (by `user_id`). No new auth endpoints.

---

## 2. Database relationships and fields used

Existing schema only. No new tables or migrations required for Phase 1.

| Table | Key fields for landlord scoping |
|-------|----------------------------------|
| **users** | `id`, `email`, `role` — `role = 'landlord'` for portal access. |
| **landlords** | `id`, `user_id` (FK → users.id). One landlord row per landlord user; resolve via `Landlord.user_id = current_user.id`. |
| **properties** | `id`, `landlord_id` (FK → landlords.id). Landlord sees only rows where `landlord_id = current_landlord.id`. |
| **unit** | `id`, `property_id` (FK → properties.id). Landlord’s units: `unit.property_id IN (select id from properties where landlord_id = ?)`. |
| **tenancies** | `id`, `unit_id`, `tenant_id`, `room_id`, `move_in_date`, `move_out_date`, `status`, `rent_chf`, etc. Filter: `tenancy.unit_id IN (landlord_unit_ids)`. |
| **invoices** | `id`, `unit_id`, `tenant_id`, `tenancy_id`, `issue_date`, `due_date`, `status`, `amount`, etc. Filter: `invoice.unit_id IN (landlord_unit_ids)` (safe and consistent with hierarchy). |

**Notes:**

- **Room** is linked to Unit via `room.unit_id`; tenancies reference both room and unit. For landlord scope, filtering by `unit_id` is sufficient (units already scoped to landlord).
- **Soft deletes:** If `Property`/`Landlord` use `deleted_at`, landlord endpoints should exclude soft-deleted rows (`deleted_at IS NULL`) where applicable.
- **Indexes:** Existing indexes on `landlord_id`, `property_id`, `unit_id` are enough for Phase 1. Optional later: unique index on `landlords.user_id` if not already present, for fast `get_current_landlord` lookup.

---

## 3. Frontend pages and routes

All under path prefix **`/landlord`**, with a dedicated layout and auth guard (landlord-only), similar to `/tenant`.

| Route | Page / component | Purpose |
|-------|-------------------|--------|
| `/landlord/login` | LandlordLoginPage | Login form; same API as tenant/admin (`POST /auth/login`). On success, if `getMe().role === 'landlord'` redirect to `/landlord`; else show error and clear session. |
| `/landlord` | LandlordOverviewPage (dashboard) | Overview: counts (properties, units, tenancies, invoices) and/or short summaries. Data from `/api/landlord/me` and list endpoints. |
| `/landlord/properties` | LandlordPropertiesPage | List landlord’s properties (table or cards). Links to property detail. |
| `/landlord/properties/:id` | LandlordPropertyDetailPage | Single property; optional list of units for this property. |
| `/landlord/units` | LandlordUnitsPage | List units (all landlord’s units), optional filter by property. |
| `/landlord/tenancies` | LandlordTenanciesPage | List tenancies for landlord’s units. Read-only. |
| `/landlord/invoices` | LandlordInvoicesPage | List invoices for landlord’s units. Read-only; reuse invoice display patterns from admin/tenant where possible. |

**Layout:**

- **LandlordLayout** — Wraps all `/landlord/*` except login. Checks “landlord authenticated” (e.g. `isLandlordAuthenticated` from AuthContext); if not, redirect to `/landlord/login`. Renders nav (Overview, Properties, Units, Tenancies, Invoices) + `<Outlet />`. Mirror structure of `TenantLayout.js`.

**Router:**

- In `AppRouter.jsx`, add a route group for `/landlord` (similar to `/tenant`), with `LandlordLayout` and nested routes above. Ensure `/landlord` is treated like `/admin` and `/tenant` so the main site header/footer can be hidden on landlord routes if desired.

**API client:**

- **landlordApi.js** — Functions: `fetchLandlordMe()`, `fetchLandlordProperties()`, `fetchLandlordProperty(id)`, `fetchLandlordUnits(propertyId?)`, `fetchLandlordTenancies(filters?)`, `fetchLandlordInvoices()`. Use same `getApiHeaders()` and `API_BASE_URL` as tenant; call `/api/landlord/*` endpoints.

---

## 4. Access control rules for landlord role

**Backend**

- **New dependency:** `get_current_landlord(user, session) -> Tuple[User, Landlord]`
  - Use `require_role("landlord")` so only `user.role == "landlord"` passes.
  - Resolve: `Landlord` where `Landlord.user_id == user.id`. If no row, return **403** (“No landlord record linked to this account”).
  - Same pattern as `get_current_tenant` (which uses `Tenant.user_id == user.id`).
- **All landlord routes** use `Depends(get_current_landlord)`. Every handler that returns data filters by `current_landlord.id` (for properties) and derived sets (property_ids → unit_ids → tenancies/invoices).
- **Admin routes** remain `require_roles("admin", "manager")` — do **not** add `"landlord"`. Landlords must not see other landlords’ data or global admin data.
- **Tenant routes** remain `get_current_tenant` (role=tenant). A landlord user must not be able to call `/api/tenant/*` as if they were a tenant (enforced by role check).
- **Auth routes** (`/auth/login`, `/auth/me`, `/auth/refresh`, `/auth/logout`) stay role-agnostic; they only identify the user. Frontend uses `getMe().role` to redirect to admin, tenant, or landlord area.

**Frontend**

- **AuthContext:** Add `isLandlordAuthenticated` (true when `token && user && user.role === 'landlord'`). Do not allow landlord users into admin-only or tenant-only UI (redirect to `/landlord` or show “wrong portal”).
- **LandlordLayout:** If not `isLandlordAuthenticated` and not on `/landlord/login`, redirect to `/landlord/login`.
- **LandlordLoginPage:** After login, only allow redirect to `/landlord` when `me.role === 'landlord'`; otherwise show error and logout (mirror TenantLoginPage).
- **Navigation / entry points:** Link to “Landlord portal” (e.g. from footer or a dedicated URL) to `/landlord` or `/landlord/login`; do not reuse tenant or admin login URLs for landlord.

---

## 5. Reuse of existing patterns

| Area | Reuse |
|------|--------|
| **Auth** | Same login/refresh/logout and JWT; same `getMe()` for role; add landlord to role-based redirect logic only. |
| **Backend “portal” pattern** | Mirror `routes_tenant.py`: one router with prefix `/api/landlord`, dependency `get_current_landlord`, and read-only GET handlers that return JSON. Reuse `invoice_service._invoice_to_api` for invoice payloads. |
| **Backend dependency** | `get_current_landlord` mirrors `get_current_tenant` (role + resolve entity by `user_id`). |
| **Admin CRUD patterns** | Do **not** expose admin-style create/update/delete to landlord in Phase 1. Reuse only **response shapes** (e.g. property/unit/tenancy/invoice DTOs) where it keeps consistency; implement in landlord router with landlord-scoped queries. |
| **Frontend layout** | LandlordLayout mirrors TenantLayout: auth check, nav links, Outlet, logout. |
| **Frontend API client** | landlordApi.js mirrors tenantApi.js: same base URL, headers, and error handling; different path prefix and endpoints. |
| **Frontend login** | LandlordLoginPage mirrors TenantLoginPage: same `login()` and `getMe()`, different role check (`landlord`) and redirect path (`/landlord`). |
| **List/detail pages** | Structure similar to admin properties/units/tenancies/invoices list pages, but data comes from landlord-scoped APIs only; no admin-only actions (create/edit/delete). |

---

## 6. Safest implementation order

1. **Backend: landlord dependency and router (no frontend yet)**  
   - Add `get_current_landlord` in `auth/dependencies.py` (require_role `"landlord"`, resolve `Landlord` by `user_id`).  
   - Add `routes_landlord.py`: implement GET `/me`, `/properties`, `/properties/{id}`, `/units`, `/tenancies`, `/invoices` with strict scoping.  
   - Register router in `server.py` (e.g. `app.include_router(landlord_router)`).  
   - Manually test with a user with `role=landlord` and a linked `Landlord` row (e.g. via Swagger or curl).  

2. **Backend: smoke tests**  
   - Add minimal landlord portal tests: 401 without token, 403 for non-landlord role, 200 for `/me` and scoped lists when landlord; 404 for another landlord’s property.  

3. **Frontend: auth and layout**  
   - In AuthContext, add `isLandlordAuthenticated` and expose it.  
   - Add LandlordLayout (guard + nav + Outlet).  
   - In AppRouter, add `/landlord` route group with LandlordLayout and nested routes (login, index, properties, properties/:id, units, tenancies, invoices).  

4. **Frontend: API and pages**  
   - Add landlordApi.js with all GET calls to `/api/landlord/*`.  
   - Add LandlordLoginPage (redirect when role is landlord).  
   - Add LandlordOverviewPage, LandlordPropertiesPage, LandlordPropertyDetailPage, LandlordUnitsPage, LandlordTenanciesPage, LandlordInvoicesPage (read-only).  

5. **Frontend: entry point**  
   - Add a “Landlord portal” link to `/landlord` or `/landlord/login` where appropriate (e.g. footer or role-specific menu).  

6. **Regression checks**  
   - Confirm tenant login and `/api/tenant/*` still work.  
   - Confirm admin login and `/api/admin/*` still work.  
   - Confirm invoice generation and tenant invoice list unchanged.  

This order keeps backend contract and access control in place before any UI, and avoids mixing landlord logic into tenant or admin code.

---

## 7. Minimal smoke tests for Landlord Portal Phase 1

Run these after backend and (optionally) frontend are implemented; no code changes in this plan.

**Setup:** At least one User with `role=landlord` and `is_active=true`, and one Landlord row with `user_id` set to that user’s id. At least one Property with `landlord_id` set to that Landlord’s id; optionally Units, Tenancies, and Invoices linked to that property/units.

| # | Test | Expected |
|---|------|----------|
| 1 | **Login** — POST `/auth/login` with landlord user credentials | 200, `access_token` in body. |
| 2 | **Landlord me** — GET `/api/landlord/me` with Bearer token of landlord user | 200; body includes `landlord_id`, `user_id`, and contact/email fields. |
| 3 | **Landlord me without token** | 401. |
| 4 | **Landlord me with tenant user token** | 403. |
| 5 | **Landlord me with admin user token** | 403. |
| 6 | **List properties** — GET `/api/landlord/properties` with landlord token | 200; array contains only properties where `landlord_id =` that landlord’s id. |
| 7 | **Get own property** — GET `/api/landlord/properties/{id}` with id of a property belonging to the landlord | 200; same property. |
| 8 | **Get other property** — GET `/api/landlord/properties/{id}` with id of a property belonging to another landlord | 404. |
| 9 | **List units** — GET `/api/landlord/units` with landlord token | 200; only units whose `property_id` is in the landlord’s properties. |
| 10 | **List tenancies** — GET `/api/landlord/tenancies` with landlord token | 200; only tenancies whose `unit_id` is in the landlord’s units. |
| 11 | **List invoices** — GET `/api/landlord/invoices` with landlord token | 200; only invoices whose `unit_id` is in the landlord’s units. |

Optional but recommended:

- **Landlord user with no Landlord row** — GET `/api/landlord/me` → 403 with message indicating no landlord record.
- **Filter units by property** — GET `/api/landlord/units?property_id={landlord_property_id}` → 200; only units for that property.

These tests validate role enforcement, scoping along Landlord → Property → Unit → Tenancy/Invoice, and that existing tenant/admin flows remain unchanged when run in the same suite.

---

## Summary

- **Backend:** New `/api/landlord/*` read-only GET endpoints and `get_current_landlord` dependency; no changes to tenant or admin routes.  
- **DB:** Use existing Landlord, Property, Unit, Tenancy, Invoice tables and relationships only.  
- **Frontend:** New `/landlord` routes, LandlordLayout, LandlordLoginPage, and read-only list/detail pages; AuthContext extended for landlord role.  
- **Access control:** Landlord sees only data under their Landlord → Property → Unit chain; admin and tenant APIs remain restricted to their roles.  
- **Reuse:** Auth, portal dependency pattern, response shapes, and layout/API structure from tenant and admin.  
- **Order:** Backend dependency + router → smoke tests → frontend auth/layout → API + pages → entry link → regression checks.
