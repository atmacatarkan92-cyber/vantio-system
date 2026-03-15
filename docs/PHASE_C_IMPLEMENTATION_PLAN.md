# Phase C — Listings slug convention: implementation plan

## Step 0 — Current state (verified)

| Check | Result |
|-------|--------|
| **listings.slug in DB** | Yes — column exists. |
| **SQLModel defines slug** | Yes — `Listing.slug: str = Field(unique=True, index=True)`. |
| **Public API exposes slug** | No — `_listing_to_api_shape()` returns id, title, location, city, coordinates, price, etc., but **not** slug. |
| **Admin API exposes slug** | Yes — `_listing_to_admin_shape()` includes `"slug": listing.slug`. |
| **Lookup by slug** | No — only `get_listing_by_id(session, apartment_id)`; no route or service reads by slug. |
| **Frontend** | Uses `/apartments/:id` and `GET /api/apartments/${id}`; no slug in URL or response. |

**Sample existing data:** Two listings with slugs `zurich-test-listing` and `zurich-test-listing-2` (titles "Test Apartment Zurich", "Test Apartment Zurich 2"). Already convention-like (lowercase, hyphenated).

---

## Implementation plan (before coding)

### What will change

1. **Slug convention (code only)**  
   - One helper: `slug_from_city_and_title(city_code: str, title: str) -> str`.  
   - Rule: lowercase; replace non-alphanumeric with hyphen; collapse hyphens; strip; take first N chars if needed.  
   - No DB or migration change for slug column.

2. **Public API response**  
   - In `_listing_to_api_shape()`, add `"slug": listing.slug` so list and detail responses expose slug.

3. **Create path**  
   - In `create_listing()`, if `slug` is missing or blank, generate from city + title (load city by `city_id` for `city.code`), ensure uniqueness (append `-2`, `-3`, …), then set `listing.slug`.  
   - If caller provides slug, keep using it (no overwrite).

4. **Lookup by slug**  
   - Add `get_listing_by_slug(session, slug: str)` in listings_service (same response shape as `get_listing_by_id`).  
   - In `GET /api/apartments/{apartment_id}`: try `get_listing_by_id(session, apartment_id)` first; if `None`, call `get_listing_by_slug(session, apartment_id)`.  
   - So the path parameter works as either id or slug; existing ID-based links stay valid.

5. **Backfill**  
   - No bulk rewrite of existing slugs. Existing rows already have slugs (e.g. `zurich-test-listing`).  
   - Only new or future listings get auto-generated slugs when slug is not provided on create.

6. **Documentation**  
   - Short note in `docs/SCHEMA_CONSOLIDATION_PLAN.md`: Phase C done, convention described, slug in public API, lookup by slug supported; limitations/follow-up for Phase D/E if any.

### Slug format (with real example)

- **Source:** `city_code` + `"-"` + title (prefer `title_en` or `title_de`; fallback `"listing"`).  
- **Normalize:** lowercase; replace non-ASCII (e.g. ü→u, ö→o); replace non-alphanumeric with one hyphen; strip leading/trailing hyphens; collapse internal multiple hyphens.  
- **Example:** City code `Zurich`, title `"Studio Zentrum"` → `zurich-studio-zentrum`.  
- **Existing example:** `zurich-test-listing`, `zurich-test-listing-2` — already match; leave as-is.

### Duplicate handling

- When **generating** a new slug (e.g. on create):  
  - Query existing slugs with same base (e.g. `LIKE 'zurich-studio-zentrum%'` or check `slug = candidate` then `slug = candidate || '-2'`, etc.).  
  - If `zurich-studio-zentrum` exists, use `zurich-studio-zentrum-2`, then `-3`, etc., until unique.  
- **Existing rows:** Not changed; duplicates are already avoided by current data (e.g. `-2` suffix).

### What will not change

- No migration (slug column and unique index already exist).  
- No changes to tenancies, invoices, auth, or frontend routing.  
- No drop/rename of columns.  
- No Phase D (properties/landlords).  
- ID-based URLs and current frontend keep working.

---

If this plan is confirmed, implementation will: add the helper and use it in `create_listing`, add `get_listing_by_slug` and use it in the apartments route, add `slug` to `_listing_to_api_shape`, and add the Phase C note to the consolidation plan.
