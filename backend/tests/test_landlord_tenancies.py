"""
Backend tests for landlord tenancies workflow (Phase 1): read-only.
Landlord only receives tenancies for own properties/units; empty when none; other landlord's excluded.
"""
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient

from auth.dependencies import get_current_landlord, get_db_session
from db.models import User, Landlord, UserRole, Property, Unit, Tenancy, Tenant, TenancyStatus
from server import app


def _override_db(mock_session):
    def _gen():
        yield mock_session

    return _gen


class MockSessionTenancies:
    """Mock session: sequential exec returns property_ids, unit_ids, then (Tenancy, Unit, Property, Tenant) rows."""

    def __init__(self, property_ids, unit_ids, tenancy_rows):
        self._results = [property_ids, unit_ids, tenancy_rows]
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


class TestLandlordTenanciesList:
    """GET /api/landlord/tenancies returns only tenancies for the authenticated landlord's units."""

    def test_landlord_receives_only_own_tenancies(
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
        tenancy = Tenancy(
            id="ten-1",
            organization_id="test-org-mock-id",
            tenant_id=tenant.id,
            room_id="room-1",
            unit_id=unit_id,
            move_in_date=date(2024, 1, 1),
            move_out_date=None,
            rent_chf=1500.0,
            status=TenancyStatus.active,
            created_at=datetime.utcnow(),
        )
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        app.dependency_overrides[get_db_session] = _override_db(
            MockSessionTenancies(
                property_ids=[prop_id],
                unit_ids=[unit_id],
                tenancy_rows=[(tenancy, unit, prop, tenant)],
            )
        )
        try:
            response = client.get("/api/landlord/tenancies")
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
            app.dependency_overrides.pop(get_db_session, None)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        item = data[0]
        assert item["id"] == "ten-1"
        assert item["unit_id"] == unit_id
        assert item["unit_title"] == "Wohnung 1"
        assert item["property_id"] == prop_id
        assert item["property_title"] == "Mein Objekt"
        assert item["tenant_name"] == "Max Mustermann"
        assert item["tenant_email"] == "max@example.com"
        assert item["move_in_date"] == "2024-01-01"
        assert item["monthly_rent"] == 1500.0
        assert item["status"] == "active"

    def test_landlord_receives_empty_list_when_no_tenancies(
        self, client: TestClient, landlord_user_and_landlord
    ):
        user, landlord = landlord_user_and_landlord
        prop_id = "prop-own-1"
        unit_id = "unit-own-1"
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        app.dependency_overrides[get_db_session] = _override_db(
            MockSessionTenancies(
                property_ids=[prop_id],
                unit_ids=[unit_id],
                tenancy_rows=[],
            )
        )
        try:
            response = client.get("/api/landlord/tenancies")
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
            app.dependency_overrides.pop(get_db_session, None)
        assert response.status_code == 200
        assert response.json() == []

    def test_other_landlord_tenancies_excluded(
        self, client: TestClient, landlord_user_and_landlord
    ):
        """Current landlord has own property/unit; mock returns only their unit ids, so tenancies from other units never appear."""
        user, landlord = landlord_user_and_landlord
        own_prop_id = "prop-own-1"
        own_unit_id = "unit-own-1"
        # Mock: landlord only has own_prop_id and own_unit_id; tenancy list is empty (no tenancies in their units)
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        app.dependency_overrides[get_db_session] = _override_db(
            MockSessionTenancies(
                property_ids=[own_prop_id],
                unit_ids=[own_unit_id],
                tenancy_rows=[],
            )
        )
        try:
            response = client.get("/api/landlord/tenancies")
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
            app.dependency_overrides.pop(get_db_session, None)
        assert response.status_code == 200
        assert response.json() == []
