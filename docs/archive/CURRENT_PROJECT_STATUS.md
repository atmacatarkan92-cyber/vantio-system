# CURRENT PROJECT STATUS

*FeelAtHomeNow – furnished apartment / co-living platform. React frontend, FastAPI backend, PostgreSQL. Summary reflects the actual codebase and tested workflow as of the last implementation.*

---

## 1. What already works

| Area | Details |
|------|--------|
| **Backend runtime** | FastAPI app runs; `uvicorn server:app` is the entrypoint. Swagger at `/docs`, ReDoc at `/redoc`. |
| **PostgreSQL** | `db/database.py` loads `backend/.env`, connects when `DATABASE_URL` or `PG_*` is set. Pool, `get_session()`, `create_db()`. |
| **Auth (backend)** | `POST /auth/login` (email + password), `GET /auth/me`. JWT creation/validation. Users and `user_credentials` in Postgres. `UserRole` enum. Admin and listing/invoice endpoints protected with `require_roles("platform_admin", "ops_admin")`. |
| **Admin login (frontend)** | `/admin/login` page: form calls `POST /auth/login`, stores token in `localStorage` under `fah_admin_token`, redirects to `/admin/listings`. |
| **Admin route protection** | `AdminLayout` checks for token; if missing and path is not `/admin/login`, redirects to `/admin/login`. Logout in sidebar removes token and redirects to login. |
| **Public website – apartments** | `ApartmentsPage` and `ApartmentDetailPage` call `GET /api/apartments` and `GET /api/apartments/{id}`. When Postgres is configured, data comes from the listings layer; otherwise Airtable → MongoDB fallback. |
| **Public website – contact** | `ContactPage` submits to `POST /api/contact`; backend stores in MongoDB `inquiries` and can send notification. |
| **Admin – Website Listings module** | Full backend-driven flow: list listings, create listing (with unit/room selection from API), toggle published, set availability status. See §5. |
| **Admin – Invoices** | `AdminInvoicesPage`, `AdminInvoiceDetailPage`, `AdminRevenuePage`, and overview in `App.js` call `GET /api/invoices`, `PUT /api/invoices/{id}/status`, `GET /api/invoices/{id}/pdf` with `getApiHeaders()`. Data from Postgres. |
| **Admin – Units/Rooms APIs** | `GET /api/admin/units` and `GET /api/admin/units/{unit_id}/rooms` return Postgres data; used by the Admin Listings form only. |
| **Health** | `GET /api/health`, `GET /api/ready` (check Postgres and optionally Mongo). |
| **Scripts** | `scripts/verify_listing_tables.py`, `scripts/ensure_listing_tables.py`, `scripts/seed_listing_test_data.py`, `scripts/fix_listing_availability_column.py`. `create_admin_user.py` for first admin user. |

---

## 2. What is partially implemented

| Area | Status |
|------|--------|
| **Admin dashboard overall** | **Invoices and Website Listings** use the backend (Postgres + JWT). **All other admin pages** (overview, operations, objekte, apartments/units, rooms, tenants, landlords, property managers, leads, occupancy, revenue, expenses, performance, break-even, forecast) still use **localStorage** (`fah_units`, `fah_rooms`, `fah_tenants`, `fah_tenancies`, `fah_landlords`, `fah_property_managers`, etc.) for their data. No backend APIs for those entities except units/rooms used by the listings form. |
| **Data sources** | **Listings / apartments (public):** Postgres when configured, else Airtable → MongoDB. **Inquiries:** MongoDB only. **Invoices:** Postgres only. **Units/Rooms (admin):** Postgres for the listings form; all other admin pages use localStorage. |
| **City in listing form** | City dropdown is built from **existing listings** (unique `city_id` / `city_code`). If there are no listings yet, the form shows a manual `city_id` input. There is no `GET /api/admin/cities`. |
| **Homepage** | Uses `mockTestimonials` from `utils/mockData.js` (static). Rest of public site uses API where applicable. |

---

## 3. What is still temporary or missing

