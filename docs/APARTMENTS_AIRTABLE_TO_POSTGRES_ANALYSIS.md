# Apartments API & Airtable → PostgreSQL Analysis

## 1. Current flow

### `routes_apartments.py`

- **GET /api/apartments**  
  - If `engine is not None`: uses `get_listings(session, city_code=city)` from `app.services.listings_service` (PostgreSQL).  
  - Else if Airtable is available: uses `airtable_service.get_all_apartments(city=city)`.  
  - Else: returns `[]`.
- **GET /api/apartments/{apartment_id}**  
  - Same order: PostgreSQL first (`get_listing_by_id`), then Airtable, then 404.

PostgreSQL is already the **first** source when the DB is configured; Airtable is fallback.

### `airtable_service.py`

- **Data source:** Airtable base/table via `pyairtable` (credentials from `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME`).
- **Filtering:** `get_all_apartments(city)` filters by `Active = TRUE()` and optional city (match on City (EN) or City (DE)).
- **Transform:** `transform_airtable_record(record)` maps Airtable fields to a single apartment object.

**Airtable → API shape (what the frontend gets):**

| API field       | Airtable source                          |
|-----------------|------------------------------------------|
| id              | `ID` or record id                        |
| title.de / .en  | Title (DE), Title (EN)                   |
| location        | City Code                                |
| city.de / .en   | City (DE), City (EN)                     |
| coordinates     | Latitude, Longitude                      |
| price           | price                                    |
| bedrooms        | Bedrooms                                 |
| bathrooms       | Bathrooms                                |
| sqm             | Size (sqm)                               |
| image           | Main Image URL (first attachment/URL)    |
| images          | Gallery Images + main                    |
| description     | Description (DE), (EN)                   |
| amenities       | Amenities (DE), (EN) (comma-separated)   |
| is_active       | Active                                   |

---

## 2. PostgreSQL schema (listings)

### Tables involved

- **cities**  
  `id`, `code`, `name_de`, `name_en`  
  → Covers location (code) and city.{de,en}.

- **listings**  
  `id`, `unit_id`, `room_id`, `city_id`, `slug`, `title_de`, `title_en`, `description_de`, `description_en`, `price_chf_month`, `bedrooms`, `bathrooms`, `size_sqm`, `latitude`, `longitude`, `is_published`, `sort_order`, `availability_status`, `created_at`, `updated_at`  
  → Covers title, description, price, bedrooms, bathrooms, sqm, coordinates, is_active (as is_published).

- **listing_images**  
  `id`, `listing_id`, `url`, `is_main`, `position`  
  → Covers image (main) and images (gallery).

- **listing_amenities**  
  `id`, `listing_id`, `label_de`, `label_en`  
  → Covers amenities.de and amenities.en (one row per label).

### How the API shape is built (`listings_service._listing_to_api_shape`)

- **id** → `listing.id`
- **title** → `listing.title_de`, `listing.title_en`
- **location** → `city.code`
- **city** → `city.name_de`, `city.name_en`
- **coordinates** → `listing.latitude`, `listing.longitude`
- **price** → `listing.price_chf_month`
- **bedrooms / bathrooms / sqm** → listing fields
- **image** → first of `image_urls` (from `listing_images`, ordered by is_main desc, position)
- **images** → all `listing_images` URLs in that order
- **description** → `listing.description_de`, `listing.description_en`
- **amenities** → lists of `label_de` and `label_en` from `listing_amenities`
- **is_active** → `listing.is_published`

So the **public API response shape is identical** for Airtable and PostgreSQL; the frontend does not need to change.

---

## 3. Schema sufficiency

The current PostgreSQL schema is **sufficient** to replace Airtable for the apartments API:

- All Airtable-sourced fields have a direct or derived mapping in `cities` + `listings` + `listing_images` + `listing_amenities`.
- `listings_service` already returns the same structure as `transform_airtable_record`.
- No new tables or new columns are required for the current API contract.

Optional, non-blocking improvements (only if you need them later):

- **listings.room_id** is optional; Airtable does not model units/rooms, so migration can leave `room_id` null and set `unit_id` to a “virtual” or placeholder unit if you want to keep FK integrity (see migration plan below).

---

## 4. Safe migration plan (Airtable → PostgreSQL)

Goal: populate PostgreSQL so it can fully serve the apartments API, **without** removing the Airtable fallback until you are satisfied.

### Prerequisites

- Backend can connect to PostgreSQL (`DATABASE_URL` in `backend/.env`).
- Airtable credentials still set (so you can read and verify).
- Alembic at `001_initial` (already stamped for existing DB).

