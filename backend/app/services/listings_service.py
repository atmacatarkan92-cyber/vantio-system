"""
Listings service: read website listings from PostgreSQL and return
the same shape as the legacy apartments API (Airtable/Mongo) for compatibility.
Admin functions: full CRUD for listings (including unpublished).

Phase C: slug convention — lowercase, hyphen-separated, ASCII-safe, deterministic.
"""

import re
from datetime import datetime
from typing import List, Optional

from sqlmodel import select

from db.models import City, Listing, ListingImage, ListingAmenity


def _slug_normalize(text: str) -> str:
    """Lowercase, ASCII-safe, hyphen-separated; collapse and strip hyphens."""
    if not text:
        return ""
    s = text.lower().strip()
    for old, new in [("ä", "a"), ("ö", "o"), ("ü", "u"), ("ß", "ss")]:
        s = s.replace(old, new)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:200] or "listing"


def slug_from_city_and_title(city_code: str, title: str) -> str:
    """Build slug: city_code + '-' + normalized title. Deterministic, stable."""
    city = _slug_normalize(city_code or "")
    title_part = _slug_normalize(title or "listing")
    if not city:
        return title_part or "listing"
    if not title_part:
        return city
    return f"{city}-{title_part}"


def _ensure_unique_slug(session, base_slug: str, exclude_listing_id: Optional[str] = None) -> str:
    """If base_slug exists, append -2, -3, ... until unique."""
    candidate = base_slug
    n = 2
    while True:
        stmt = select(Listing).where(Listing.slug == candidate)
        if exclude_listing_id:
            stmt = stmt.where(Listing.id != exclude_listing_id)
        existing = session.exec(stmt).first()
        if not existing:
            return candidate
        candidate = f"{base_slug}-{n}"
        n += 1
        if n > 10000:
            return f"{base_slug}-{n}"


def _listing_to_api_shape(
    listing: Listing,
    city: City,
    image_urls: List[str],
    amenities_de: List[str],
    amenities_en: List[str],
) -> dict:
    """Build one listing in the exact frontend API shape."""
    main_url = image_urls[0] if image_urls else ""
    return {
        "id": str(listing.id),
        "slug": getattr(listing, "slug", None) or "",
        "title": {"de": listing.title_de, "en": listing.title_en},
        "location": city.code,
        "city": {"de": city.name_de, "en": city.name_en},
        "coordinates": {
            "lat": float(listing.latitude) if listing.latitude is not None else 0,
            "lng": float(listing.longitude) if listing.longitude is not None else 0,
        },
        "price": listing.price_chf_month,
        "bedrooms": listing.bedrooms,
        "bathrooms": listing.bathrooms,
        "sqm": listing.size_sqm,
        "image": main_url,
        "images": image_urls if image_urls else [main_url] if main_url else [],
        "description": {"de": listing.description_de, "en": listing.description_en},
        "amenities": {"de": amenities_de, "en": amenities_en},
        "is_active": listing.is_published,
    }


