# FeelAtHomeNow – Current-State Technical Summary

*Generated from the current codebase. Use for handover, documentation, or briefing another AI.*

---

## 1. What is already working

| Area | Status | Notes |
|------|--------|--------|
| **Backend runtime** | ✅ | FastAPI app runs; `uvicorn server:app` is the entrypoint. |
| **Swagger / OpenAPI** | ✅ | `/docs` and `/redoc` work; all routes documented. |
| **PostgreSQL connection** | ✅ | `db/database.py` loads `backend/.env` and connects when `DATABASE_URL` (or PG_*) is set. |
| **Website listing layer (Postgres)** | ✅ | Tables: `cities`, `listings`, `listing_images`, `listing_amenities`. SQLModel in `db/models.py`; `app/services/listings_service.py` builds the API shape. |
| **GET /api/apartments** | ✅ | When Postgres is configured, returns published listings from Postgres (same response shape as before). Fallback: Airtable → MongoDB. |
| **GET /api/apartments/{id}** | ✅ | Same: Postgres listing by id when engine is set; else Airtable/Mongo. |
| **Public website (apartments + contact)** | ✅ | ApartmentsPage & ApartmentDetailPage call backend API. ContactPage submits to `POST /api/contact`. |
| **Contact form** | ✅ | `POST /api/contact` saves to MongoDB `inquiries`; optional SendGrid notification. |
| **Invoice API (Postgres)** | ✅ | `GET /api/invoices`, `PUT /api/invoices/{id}/status`, `GET /api/invoices/{id}/pdf` use Postgres `invoices` table; raw SQL in `server.py`. |
| **Admin invoice UI** | ✅ | AdminInvoicesPage, AdminInvoiceDetailPage, AdminRevenuePage, App.js overview call backend with `API_BASE_URL` + `getApiHeaders()` (JWT or X-API-Key). |
| **Auth (backend)** | ✅ | JWT login (`POST /auth/login`), `GET /auth/me`, `User`/`UserCredentials` in Postgres, `UserRole` enum. Admin and invoice endpoints protected with `require_roles("platform_admin", "ops_admin")`. |
| **Modular apartments routes** | ✅ | Apartments live in `app/api/v1/routes_apartments.py`; Mongo helpers in `app/core/mongo.py`. |
| **Health & readiness** | ✅ | `GET /api/health`, `GET /api/ready` (checks Mongo + Postgres when configured). |
| **Listing seed & verify** | ✅ | `scripts/verify_listing_tables.py`, `scripts/ensure_listing_tables.py`, `scripts/seed_listing_test_data.py`; `.env` loaded from `db/database.py` so scripts see `DATABASE_URL`. |

---

## 2. What is partially working

| Area | Status | Notes |
|------|--------|--------|
| **Admin dashboard** | ⚠️ | **Invoices**: real data from backend (Postgres). **Units, rooms, tenants, tenancies, landlords, property managers**: still from **localStorage** (`fah_units`, `fah_rooms`, `fah_tenants`, `fah_tenancies`, `fah_invoices`, `fah_landlords`, `fah_property_managers`). So only invoice flows are fully backend-backed. |
| **Admin authentication (frontend)** | ⚠️ | Backend expects JWT (or optional X-API-Key). Frontend sends `getApiHeaders()` (API key if set); **no login page** in the main React frontend – no UI to obtain/store JWT for admin. |
| **Data sources** | ⚠️ | **Apartments**: Postgres (listings) when DB configured, else Airtable/Mongo. **Contact inquiries**: MongoDB only. **Invoices**: Postgres only. So three stores still in use. |
| **Readiness** | ⚠️ | Requires both Mongo and Postgres to be “up” when both are configured; if only Postgres is used for listings, Mongo still referenced for inquiries/seed. |

---

## 3. What is still demo / mock / legacy

| Area | Details |
|------|--------|
| **Admin operational data** | Units, rooms, tenants, tenancies, landlords, property managers in admin UI are **localStorage-only** (e.g. AdminTenantsPage, AdminRoomsPage, AdminLandlordsPage, AdminApartmentsPage, AdminUnitDetailPage, AdminOccupancyPage, AdminCoLivingDashboardPage, AdminBusinessApartmentsDashboardPage, AdminPerformancePage, AdminBreakEvenPage, AdminForecastPage, AdminExpensesPage). Not from backend/Postgres. |
| **Homepage testimonials** | `HomePage.js` uses **mockTestimonials** from `utils/mockData.js` (static list). |
| **mockData.js** | Defines `mockApartments`, `mockTestimonials`, `mockPartners`; only `mockTestimonials` is used (HomePage). |
| **Airtable / MongoDB** | Still in code paths: apartments fallback (Airtable → Mongo), contact and admin inquiries (Mongo), seed_apartments (Mongo). Not removed. |
| **Invoice PDF path** | Backend serves from local path `invoices/{invoice_number}.pdf`; no cloud storage. |
| **tenant-app** | Separate app (Base44 SDK, own auth); not part of this backend/frontend migration. |