### Step 1: Ensure cities exist

- For each distinct **City Code** (and names) used in Airtable:
  - Insert or ignore into `cities` (`id`, `code`, `name_de`, `name_en`).
- Use `code` as business key (e.g. `SELECT` by `code`, then `INSERT` if missing).

### Step 2: (Optional) Placeholder unit per “logical” apartment

- Listings require `unit_id` (FK to `unit`).
- Options:
  - **A)** Create one “Airtable migration” unit per Airtable apartment and link each listing to that unit.
  - **B)** Or create a single shared “Migration” unit and assign all migrated listings to it (simplest; you can later reassign to real units in admin).
- If you already have real units in PG that should own the listings, map Airtable rows to those units (e.g. by address or name) and set `listing.unit_id` accordingly.

### Step 3: Export from Airtable and map to PG entities

- Use the same logic as `transform_airtable_record` (or call `airtable_service.get_all_apartments()` and optionally `get_apartment_by_id` for a single record) to get the list of apartment dicts.
- For each apartment:
  - Resolve `city_id`: look up `cities.id` by `location` (city code).
  - Resolve or create `unit_id` (see Step 2).
  - Generate a stable `slug` (e.g. from title or id: `apartment-id` or `title-en-slug`).

### Step 4: Insert into PostgreSQL

- **listings**  
  Insert one row per Airtable apartment. Prefer keeping **id** = Airtable `ID` (if it’s a string and unique) so that:
  - Existing links (e.g. `inquiries.apartment_id` → listing) still work.
  - URLs like `/apartments/{id}` remain valid after migration.
- **listing_images**  
  For each listing: insert one row per URL in `images`; set `is_main=True` for the first (or the one that matches `image`), and `position` (e.g. 0, 1, 2 …).
- **listing_amenities**  
  For each listing: for each label in `amenities.de` and `amenities.en`, insert one row with `label_de` and `label_en` (you can duplicate the same label in both if Airtable only had one language).

Use a transaction so that a failed run doesn’t leave half-migrated data; you can run the script multiple times with “skip if listing.id already exists” to make it idempotent.

### Step 5: Verify

- Call **GET /api/apartments** and **GET /api/apartments/{id}** (with PostgreSQL enabled and no Airtable in use, or with Airtable disabled temporarily) and compare with current Airtable responses (same shape, same ids).
- Check that the frontend list and detail pages work (apartments list, filters, detail page, map, amenities).

### Step 6: (Later) Remove Airtable fallback

- Only after you have verified that PostgreSQL fully serves the apartments API and you no longer need Airtable:
  - In `routes_apartments.py`, remove the `airtable_service` branch and the Airtable import.
  - Optionally remove `airtable_service.py` and Airtable-related env vars and dependencies.

---

## 5. Migration script (implemented)

A ready-to-run script performs Steps 1–4 in one go:

- **Path:** `backend/scripts/migrate_airtable_apartments_to_postgres.py`
- **Run from backend directory:**  
  `python -m scripts.migrate_airtable_apartments_to_postgres`
- **Behaviour:**
  - Fetches all active apartments from Airtable (same mapping as the API).
  - Ensures cities by code (creates if missing); ensures one placeholder unit “Airtable Migration (placeholder)” and assigns all migrated listings to it.
  - For each apartment: if a listing with the same `id` already exists, skips (idempotent); otherwise inserts listing (using Airtable id as `listings.id`), then `listing_images` and `listing_amenities`.
  - All in one transaction (rollback on error).
- **Verify after run:**
  - `GET /api/apartments` and `GET /api/apartments/{id}` (with backend running) return the migrated data.
  - In DB: `SELECT id, slug, title_en FROM listings;` and spot-check `listing_images` / `listing_amenities`.

---

## 7. Summary

| Question | Answer |
|----------|--------|
| How are listings fetched from Airtable? | Via `airtable_service.get_all_apartments(city)` and `get_apartment_by_id(id)`; records are transformed with `transform_airtable_record`. |
| How are listings stored in PostgreSQL? | In `cities`, `listings`, `listing_images`, `listing_amenities`; served by `listings_service.get_listings` / `get_listing_by_id`. |
| Is the PostgreSQL schema sufficient to replace Airtable? | **Yes.** No schema changes required for the current API. |
| Minimal schema adjustments? | **None** for the current apartments API. |
| Safe migration approach? | Add data only: ensure cities → (optional) units → insert listings/images/amenities; preserve Airtable `id` where possible; verify API and frontend; remove Airtable fallback only after verification. |

Airtable fallback is **not** removed in this plan; it remains until you explicitly remove it after PostgreSQL is fully validated.