def get_listings(session, city_code: Optional[str] = None) -> List[dict]:
    """
    Return published listings in the legacy API shape.
    If city_code is set, filter by city (City.code).
    """
    statement = (
        select(Listing, City)
        .join(City, Listing.city_id == City.id)
        .where(Listing.is_published == True)
        .order_by(Listing.sort_order, Listing.created_at)
    )
    if city_code:
        statement = statement.where(City.code == city_code)

    rows = session.exec(statement).all()
    if not rows:
        return []

    listing_ids = [r[0].id for r in rows]

    # Load all images and amenities for these listings (avoid N+1)
    images_stmt = (
        select(ListingImage)
        .where(ListingImage.listing_id.in_(listing_ids))
        .order_by(ListingImage.listing_id, ListingImage.is_main.desc(), ListingImage.position)
    )
    amenities_stmt = (
        select(ListingAmenity)
        .where(ListingAmenity.listing_id.in_(listing_ids))
        .order_by(ListingAmenity.listing_id)
    )
    images = list(session.exec(images_stmt).all())
    amenities = list(session.exec(amenities_stmt).all())

    # Group by listing_id
    images_by_listing: dict[str, list[str]] = {}
    for img in images:
        images_by_listing.setdefault(img.listing_id, []).append(img.url)
    amenities_by_listing: dict[str, tuple[List[str], List[str]]] = {}
    for a in amenities:
        if a.listing_id not in amenities_by_listing:
            amenities_by_listing[a.listing_id] = ([], [])
        amenities_by_listing[a.listing_id][0].append(a.label_de)
        amenities_by_listing[a.listing_id][1].append(a.label_en)

    result = []
    for listing, city in rows:
        image_urls = images_by_listing.get(listing.id, [])
        am_de, am_en = amenities_by_listing.get(listing.id, ([], []))
        result.append(
            _listing_to_api_shape(listing, city, image_urls, am_de, am_en)
        )
    return result


def get_listing_by_id(session, listing_id: str) -> Optional[dict]:
    """Return one published listing by id in the legacy API shape, or None."""
    statement = (
        select(Listing, City)
        .join(City, Listing.city_id == City.id)
        .where(Listing.id == listing_id, Listing.is_published == True)
    )
    row = session.exec(statement).first()
    if not row:
        return None

    listing, city = row

    images = list(
        session.exec(
            select(ListingImage)
            .where(ListingImage.listing_id == listing.id)
            .order_by(ListingImage.is_main.desc(), ListingImage.position)
        ).all()
    )
    amenities = list(
        session.exec(
            select(ListingAmenity).where(ListingAmenity.listing_id == listing.id)
        ).all()
    )
    image_urls = [img.url for img in images]
    amenities_de = [a.label_de for a in amenities]
    amenities_en = [a.label_en for a in amenities]

    return _listing_to_api_shape(listing, city, image_urls, amenities_de, amenities_en)


def get_listing_by_slug(session, slug: str) -> Optional[dict]:
    """Return one published listing by slug in the same API shape as get_listing_by_id, or None."""
    if not slug or not str(slug).strip():
        return None
    statement = (
        select(Listing, City)
        .join(City, Listing.city_id == City.id)
        .where(Listing.slug == slug.strip(), Listing.is_published == True)
    )
    row = session.exec(statement).first()
    if not row:
        return None

    listing, city = row

    images = list(
        session.exec(
            select(ListingImage)
            .where(ListingImage.listing_id == listing.id)
            .order_by(ListingImage.is_main.desc(), ListingImage.position)
        ).all()
    )
    amenities = list(
        session.exec(
            select(ListingAmenity).where(ListingAmenity.listing_id == listing.id)
        ).all()
    )
    image_urls = [img.url for img in images]
    amenities_de = [a.label_de for a in amenities]
    amenities_en = [a.label_en for a in amenities]

    return _listing_to_api_shape(listing, city, image_urls, amenities_de, amenities_en)


# ---------------------------------------------------------------------------
# Admin: full CRUD (all listings including unpublished)
# ---------------------------------------------------------------------------

def _listing_to_admin_shape(listing, city, images, amenities):
    """Build one listing for admin API (includes is_published, sort_order, full images/amenities)."""
    return {
        "id": str(listing.id),
        "unit_id": listing.unit_id,
        "room_id": listing.room_id,
        "city_id": listing.city_id,
        "city_code": city.code if city else "",
        "slug": listing.slug,
        "title_de": listing.title_de,
        "title_en": listing.title_en,
        "description_de": listing.description_de,
        "description_en": listing.description_en,
        "price_chf_month": listing.price_chf_month,
        "bedrooms": listing.bedrooms,
        "bathrooms": listing.bathrooms,
        "size_sqm": listing.size_sqm,
        "latitude": listing.latitude,
        "longitude": listing.longitude,
        "is_published": listing.is_published,
        "sort_order": listing.sort_order,
        "availability_status": getattr(listing, "availability_status", "available"),
        "created_at": listing.created_at.isoformat() if listing.created_at else None,
        "updated_at": listing.updated_at.isoformat() if listing.updated_at else None,
        "images": [
            {"id": str(img.id), "url": img.url, "is_main": img.is_main, "position": img.position}
            for img in sorted(images, key=lambda x: (-x.is_main, x.position))
        ],
        "amenities": [
            {"id": str(a.id), "label_de": a.label_de, "label_en": a.label_en}
            for a in amenities
        ],
    }


