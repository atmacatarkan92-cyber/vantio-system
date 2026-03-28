# FeelAtHomeNow: Units, Rooms & Website Listings

## Business logic summary

- **Unit** = main property/apartment (the physical object we operate).
- **Room** = rentable occupancy unit *inside* a Unit.

One structure supports both models:

| Model              | Unit      | Rooms                         |
|--------------------|-----------|-------------------------------|
| **Co-living**      | 1 unit    | Many rooms, each rentable     |
| **Business apartment** | 1 unit | Exactly 1 room (= whole apt)  |

The **public website** uses a separate **listing** structure (titles, descriptions, images, amenities, SEO, published flag). Listings link to Units so operations (tenancies, invoices, availability) stay in one place.

---

## 1. Operational tables (internal)

Used for tenancies, invoices, occupancy, and internal tools. Not exposed as-is on the website.

### `units`

The main property record.

| Column           | Type         | Notes |
|------------------|--------------|--------|
| id               | uuid PK      | |
| city_id          | uuid FK → cities | |
| name             | text         | Internal name (e.g. "Limmatstrasse 12 – 3rd floor") |
| address_line1    | text         | |
| address_line2    | text (null)  | |
| postal_code      | text         | |
| unit_type        | enum         | `business_apartment` \| `co_living` |
| is_active        | boolean      | Default true |
| created_at       | timestamptz  | |
| updated_at       | timestamptz  | |

- **business_apartment**: one Unit → one Room (that room = whole apartment).
- **co_living**: one Unit → many Rooms.

### `rooms`

The rentable occupancy unit. Always belongs to one Unit.

| Column           | Type         | Notes |
|------------------|--------------|--------|
| id               | uuid PK      | |
| unit_id          | uuid FK → units | ON DELETE CASCADE |
| name             | text         | e.g. "Room 1", "Studio A", or "Whole apartment" |
| base_rent_chf    | numeric(12,2) | |
| size_sqm         | int (null)   | Optional |
| is_active        | boolean      | Default true |
| created_at       | timestamptz  | |
| updated_at       | timestamptz  | |

- **Business apartment**: create exactly one Room per Unit; that Room represents the whole apartment.
- **Co-living**: create multiple Rooms per Unit; each Room is rentable separately.

### `cities` (reference)

| Column   | Type    |
|----------|---------|
| id       | uuid PK |
| code     | text UNIQUE (e.g. "Zurich") |
| name_de  | text    |
| name_en  | text    |

---

## 2. Website listing tables (public-facing)

Used only for the marketing website: what we show and how we present it. Linked to operations via `unit_id`.

### `listings`

One row = one thing we show on the website (one “apartment” or “co-living room” card). Can represent a whole Unit or a single Room, depending on business model.

| Column           | Type         | Notes |
|------------------|--------------|--------|
| id               | uuid PK      | |
| unit_id          | uuid FK → units | NOT NULL; which unit this listing represents |
| room_id          | uuid FK → rooms (null) | Optional: if set, listing is for that room (e.g. single room in co-living); if null, listing is for the whole unit (typical for business apartment) |
| city_id          | uuid FK → cities | Denormalized for filtering |
| slug             | text UNIQUE  | SEO-friendly URL (e.g. `zurich-limmat-strasse-12`) |
| title_de         | text         | |
| title_en         | text         | |
| description_de   | text         | |
| description_en   | text         | |
| price_chf_month  | numeric(12,2) | Shown on website |
| bedrooms         | int          | For display/filters |
| bathrooms        | int          | |
| size_sqm         | int          | |
| is_published     | boolean      | Default false; only published appear on site |
| sort_order       | int          | Optional ordering |
| created_at       | timestamptz  | |
| updated_at       | timestamptz  | |

- **Business apartment**: one Listing per Unit, `room_id` = the single Room (or null and derive from unit). One card on the site = one Unit.
- **Co-living**: either one Listing per Room (`room_id` set) or one Listing per Unit (whole building). Choose per product.

### `listing_images`

| Column       | Type        | Notes |
|-------------|-------------|--------|
| id          | uuid PK     | |
| listing_id  | uuid FK → listings | ON DELETE CASCADE |
| url         | text        | |
| is_main     | boolean     | Default false; one main per listing |
| position    | int         | Order in gallery |

### `listing_amenities`

| Column       | Type        | Notes |
|-------------|-------------|--------|
| id          | uuid PK     | |
| listing_id  | uuid FK → listings | ON DELETE CASCADE |
| label_de    | text        | |
| label_en    | text        | |

