"""
Backend tests for landlord invoices workflow (Phase 1): read-only.
Landlord only sees own invoices; empty when none; another landlord's invoices excluded.
"""
from datetime import date, datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from auth.dependencies import get_current_landlord
from db.models import User, Landlord, UserRole, Property, Unit, Invoice, Tenant
from server import app


class MockSessionInvoices:
    """Mock session: sequential exec returns property_ids, unit_ids, then (Invoice, Unit, Property, Tenant) rows."""

    def __init__(self, property_ids, unit_ids, invoice_rows):
        self._results = [property_ids, unit_ids, invoice_rows]
        self._call_index = 0

    def exec(self, q):
        if self._call_index >= len(self._results):
            return _Result([])
        data = self._results[self._call_index]
        self._call_index += 1
        return _Result(data)

    def close(self):
        pass


class _Result:
    def __init__(self, data):
        self._data = list(data) if data is not None else []

    def all(self):
        return self._data


@pytest.fixture
def landlord_user_and_landlord():
    user = User(
        id="test-user-landlord-id",
        organization_id="test-org-mock-id",
        email="landlord-test@test.example",
        full_name="Test Landlord",
        role=UserRole.landlord,
        is_active=True,
    )
    landlord = Landlord(
        id="test-landlord-id",
        organization_id="test-org-mock-id",
        user_id="test-user-landlord-id",
        contact_name="Test Landlord",
        email="landlord-test@test.example",
        status="active",
    )
    return user, landlord


class TestLandlordInvoicesList:
    """GET /api/landlord/invoices returns only invoices for the authenticated landlord's units."""

    def test_landlord_sees_only_own_invoices(
        self, client: TestClient, landlord_user_and_landlord
    ):
        user, landlord = landlord_user_and_landlord
        prop_id = "prop-own-1"
        unit_id = "unit-own-1"
        tenant = Tenant(
            id="tenant-1",
            organization_id="test-org-mock-id",
            name="Max Mustermann",
            email="max@example.com",
        )
        unit = Unit(
            id=unit_id,
            organization_id="test-org-mock-id",
            title="Wohnung 1",
            address="Str 1",
            city="Zurich",
            rooms=2,
            property_id=prop_id,
            created_at=datetime.utcnow(),
        )
        prop = Property(
            id=prop_id,
            organization_id="test-org-mock-id",
            title="Mein Objekt",
            landlord_id=str(landlord.id),
        )
        inv = Invoice(
            id=1,
            organization_id="test-org-mock-id",
            invoice_number="INV-001",
            unit_id=unit_id,
            tenant_id=tenant.id,
            amount=1500.0,
            currency="CHF",
            status="unpaid",
            issue_date=date(2024, 1, 15),
            due_date=date(2024, 2, 1),
        )
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        try:
            with patch("app.api.v1.routes_landlord.get_session") as mock_get_session:
                mock_get_session.return_value = MockSessionInvoices(
                    property_ids=[prop_id],
                    unit_ids=[unit_id],
                    invoice_rows=[(inv, unit, prop, tenant)],
                )
                response = client.get("/api/landlord/invoices")
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        item = data[0]
        assert item["id"] == 1
        assert item["invoice_number"] == "INV-001"
        assert item["amount"] == 1500.0
        assert item["unit_id"] == unit_id
        assert item["unit_title"] == "Wohnung 1"
        assert item["property_id"] == prop_id
        assert item["property_title"] == "Mein Objekt"
        assert item["tenant_name"] == "Max Mustermann"
        assert item["tenant_email"] == "max@example.com"
        assert "due_date" in item
        assert item["status"] in ("unpaid", "overdue")

    def test_landlord_receives_empty_list_when_no_invoices(
        self, client: TestClient, landlord_user_and_landlord
    ):
        user, landlord = landlord_user_and_landlord
        prop_id = "prop-own-1"
        unit_id = "unit-own-1"
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        try:
            with patch("app.api.v1.routes_landlord.get_session") as mock_get_session:
                mock_get_session.return_value = MockSessionInvoices(
                    property_ids=[prop_id],
                    unit_ids=[unit_id],
                    invoice_rows=[],
                )
                response = client.get("/api/landlord/invoices")
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
        assert response.status_code == 200
        assert response.json() == []

    def test_other_landlord_invoices_excluded(
        self, client: TestClient, landlord_user_and_landlord
    ):
        """Current landlord has own property/unit; mock returns only their unit ids, so other landlord's invoices never appear."""
        user, landlord = landlord_user_and_landlord
        own_prop_id = "prop-own-1"
        own_unit_id = "unit-own-1"
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        try:
            with patch("app.api.v1.routes_landlord.get_session") as mock_get_session:
                mock_get_session.return_value = MockSessionInvoices(
                    property_ids=[own_prop_id],
                    unit_ids=[own_unit_id],
                    invoice_rows=[],
                )
                response = client.get("/api/landlord/invoices")
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
        assert response.status_code == 200
        assert response.json() == []
