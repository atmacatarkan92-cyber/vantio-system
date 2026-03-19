"""
Backend tests for landlord units workflow (Phase 1): list only own units, create for own property, 403 for other.
Uses dependency override and mocked get_session; no real DB.
"""
from datetime import datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from auth.dependencies import get_current_landlord
from db.models import User, Landlord, UserRole, Property, Unit
from server import app


class MockSessionUnits:
    """Mock session: first exec returns property IDs, second returns (Unit, Property) rows; optional add/commit/refresh/get for create."""

    def __init__(self, property_ids, unit_rows, created_unit_property_title="Test Property"):
        self._results = [property_ids, unit_rows]
        self._call_index = 0
        self._created_unit_property_title = created_unit_property_title
        self._created_unit = None

    def exec(self, q):
        if self._call_index >= len(self._results):
            return _Result([])
        data = self._results[self._call_index]
        self._call_index += 1
        return _Result(data)

    def add(self, obj):
        self._created_unit = obj
        if getattr(obj, "id", None) is None:
            obj.id = "created-unit-id"

    def commit(self):
        pass

    def refresh(self, obj):
        pass

    def get(self, model, id):
        if model is Property and self._created_unit and getattr(self._created_unit, "property_id", None) == id:
            p = Property(
                id=id,
                organization_id="test-org-mock-id",
                title=self._created_unit_property_title,
                landlord_id="test-landlord-id",
            )
            return p
        return None

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


class TestLandlordUnitsList:
    """GET /api/landlord/units returns only units belonging to the authenticated landlord."""

    def test_landlord_list_units_returns_only_own_units(
        self, client: TestClient, landlord_user_and_landlord
    ):
        user, landlord = landlord_user_and_landlord
        prop_id = "prop-own-1"
        unit1 = Unit(
            id="unit-1",
            organization_id="test-org-mock-id",
            title="Unit A",
            address="Addr 1",
            city="Zurich",
            rooms=2,
            property_id=prop_id,
            created_at=datetime.utcnow(),
        )
        prop = Property(
            id=prop_id,
            organization_id="test-org-mock-id",
            title="My Property",
            landlord_id=str(landlord.id),
        )
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        try:
            with patch("app.api.v1.routes_landlord.get_session") as mock_get_session:
                mock_get_session.return_value = MockSessionUnits(
                    property_ids=[prop_id],
                    unit_rows=[(unit1, prop)],
                )
                response = client.get("/api/landlord/units")
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["title"] == "Unit A"
        assert data[0]["property_title"] == "My Property"
        assert data[0]["property_id"] == prop_id

    def test_landlord_list_units_empty_when_no_units(
        self, client: TestClient, landlord_user_and_landlord
    ):
        user, landlord = landlord_user_and_landlord
        prop_id = "prop-own-1"
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        try:
            with patch("app.api.v1.routes_landlord.get_session") as mock_get_session:
                mock_get_session.return_value = MockSessionUnits(
                    property_ids=[prop_id],
                    unit_rows=[],
                )
                response = client.get("/api/landlord/units")
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
        assert response.status_code == 200
        assert response.json() == []


class TestLandlordUnitsCreate:
    """POST /api/landlord/units: allow create for own property; 403 for other landlord's property."""

    def test_landlord_can_create_unit_for_own_property(
        self, client: TestClient, landlord_user_and_landlord
    ):
        user, landlord = landlord_user_and_landlord
        prop_id = "prop-own-1"
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        try:
            with patch("app.api.v1.routes_landlord.get_session") as mock_get_session:
                mock_get_session.return_value = MockSessionUnits(
                    property_ids=[prop_id],
                    unit_rows=[],
                    created_unit_property_title="My Property",
                )
                response = client.post(
                    "/api/landlord/units",
                    json={
                        "property_id": prop_id,
                        "title": "New Apartment",
                        "address": "Street 1",
                        "city": "Zurich",
                        "rooms": 3,
                        "type": "Wohnung",
                    },
                )
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "New Apartment"
        assert data["property_id"] == prop_id
        assert data["property_title"] == "My Property"
        assert data["city"] == "Zurich"
        assert data["rooms"] == 3
        assert "id" in data

    def test_landlord_cannot_create_unit_for_other_landlord_property(
        self, client: TestClient, landlord_user_and_landlord
    ):
        user, landlord = landlord_user_and_landlord
        own_prop_id = "prop-own-1"
        other_prop_id = "prop-other-2"
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        try:
            with patch("app.api.v1.routes_landlord.get_session") as mock_get_session:
                # Current landlord only has own_prop_id
                mock_get_session.return_value = MockSessionUnits(
                    property_ids=[own_prop_id],
                    unit_rows=[],
                )
                response = client.post(
                    "/api/landlord/units",
                    json={
                        "property_id": other_prop_id,
                        "title": "Hacked Unit",
                        "address": "",
                        "city": "Bern",
                        "rooms": 1,
                    },
                )
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
        assert response.status_code == 403
        data = response.json()
        assert "detail" in data
        assert "permission" in data["detail"].lower() or "not found" in data["detail"].lower()