def get_all_listings_admin(session) -> List[dict]:
    """Return all listings (including unpublished) for admin. Ordered by sort_order, created_at."""
    statement = (
        select(Listing, City)
        .join(City, Listing.city_id == City.id)
        .order_by(Listing.sort_order, Listing.created_at)
    )
    rows = session.exec(statement).all()
    if not rows:
        return []

    listing_ids = [r[0].id for r in rows]
    images_stmt = (
        select(ListingImage)
        .where(ListingImage.listing_id.in_(listing_ids))
        .order_by(ListingImage.listing_id, ListingImage.is_main.desc(), ListingImage.position)
    )
    amenities_stmt = (
        select(ListingAmenity)
        .where(ListingAmenity.listing_id.in_(listing_ids))
        .order_by(ListingAmenity.listing_id)
    )
    images = list(session.exec(images_stmt).all())
    amenities = list(session.exec(amenities_stmt).all())

    images_by_listing = {}
    for img in images:
        images_by_listing.setdefault(img.listing_id, []).append(img)
    amenities_by_listing = {}
    for a in amenities:
        amenities_by_listing.setdefault(a.listing_id, []).append(a)

    result = []
    for listing, city in rows:
        imgs = images_by_listing.get(listing.id, [])
        ams = amenities_by_listing.get(listing.id, [])
        result.append(_listing_to_admin_shape(listing, city, imgs, ams))
    return result


def get_listing_admin_by_id(session, listing_id: str) -> Optional[dict]:
    """Return one listing by id for admin (including unpublished), or None."""
    statement = (
        select(Listing, City)
        .join(City, Listing.city_id == City.id)
        .where(Listing.id == listing_id)
    )
    row = session.exec(statement).first()
    if not row:
        return None
    listing, city = row
    images = list(
        session.exec(
            select(ListingImage)
            .where(ListingImage.listing_id == listing.id)
            .order_by(ListingImage.is_main.desc(), ListingImage.position)
        ).all()
    )
    amenities = list(
        session.exec(
            select(ListingAmenity).where(ListingAmenity.listing_id == listing.id)
        ).all()
    )
    return _listing_to_admin_shape(listing, city, images, amenities)


def create_listing(session, data: dict) -> dict:
    """
    Create a new listing with optional images and amenities.
    data: unit_id, city_id, slug (optional; auto-generated from city + title if missing),
    title_de, title_en, and optional fields (room_id, description_*, price_*, etc.).
    """
    slug = (data.get("slug") or "").strip()
    if not slug:
        city = session.get(City, data["city_id"])
        city_code = city.code if city else "listing"
        title = (data.get("title_en") or data.get("title_de") or "listing").strip()
        base = slug_from_city_and_title(city_code, title)
        slug = _ensure_unique_slug(session, base)

    listing = Listing(
        unit_id=data["unit_id"],
        city_id=data["city_id"],
        slug=slug,
        title_de=data.get("title_de") or "",
        title_en=data.get("title_en") or "",
        description_de=data.get("description_de") or "",
        description_en=data.get("description_en") or "",
        price_chf_month=int(data.get("price_chf_month") or 0),
        bedrooms=int(data.get("bedrooms") or 0),
        bathrooms=int(data.get("bathrooms") or 0),
        size_sqm=int(data.get("size_sqm") or 0),
        latitude=data.get("latitude"),
        longitude=data.get("longitude"),
        is_published=bool(data.get("is_published", False)),
        sort_order=int(data.get("sort_order") or 0),
        room_id=data.get("room_id"),
        availability_status=str(data.get("availability_status") or "available"),
    )
    session.add(listing)
    session.commit()
    session.refresh(listing)

    for i, img in enumerate(data.get("images") or []):
        session.add(ListingImage(
            listing_id=listing.id,
            url=img.get("url") or "",
            is_main=bool(img.get("is_main", False)),
            position=int(img.get("position", i)),
        ))
    for am in data.get("amenities") or []:
        session.add(ListingAmenity(
            listing_id=listing.id,
            label_de=am.get("label_de") or "",
            label_en=am.get("label_en") or "",
        ))
    session.commit()

    return get_listing_admin_by_id(session, str(listing.id))