---

## 4. Architecture changes already completed

- **Backend layout**: `app/` with `app/core/mongo.py`, `app/api/v1/routes_apartments.py`, `app/services/listings_service.py`. `server.py` remains entrypoint; apartments router included.
- **PostgreSQL listing layer**: `City`, `Listing`, `ListingImage`, `ListingAmenity` in `db/models.py`; listings linked to `unit` via `unit_id`, optional `room_id`; explicit `__tablename__` for all.
- **Apartments API**: Reads from Postgres listings when `engine` is set; same response shape; fallback Airtable → Mongo unchanged.
- **Auth**: Users and credentials in Postgres (`users`, `user_credentials`); JWT + role-based protection on admin/invoice endpoints; `create_admin_user.py` for first admin.
- **Config loading**: `db/database.py` loads `backend/.env` at import so scripts and app both see `DATABASE_URL`.

---

## 5. What still needs refactoring

| Priority | Item |
|----------|------|
| 1 | **Migrate contact inquiries** from MongoDB to Postgres (e.g. `inquiries` table); update `POST /api/contact` and `GET /api/admin/inquiries` to use Postgres. |
| 2 | **Admin UI data**: Replace localStorage for units, rooms, tenants, tenancies, landlords, property managers with backend APIs backed by Postgres (and align with `db/models.py` / future schema). |
| 3 | **Frontend admin login**: Add login screen that calls `POST /auth/login`, stores JWT, and sends `Authorization: Bearer <token>` for admin/invoice requests (or keep API key flow and document it). |
| 4 | **Remove or gate Airtable/Mongo**: After inquiries and any remaining reads are on Postgres, remove or feature-flag Airtable and MongoDB code paths and startup seed. |
| 5 | **Invoice schema**: Align with SQLModel/migrations (e.g. Alembic) instead of raw SQL only; optional: move invoice routes into `app/api/v1/` and a small service layer. |
| 6 | **Duplicate router**: In `frontend/src/App.js` there is an inner `<BrowserRouter>`; remove duplicate so only one router wraps the app. |

---

## 6. Recommended next development steps (in order)

1. **Migrate inquiries to Postgres**  
   Add `inquiries` table (or reuse existing design), implement insert/select in backend, point `POST /api/contact` and `GET /api/admin/inquiries` to Postgres. Keep Mongo as optional fallback during transition if desired.

2. **Add admin login in the React frontend**  
   Login page → `POST /auth/login` → store JWT (memory or secure storage) → send `Authorization: Bearer <token>` (or set header from `getApiHeaders()` if you add token there). Ensure admin and invoice routes use this so 401 is handled (e.g. redirect to login).

3. **Expose units/rooms (and optionally tenants) from backend**  
   Add read (and later write) APIs for units and rooms from Postgres; then change admin dashboard to fetch from these APIs instead of localStorage. Optionally add tenants/tenancies APIs when schema is ready.

4. **Remove or disable Airtable/Mongo for production**  
   Once listings and inquiries are on Postgres, remove or feature-flag Airtable and MongoDB code and env vars; simplify startup (e.g. no Mongo seed).

5. **Introduce Alembic (or similar) for Postgres**  
   Replace/adjust ad-hoc `create_db()` with migrations so schema changes (including inquiries, invoice tables) are versioned and repeatable across environments.

---

## 7. Short “project status” summary (reusable)

**FeelAtHomeNow** is a property/co-living management platform (React frontend, FastAPI backend). **Current state:** Backend runs with FastAPI and Swagger; PostgreSQL is connected and used for (1) website listings (cities, listings, listing_images, listing_amenities) so **GET /api/apartments** returns Postgres data when configured, (2) invoices (CRUD + PDF), and (3) auth (users, credentials, JWT, role-protected admin/invoice endpoints). The public site (apartment list/detail and contact form) calls the backend; contact submissions still go to MongoDB. The admin dashboard uses the **real** backend only for invoices and (when implemented) auth; units, rooms, tenants, tenancies, landlords, and property managers are still **localStorage-based** demo data. Airtable and MongoDB remain in the codebase as fallbacks for apartments and as the store for inquiries. **Next steps:** Move inquiries to Postgres; add admin login in the frontend; replace admin localStorage with backend APIs for units/rooms (and later tenants); then remove or gate Airtable/Mongo and add proper DB migrations.
