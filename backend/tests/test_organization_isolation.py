"""
Organization isolation: cross-org admin operations must fail; same-org reads succeed.
Uses dependency overrides + minimal session mocks (no production DB).
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from auth.dependencies import get_current_user
from db.models import Landlord, Property, Unit, User, UserRole
from server import app


@pytest.fixture
def admin_user_org_a() -> User:
    return User(
        id="admin-org-a",
        organization_id="org-a",
        email="admin-a@test.example",
        full_name="Admin A",
        role=UserRole.admin,
        is_active=True,
    )


class TestAdminUnitIsolation:
    def test_get_unit_other_org_returns_404(self, client: TestClient, admin_user_org_a: User):
        unit = Unit(
            id="unit-in-b",
            organization_id="org-b",
            title="Foreign",
            address="x",
            city="y",
            rooms=1,
        )

        class MiniSession:
            def get(self, model, pk):
                if model is Unit and pk == "unit-in-b":
                    return unit
                return None

            def close(self):
                pass

        app.dependency_overrides[get_current_user] = lambda: admin_user_org_a
        try:
            with patch("app.api.v1.routes_admin_units.get_session") as m:
                m.return_value = MiniSession()
                r = client.get(
                    "/api/admin/units/unit-in-b",
                    headers={"Authorization": "Bearer test-token"},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert r.status_code == 404
        assert "not found" in r.json().get("detail", "").lower()

    def test_get_unit_same_org_returns_200(self, client: TestClient, admin_user_org_a: User):
        unit = Unit(
            id="unit-in-a",
            organization_id="org-a",
            title="Mine",
            address="x",
            city="y",
            rooms=1,
        )

        class MiniSession:
            def get(self, model, pk):
                if model is Unit and pk == "unit-in-a":
                    return unit
                return None

            def close(self):
                pass

        app.dependency_overrides[get_current_user] = lambda: admin_user_org_a
        try:
            with patch("app.api.v1.routes_admin_units.get_session") as m:
                m.return_value = MiniSession()
                r = client.get(
                    "/api/admin/units/unit-in-a",
                    headers={"Authorization": "Bearer test-token"},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert r.status_code == 200
        assert r.json()["id"] == "unit-in-a"
        assert r.json()["title"] == "Mine"


class TestAdminPropertyLandlordIsolation:
    def test_create_property_rejects_landlord_other_org(
        self, client: TestClient, admin_user_org_a: User
    ):
        foreign = Landlord(
            id="landlord-b",
            organization_id="org-b",
            contact_name="L",
            email="l@b.example",
        )

        class MiniSession:
            def get(self, model, pk):
                if model is Landlord and pk == "landlord-b":
                    return foreign
                return None

            def add(self, _):
                pass

            def commit(self):
                pass

            def refresh(self, _):
                pass

            def close(self):
                pass

        app.dependency_overrides[get_current_user] = lambda: admin_user_org_a
        try:
            with patch("app.api.v1.routes_admin_properties.get_session") as m:
                m.return_value = MiniSession()
                r = client.post(
                    "/api/admin/properties",
                    json={"landlord_id": "landlord-b", "title": "Should fail"},
                    headers={"Authorization": "Bearer test-token"},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert r.status_code == 400

    def test_create_property_allows_landlord_same_org(
        self, client: TestClient, admin_user_org_a: User
    ):
        ok_ll = Landlord(
            id="landlord-a",
            organization_id="org-a",
            contact_name="L",
            email="l@a.example",
        )
        created: list = []

        class MiniSession:
            def get(self, model, pk):
                if model is Landlord and pk == "landlord-a":
                    return ok_ll
                return None

            def add(self, obj):
                created.append(obj)

            def commit(self):
                pass

            def refresh(self, obj):
                if getattr(obj, "id", None) is None:
                    obj.id = "new-prop-id"

            def close(self):
                pass

        app.dependency_overrides[get_current_user] = lambda: admin_user_org_a
        try:
            with patch("app.api.v1.routes_admin_properties.get_session") as m:
                m.return_value = MiniSession()
                r = client.post(
                    "/api/admin/properties",
                    json={"landlord_id": "landlord-a", "title": "OK"},
                    headers={"Authorization": "Bearer test-token"},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert r.status_code == 200
        assert len(created) == 1
        assert isinstance(created[0], Property)
        assert str(created[0].organization_id) == "org-a"