def update_listing(session, listing_id: str, data: dict) -> Optional[dict]:
    """
    Update a listing by id. data can contain any listing fields + images[], amenities[].
    If images or amenities are provided, they replace existing ones.
    """
    listing = session.get(Listing, listing_id)
    if not listing:
        return None

    if "unit_id" in data:
        listing.unit_id = data["unit_id"]
    if "room_id" in data:
        listing.room_id = data.get("room_id")
    if "city_id" in data:
        listing.city_id = data["city_id"]
    if "slug" in data:
        listing.slug = data["slug"]
    if "title_de" in data:
        listing.title_de = data["title_de"]
    if "title_en" in data:
        listing.title_en = data["title_en"]
    if "description_de" in data:
        listing.description_de = data.get("description_de", "")
    if "description_en" in data:
        listing.description_en = data.get("description_en", "")
    if "price_chf_month" in data:
        listing.price_chf_month = int(data.get("price_chf_month", 0))
    if "bedrooms" in data:
        listing.bedrooms = int(data.get("bedrooms", 0))
    if "bathrooms" in data:
        listing.bathrooms = int(data.get("bathrooms", 0))
    if "size_sqm" in data:
        listing.size_sqm = int(data.get("size_sqm", 0))
    if "latitude" in data:
        listing.latitude = data.get("latitude")
    if "longitude" in data:
        listing.longitude = data.get("longitude")
    if "is_published" in data:
        listing.is_published = bool(data["is_published"])
    if "availability_status" in data:
        listing.availability_status = str(data.get("availability_status") or "available")
    if "sort_order" in data:
        listing.sort_order = int(data.get("sort_order", 0))

    listing.updated_at = datetime.utcnow()

    if "images" in data:
        for existing in session.exec(select(ListingImage).where(ListingImage.listing_id == listing_id)).all():
            session.delete(existing)
        for i, img in enumerate(data["images"] or []):
            session.add(ListingImage(
                listing_id=listing_id,
                url=img.get("url") or "",
                is_main=bool(img.get("is_main", False)),
                position=int(img.get("position", i)),
            ))
    if "amenities" in data:
        for existing in session.exec(select(ListingAmenity).where(ListingAmenity.listing_id == listing_id)).all():
            session.delete(existing)
        for am in data.get("amenities") or []:
            session.add(ListingAmenity(
                listing_id=listing_id,
                label_de=am.get("label_de") or "",
                label_en=am.get("label_en") or "",
            ))

    session.add(listing)
    session.commit()
    session.refresh(listing)
    return get_listing_admin_by_id(session, listing_id)


def delete_listing(session, listing_id: str) -> bool:
    """Delete a listing and its images and amenities. Returns True if deleted."""
    listing = session.get(Listing, listing_id)
    if not listing:
        return False
    for img in session.exec(select(ListingImage).where(ListingImage.listing_id == listing_id)).all():
        session.delete(img)
    for am in session.exec(select(ListingAmenity).where(ListingAmenity.listing_id == listing_id)).all():
        session.delete(am)
    session.delete(listing)
    session.commit()
    return True