| Item | Details |
|------|--------|
| **Contact inquiries** | Stored in **MongoDB** only. No Postgres `inquiries` table or migration. `GET /api/admin/inquiries` reads from Mongo. |
| **Airtable / MongoDB** | Still in code: apartments fallback (Airtable → Mongo), contact and admin inquiries (Mongo), `seed_apartments()` on startup. Not removed or feature-flagged. |
| **Admin operational data** | Units, rooms, tenants, tenancies, landlords, property managers outside the **Website Listings** page are **localStorage-only**. No backend CRUD for those in the main admin UI (Objekte, Apartments, Rooms, Tenants, etc.). |
| **Invoice storage** | Invoices in Postgres via **raw SQL** in `server.py`; no SQLModel for invoices, no Alembic migrations. PDFs served from local path. |
| **Schema migrations** | No Alembic (or similar). Tables created/updated via `create_db()` or one-off scripts (e.g. `fix_listing_availability_column.py`). |
| **tenant-app** | Separate app (e.g. Base44 SDK, own auth); not part of this backend/frontend migration. |

---

## 4. Current architecture in practice

**Frontend**

- **Public:** React app. Routes: `/`, `/apartments`, `/apartments/:id`, `/contact`, `/about`, `/for-companies`, `/for-property-managers`. Uses `API_BASE_URL` and, for admin, `getApiHeaders()` (JWT from `fah_admin_token` or `X-API-Key`). No auth on public routes.
- **Admin:** Under `/admin`, wrapped by `AdminLayout`. `/admin/login` is public (no token required). All other `/admin/*` require token; otherwise redirect to `/admin/login`. Sidebar has logout. Single React app; no separate “admin app”.

**Backend**

- **Entrypoint:** `server.py` (FastAPI). Routers: `auth_router`, `apartments_router`, `admin_listings_router`, `admin_units_router`, `api_router` (health, ready, contact, inquiries, invoices).
- **Auth:** JWT (email/password login). Roles: `platform_admin`, `ops_admin`, etc. Admin and listing/invoice endpoints use `require_roles("platform_admin", "ops_admin")`.
- **PostgreSQL:** Used for users, credentials, cities, units, rooms, listings, listing_images, listing_amenities, and invoices (raw SQL). Connection and session via `db/database.py` and `db/models.py` (SQLModel).
- **MongoDB:** Used for contact submissions and admin inquiries list; optional apartment seed and apartments fallback when Postgres not used for listings.
- **Airtable:** Optional; apartments fallback when Postgres not configured.

**Data model (practical)**

- **Internal / operational:** **Unit** (id, title, address, city, rooms), **Room** (id, unit_id, name, price). Stored in Postgres. Invoices in Postgres (table used via raw SQL). Tenants in `db/models` but no admin API yet.
- **Website / public presentation:** **City** (id, code, name_de, name_en), **Listing** (id, unit_id, room_id optional, city_id, slug, title_de/en, description_de/en, price, bedrooms, bathrooms, size_sqm, lat/long, is_published, sort_order, availability_status), **ListingImage**, **ListingAmenity**. All in Postgres. Public `GET /api/apartments` returns only published listings (from Postgres when configured).
- **Contact:** Inquiries in **MongoDB** (not in Postgres).

---

## 5. Website Listings module status

**What currently works end-to-end:**

- **Admin login with JWT** – User logs in at `/admin/login`; token stored; all listing/invoice requests use `Authorization: Bearer <token>` via `getApiHeaders()`.
- **Listing table loading** – `GET /api/admin/listings` on load; table shows slug, title, city, price, published, availability, sort order, id.
- **Create listing flow** – Form: listing type (Entire Apartment / Single Room) → unit selection (from `GET /api/admin/units`) → if Single Room, room selection (from `GET /api/admin/units/{unit_id}/rooms`) or manual `room_id` → city (from existing listings or manual) → slug, titles, descriptions, price, bedrooms, bathrooms, size_sqm, lat/long, image URLs, amenities (DE/EN comma-separated), is_published, sort_order. Submit → `POST /api/admin/listings`. Backend validates unit/city/room exist; returns created listing or 404/400.
- **Listing type logic** – “Entire Apartment” → no room_id sent. “Single Room” → room required (dropdown or manual); room_id sent in body.
- **Unit selection** – From backend only (`GET /api/admin/units`). Dropdown shows title, address, city; value is unit id (UUID).
- **Room selection** – From backend when type is Single Room and unit is selected: `GET /api/admin/units/{unit_id}/rooms`. Dropdown or, if no rooms, manual `room_id` input.
- **Published toggle** – In table: “Online”/“Offline” plus button to toggle. Calls `PATCH /api/admin/listings/{id}/status` with `{ is_published }`. Row updates locally on success.
- **Availability status** – Badge (Verfügbar / Belegt / Nicht verfügbar) and dropdown. Same PATCH with `{ availability_status }`. Row updates locally on success.
- **Images / amenities** – Create form: repeatable image URL fields; amenities as two comma-separated inputs (DE, EN). Sent as `images[]` and `amenities[]` in POST body.

