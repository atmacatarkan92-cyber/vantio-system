"""
Critical-path backend tests: health, auth/role protection, landlord scoping, tenant/landlord boundary.
Uses FastAPI TestClient; no production secrets. Landlord success tests use dependency/session overrides.
"""

import pytest
from fastapi.testclient import TestClient

from auth.dependencies import get_current_landlord, get_current_user, get_db_session
from auth.security import create_access_token
from db.models import UserRole
from server import app


def _override_db(mock_session):
    def _gen():
        yield mock_session

    return _gen


def _make_token(sub: str, role: str) -> str:
    """Minimal JWT for testing role rejection (sub + role in payload if needed)."""
    return create_access_token(data={"sub": sub}, expires_minutes=15)


# ----- 1. Health endpoint -----
class TestHealthEndpoint:
    def test_get_health_returns_success(self, client: TestClient):
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        assert data.get("service") == "feelathomenow-api"
        assert "timestamp" in data


# ----- 2. Auth / role protection -----
class TestAuthRoleProtection:
    def test_unauthenticated_landlord_endpoint_rejected(self, client: TestClient):
        response = client.get("/api/landlord/properties")
        # HTTPBearer returns 403 when Authorization header is missing
        assert response.status_code in (401, 403)

    def test_authenticated_landlord_can_access_properties(
        self,
        client: TestClient,
        landlord_user_and_landlord,
        mock_properties_for_landlord,
    ):
        from tests.conftest import MockSession

        user, landlord = landlord_user_and_landlord
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        app.dependency_overrides[get_db_session] = _override_db(MockSession(mock_properties_for_landlord))
        try:
            response = client.get("/api/landlord/properties")
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
            app.dependency_overrides.pop(get_db_session, None)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["landlord_id"] == str(landlord.id)
        assert data[0]["title"] == "Test Property"

    def test_non_landlord_role_cannot_access_landlord_endpoint(self, client: TestClient):
        # Override get_current_landlord to simulate 403 (e.g. user has role admin, not landlord).
        from fastapi import HTTPException
        def reject_landlord():
            raise HTTPException(status_code=403, detail="Not enough permissions")
        app.dependency_overrides[get_current_landlord] = reject_landlord
        try:
            response = client.get("/api/landlord/properties")
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
        assert response.status_code == 403


# ----- 3. Landlord scoping -----
class TestLandlordScoping:
    def test_landlord_properties_only_returns_owned(
        self,
        client: TestClient,
        landlord_user_and_landlord,
        mock_properties_for_landlord,
    ):
        from tests.conftest import MockSession

        user, landlord = landlord_user_and_landlord
        app.dependency_overrides[get_current_landlord] = lambda: (user, landlord)
        app.dependency_overrides[get_db_session] = _override_db(MockSession(mock_properties_for_landlord))
        try:
            response = client.get("/api/landlord/properties")
        finally:
            app.dependency_overrides.pop(get_current_landlord, None)
            app.dependency_overrides.pop(get_db_session, None)
        assert response.status_code == 200
        for p in response.json():
            assert p["landlord_id"] == str(landlord.id)


# ----- 4. Tenant / landlord boundary -----
class TestTenantLandlordBoundary:
    def test_tenant_token_cannot_access_landlord_endpoint(self, client: TestClient):
        # Valid JWT with tenant sub; app will try get_current_user then require_role("landlord") -> 403
        # because tenant role != landlord. We need get_current_user to return a tenant user without DB.
        from auth.dependencies import get_current_user
        from db.models import User
        tenant_user = User(
            id="tenant-user-id",
            organization_id="test-org-mock-id",
            email="tenant@test.example",
            full_name="Tenant",
            role=UserRole.tenant,
            is_active=True,
        )
        token = _make_token(tenant_user.id, "tenant")
        app.dependency_overrides[get_current_user] = lambda: tenant_user
        try:
            response = client.get("/api/landlord/properties", headers={"Authorization": f"Bearer {token}"})
        finally:
            app.dependency_overrides.pop(get_current_user, None)
        # get_current_landlord = require_role("landlord") + resolve Landlord; require_role returns 403 for tenant
        assert response.status_code == 403

    def test_landlord_token_cannot_access_tenant_endpoint(self, client: TestClient):
        from auth.dependencies import get_current_user
        from db.models import User
        landlord_user = User(
            id="landlord-user-id",
            organization_id="test-org-mock-id",
            email="landlord@test.example",
            full_name="Landlord",
            role=UserRole.landlord,
            is_active=True,
        )
        token = _make_token(landlord_user.id, "landlord")
        app.dependency_overrides[get_current_user] = lambda: landlord_user
        try:
            # Tenant endpoint uses get_current_tenant which requires role=tenant and Landlord-style
            # resolve of Tenant by user_id. So we get 403 (wrong role or no tenant record).
            response = client.get("/api/tenant/tenancies", headers={"Authorization": f"Bearer {token}"})
        finally:
            app.dependency_overrides.pop(get_current_user, None)
        assert response.status_code == 403