Optional: could use a JSONB column on `listings` instead (e.g. `amenities_de`, `amenities_en` as arrays).

### `listing_coordinates` (optional)

If you want lat/lng per listing (e.g. for map pins):

| Column       | Type        |
|-------------|-------------|
| listing_id  | uuid PK FK → listings |
| latitude    | numeric(9,6) |
| longitude   | numeric(9,6) |

Or add `latitude`, `longitude` to `listings`.

---

## 3. Relationship between listings and units

- **Listing → Unit (required)**  
  `listings.unit_id` → `units.id`  
  Every listing is tied to one Unit so that:
  - Tenancies and invoices stay at Unit/Room level.
  - Availability and operations are driven by Units/Rooms, not by listing text.

- **Listing → Room (optional)**  
  `listings.room_id` → `rooms.id`  
  - **Business apartment**: can set `room_id` to the single Room of that Unit (or leave null and infer “the one room” from the unit).  
  - **Co-living**: set `room_id` when the listing is for a specific Room (e.g. “Room 3 – 24 m²”); leave null when the listing is for the whole Unit/building.

- **Listing → City**  
  `listings.city_id` → `cities.id`  
  Enables “listings in Zurich” without joining through Unit every time.

Summary:

- Operations: **Unit → Rooms** (1:1 for business apartment, 1:many for co-living).
- Website: **Listing → Unit** (and optionally **Listing → Room**).
- One Unit can have 0 or more Listings (e.g. one listing per room in co-living, or one per unit).

---

## 4. Minimal API changes

Goal: keep current public API contract so the frontend keeps working with minimal changes.

### Current contract (from Airtable/Mongo)

- `GET /api/apartments`  
  Returns list of “apartments” (what we now treat as listings) with: `id`, `title` (de/en), `location`, `city` (de/en), `price`, `bedrooms`, `bathrooms`, `sqm`, `image`, `images`, `description` (de/en), `amenities` (de/en), etc.
- `GET /api/apartments/:id`  
  Returns one such object by id.
- Query: `?city=Zurich` to filter by city.

### Recommended minimal change

1. **Backend (FastAPI)**  
   - Add SQLModel (or raw SQL) for: `cities`, `units`, `rooms`, `listings`, `listing_images`, `listing_amenities` (and optional coordinates).  
   - Implement a **listings service** that:
     - Reads from `listings` (+ images, amenities, city).
     - Filters by `is_published = true` and optional `city_id` (from `?city=...` using city code).
     - Returns the **same JSON shape** as today (id, title, location, city, price, bedrooms, bathrooms, sqm, image, images, description, amenities, etc.).  
   - Point `GET /api/apartments` and `GET /api/apartments/:id` to this service instead of Airtable/Mongo.  
   - Keep response field names and structure so the existing React pages (list + detail) need no or minimal changes.

2. **IDs**  
   - Use `listings.id` as the public “apartment” id in the API (and in URLs).  
   - No need to expose `unit_id` or `room_id` in the public API unless you add an internal/admin API later.

3. **Admin / internal**  
   - Later you can add endpoints that work with `units` and `rooms` (and tenancies, invoices) for operations; listing creation/editing can be an admin UI that writes to `listings` + `listing_images` + `listing_amenities` and sets `unit_id` (and optionally `room_id`).

### Files to touch (minimal)

- **Backend**
  - Add/update **models**: `db/models.py` (or equivalent) with Unit, Room, City, Listing, ListingImage, ListingAmenity (and optional coordinates).
  - Add **listings service**: e.g. `app/services/listings_service.py` that queries the new tables and maps to the current API response shape.
  - **Routes**: in `app/api/v1/routes_apartments.py` (or current apartments router), replace Airtable/Mongo calls with the listings service; keep the same route paths and response schema.

- **Frontend**
  - No change if the API response shape is preserved. If you rename any field, update the React components that consume it.

---

## 5. Suggested implementation order

1. Add **cities** and extend **units** / **rooms** with the columns above (and `unit_type` on units).  
2. Add **listings**, **listing_images**, **listing_amenities** (and optional coordinates).  
3. Implement **listings service** and switch **GET /api/apartments** and **GET /api/apartments/:id** to it, keeping response shape.  
4. Migrate existing Airtable/Mongo “apartment” data into **listings** (and related tables), with corresponding **units** (and **rooms** for business apartments).  
5. Add admin or scripts to create/update listings and link them to units/rooms.

This keeps one operational model (Unit + Room) for both business models, a separate listing layer for the website, a clear listing → unit (and optional room) relationship, and minimal API and frontend impact.