**Current limitations:**

- City dropdown is derived from existing listings only; no `GET /api/admin/cities`. First listing may need manual `city_id` (e.g. from seed).
- No edit/delete in the table (only create and status PATCH). PUT/DELETE exist in backend but are not wired in the list UI.
- Error message for status PATCH is global (one message above table), not per row.

---

## 6. Roadmap progress

**Completed**

- Backend auth (JWT, roles, users/user_credentials in Postgres).
- Admin listing CRUD API (GET/POST/PUT/DELETE, validation for unit/city/room).
- PATCH `/api/admin/listings/{id}/status` (is_published, availability_status).
- `availability_status` on Listing model and DB (script to add column if missing).
- Admin login page (frontend), token storage, redirect after login.
- Admin route protection (redirect to login when no token).
- Units and rooms admin APIs for listing form (`GET /api/admin/units`, `GET /api/admin/units/{id}/rooms`).
- Admin Listings page fully backed by backend (units, rooms, listings, status). No localStorage for this flow.
- Public apartments from Postgres (when configured); fallback Airtable/Mongo left in place.
- Invoice API and admin invoice UIs using Postgres and JWT.

**Partially completed**

- Admin dashboard: invoices and website listings use backend; all other pages still use localStorage (units, rooms, tenants, etc.).
- “Expose units/rooms from backend”: done for the **listings form** only; other admin pages still use localStorage.

**Still open**

- Migrate contact inquiries to Postgres; point `POST /api/contact` and `GET /api/admin/inquiries` to Postgres.
- Replace localStorage with backend APIs on remaining admin pages (Objekte, Apartments, Rooms, Tenants, Landlords, etc.) or document as future.
- Remove or gate Airtable/Mongo for production (or feature-flag).
- Introduce Alembic (or similar) for Postgres schema migrations.
- Optional: listing edit/delete in Admin Listings table UI; per-row error for status PATCH; `GET /api/admin/cities` for city dropdown.

---

## 7. Top 5 next steps (recommended order)

1. **Migrate inquiries to Postgres** – Add `inquiries` table (or equivalent), implement insert in `POST /api/contact` and list in `GET /api/admin/inquiries` from Postgres. Keep or drop Mongo for inquiries after migration.
2. **Alembic (or equivalent) for Postgres** – Version schema (listings, users, invoices, inquiries, etc.) and run migrations in each environment instead of ad-hoc scripts and `create_db()`.
3. **Optional: Admin cities endpoint** – `GET /api/admin/cities` so the listing form can show a city dropdown without relying only on existing listings.
4. **Reduce or remove Mongo/Airtable** – Once listings and inquiries are fully on Postgres, remove or feature-flag Airtable and MongoDB code and startup seed.
5. **Backend APIs + UI for other admin entities** – Expose units/rooms/tenants (and optionally landlords, etc.) from Postgres and switch the corresponding admin pages from localStorage to API (can be done incrementally per section).

---

## 8. Short reusable summary for documentation / handover

**FeelAtHomeNow** is a furnished apartment and co-living platform (React frontend, FastAPI backend, PostgreSQL). **Currently:** Backend runs with JWT auth; Postgres is used for users, credentials, cities, units, rooms, listings (with images and amenities), and invoices. The **public site** shows apartments from Postgres (when configured) and a contact form that still writes to MongoDB. The **admin** has a login page, token-based protection, and a **Website Listings** module that is fully backend-driven: list/create listings, choose unit and optionally room from Postgres, toggle published and availability via PATCH. **Invoices** in admin are also backend-driven (Postgres). All other admin sections (overview, operations, objekte, units, rooms, tenants, landlords, etc.) still use **localStorage** for their data. Contact **inquiries** remain in MongoDB. Airtable and MongoDB are still present as fallbacks or for inquiries. **Next steps:** Move inquiries to Postgres, add proper DB migrations (e.g. Alembic), then optionally add admin APIs and UI for the remaining entities and reduce/remove Mongo and Airtable.
