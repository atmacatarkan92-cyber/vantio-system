# Admin Listing Management – Implementation Summary

## Backend changes (done)

### 1. Files created

| File | Purpose |
|------|--------|
| `backend/app/api/v1/routes_admin_listings.py` | Admin listing API: GET/POST/PUT/DELETE `/api/admin/listings`, Pydantic schemas, protected by `require_roles("platform_admin", "ops_admin")`. |

### 2. Files modified

| File | Changes |
|------|--------|
| `backend/app/services/listings_service.py` | Added: `_listing_to_admin_shape`, `get_all_listings_admin`, `get_listing_admin_by_id`, `create_listing`, `update_listing`, `delete_listing`. |
| `backend/server.py` | Import and register `admin_listings_router`: `app.include_router(admin_listings_router)`. |

### 3. API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/listings` | JWT, roles: platform_admin, ops_admin | List all listings (including unpublished). |
| POST | `/api/admin/listings` | Same | Create listing (body: unit_id, city_id, slug, title_de, title_en, + optional images/amenities). |
| PUT | `/api/admin/listings/{id}` | Same | Update listing (partial; images/amenities replace existing if sent). |
| DELETE | `/api/admin/listings/{id}` | Same | Delete listing and its images/amenities. |

- Public **GET /api/apartments** and **GET /api/apartments/{id}** are unchanged and still return only published listings from PostgreSQL (or Airtable/Mongo fallback).

### 4. Create/update validation (no more 500 on missing FKs)

Before inserting or updating a listing, the admin routes validate that referenced rows exist:

- **unit_id** → must exist in table `unit` (Unit). If missing → **404** `"Unit not found"`.
- **city_id** → must exist in table `cities` (City). If missing → **404** `"City not found"`.
- **room_id** (optional) → if provided and non-empty, must exist in table `room` (Room). If missing → **404** `"Room not found"`.

So you get a clear 404 instead of a 500 `ForeignKeyViolation`.

---

## Prerequisite data: what must exist before creating a listing

| Reference   | Table    | Required? | Purpose                          |
|------------|----------|-----------|----------------------------------|
| **unit_id**  | `unit`   | Yes       | Listing is tied to one property (Unit). |
| **city_id**  | `cities` | Yes       | Listing’s city for display/filter.      |
| **room_id**  | `room`   | No        | Optional; use for room-level listings.   |

You must have at least **one city** and **one unit** in PostgreSQL before creating your first listing. IDs are **UUIDs** (strings), not integers — e.g. `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`.

### Minimal seed to create the first listing

1. **Create tables** (if not already done):
   ```bash
   cd backend
   python -m scripts.ensure_listing_tables
   ```

2. **Seed one city and one unit** (and optionally one listing) with the existing script:
   ```bash
   cd backend
   python -m scripts.seed_listing_test_data
   ```
   This creates:
   - 1 **City** (e.g. Zurich) with a generated `id` (UUID)
   - 1 **Unit** with a generated `id` (UUID)
   - 1 **Listing** (so you can also test GET /api/apartments)

   The script prints the created IDs, e.g.:
   ```text
   City:   <uuid> (Zurich)
   Unit:   <uuid>
   Listing: <uuid> (slug: zurich-test-listing)
   ```

3. **Use those UUIDs in the admin API**  
   For `POST /api/admin/listings`, set `unit_id` and `city_id` to the **exact UUID strings** printed (or from `GET /api/admin/listings` / your DB). Do not use numeric ids like `1` — they are not valid.

4. **If you need a room** (optional)  
   Insert a row into `room` (e.g. via SQL or a future admin endpoint) and use its `id` (UUID) as `room_id`. For “one listing per whole unit” you can leave `room_id` null.

---

## Minimal frontend admin changes (proposal)

1. **Use JWT for admin listing calls**  
   Ensure admin listing requests send the same auth as invoices: e.g. after login, store the token and set `Authorization: Bearer <token>` (or use `getApiHeaders()` if it is extended to add the Bearer token when present).

2. **New admin page (or section)**  
   - **List view**: Call `GET /api/admin/listings` and show a table/cards with: slug, title (de/en), city, price, is_published, sort_order, actions (Edit, Delete).  
   - **Create**: Form with required fields (unit_id, city_id, slug, title_de, title_en) and optional (descriptions, price, bedrooms, bathrooms, size_sqm, is_published, sort_order, images[], amenities[]). Submit via `POST /api/admin/listings`.  
   - **Edit**: Load one listing by id from the list (or `GET /api/admin/listings` and find by id). Form same as create; submit via `PUT /api/admin/listings/{id}`.  
   - **Delete**: Confirm then `DELETE /api/admin/listings/{id}`.

3. **Where to plug in**  
   - Add a route (e.g. `/admin/listings` or under existing “Apartments” / “Website”) and a link in the admin sidebar.  
   - Reuse existing admin layout and `API_BASE_URL` + auth headers; no need to change public apartment pages.

4. **Optional**  
   - Dropdowns for `unit_id` and `city_id` require backend support (e.g. GET /api/admin/units and GET /api/admin/cities) if you do not want to type IDs. Those can be added later.

---

## How to test the backend

1. Start backend: `uvicorn server:app --reload`
2. In Swagger (`/docs`):  
   - **Authorize** with a user that has role `platform_admin` or `ops_admin` (e.g. from `create_admin_user.py`): use the token from `POST /auth/login` as Bearer.  
   - Call `GET /api/admin/listings` (should return existing listings).  
   - Call `POST /api/admin/listings` with a valid body (unit_id, city_id, slug, title_de, title_en from your DB).  
   - Call `PUT /api/admin/listings/{id}` and `DELETE /api/admin/listings/{id}` as needed.
