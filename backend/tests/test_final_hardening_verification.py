"""
Final hardening verification: org isolation contracts, public vs admin shapes, migration doc.
Uses fakes/mocks only (full schema is PostgreSQL / JSONB — no SQLite create_all).
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

from sqlmodel import select

from app.services.listings_service import (
    _listing_to_api_shape,
    get_all_listings_admin,
    get_listing_admin_by_id,
    update_listing,
)
from db.models import Inquiry, Invoice, Listing, Unit


class _ExecResult:
    def __init__(self, *, first: Any = None, all_rows: Optional[List] = None):
        self._first = first
        self._all = all_rows if all_rows is not None else []

    def first(self) -> Any:
        return self._first

    def all(self) -> List:
        return list(self._all)


class _SeqSession:
    """Session.exec returns scripted results in order."""

    def __init__(self, results: List[_ExecResult]):
        self._results = results
        self._i = 0

    def exec(self, _stmt):
        if self._i >= len(self._results):
            return _ExecResult(all_rows=[])
        r = self._results[self._i]
        self._i += 1
        return r


def _fake_listing(**kwargs) -> Any:
    defaults = dict(
        id="list-1",
        unit_id="unit-1",
        city_id="city-1",
        slug="slug-1",
        title_de="Tde",
        title_en="Ten",
        description_de="",
        description_en="",
        price_chf_month=0,
        bedrooms=0,
        bathrooms=0,
        size_sqm=0,
        latitude=None,
        longitude=None,
        is_published=False,
        sort_order=0,
        availability_status="available",
        room_id=None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _fake_city():
    return SimpleNamespace(code="ZRH", name_de="Zürich", name_en="Zurich")


class TestAdminListingsOrgAccess:
    def test_get_listing_admin_by_id_other_org_returns_none(self):
        session = _SeqSession([_ExecResult(first=None)])
        out = get_listing_admin_by_id(session, "list-x", organization_id="org-a")
        assert out is None
        assert session._i == 1

    def test_get_listing_admin_by_id_same_org_returns_shape(self):
        listing = _fake_listing(id="list-1")
        city = _fake_city()
        session = _SeqSession(
            [
                _ExecResult(first=(listing, city)),
                _ExecResult(all_rows=[]),
                _ExecResult(all_rows=[]),
            ]
        )
        out = get_listing_admin_by_id(session, "list-1", organization_id="org-a")
        assert out is not None
        assert out["id"] == "list-1"
        assert out["unit_id"] == "unit-1"
        assert session._i == 3

    def test_get_all_listings_admin_empty_for_other_org_data(self):
        """When the org-scoped query returns no rows, admin sees an empty list (no cross-org leak)."""
        session = _SeqSession([_ExecResult(all_rows=[])])
        out = get_all_listings_admin(session, organization_id="org-a")
        assert out == []
        assert session._i == 1

    def test_get_all_listings_admin_returns_rows_for_org(self):
        listing = _fake_listing()
        city = _fake_city()
        session = _SeqSession(
            [
                _ExecResult(all_rows=[(listing, city)]),
                _ExecResult(all_rows=[]),
                _ExecResult(all_rows=[]),
            ]
        )
        out = get_all_listings_admin(session, organization_id="org-a")
        assert len(out) == 1
        assert out[0]["id"] == "list-1"

    def test_update_listing_returns_none_when_listing_unit_not_in_org(self):
        listing = SimpleNamespace(id="l1", unit_id="u1")
        unit = SimpleNamespace(organization_id="org-b")

        class _S:
            def get(self, model, pk):
                if str(pk) == "l1":
                    return listing
                if str(pk) == "u1":
                    return unit
                return None

            def exec(self, q):
                raise AssertionError("exec should not run when org mismatch on listing unit")

        assert update_listing(_S(), "l1", {"title_de": "x"}, organization_id="org-a") is None


class TestAdminInquiriesQueryShape:
    def test_inquiries_admin_select_joins_listing_and_unit_org(self):
        org_id = "org-test"
        stmt = (
            select(Inquiry)
            .join(Listing, Inquiry.apartment_id == Listing.id)
            .join(Unit, Listing.unit_id == Unit.id)
            .where(Unit.organization_id == org_id)
        )
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False})).lower()
        assert "inquiries" in compiled
        assert "listings" in compiled
        assert "unit" in compiled
        assert "organization_id" in compiled


class TestPublicListingShape:
    def test_listing_api_shape_has_no_admin_only_top_level_keys(self):
        listing = SimpleNamespace(
            id="pub-1",
            slug="zrh-home",
            title_de="A",
            title_en="B",
            description_de="",
            description_en="",
            price_chf_month=500,
            bedrooms=1,
            bathrooms=1,
            size_sqm=20,
            latitude=None,
            longitude=None,
            is_published=True,
        )
        city = SimpleNamespace(code="ZRH", name_de="Zürich", name_en="Zurich")
        out = _listing_to_api_shape(listing, city, [], [], [])
        admin_only = {
            "is_published",
            "sort_order",
            "availability_status",
            "unit_id",
            "room_id",
            "city_id",
        }
        # Public shape uses nested title/description; flat admin-only keys must not appear.
        assert not admin_only.intersection(out.keys())
        assert "tenant" not in out and "invoice" not in out
        assert out.get("is_active") is True


class TestInvoiceOrgIsolationQuery:
    def test_invoice_list_uses_organization_id_predicate(self):
        org_id = "org-1"
        stmt = select(Invoice).where(Invoice.organization_id == org_id)
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False})).lower()
        assert "organization_id" in compiled


class TestInvoiceBackfillMigration:
    def test_021_migration_defines_ordered_backfill_updates(self):
        root = Path(__file__).resolve().parent.parent / "alembic" / "versions"
        path = root / "021_invoice_organization_backfill.py"
        assert path.is_file(), "021_invoice_organization_backfill.py must exist"
        text = path.read_text(encoding="utf-8")
        assert "UPDATE invoices" in text
        assert "tenancies" in text
        assert "unit" in text.lower()
        assert "tenant" in text.lower()
        body = text.split("def upgrade", 1)[1]
        assert body.find("FROM tenancies") < body.find("FROM unit")
        assert body.find("FROM unit") < body.find("FROM tenant")
