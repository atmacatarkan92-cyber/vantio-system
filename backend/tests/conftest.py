"""
Pytest configuration and fixtures for FeelAtHomeNow backend.
Uses FastAPI TestClient; test env vars set before app import so no production secrets required.
"""
import os
import sys
from pathlib import Path

import pytest

# Ensure backend root is on path and set test env before importing app
_backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_backend_root))
os.environ.setdefault("SECRET_KEY", "test-secret-key-min-32-chars-for-pytest")
# Do not set DATABASE_URL so engine is None and app starts without DB (endpoints that need DB use overrides)


@pytest.fixture(scope="session")
def app():
    """FastAPI app instance. Session-scoped so we import once."""
    from server import app as fastapi_app
    return fastapi_app


@pytest.fixture
def client(app):
    """FastAPI test client. Fresh per test."""
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c


@pytest.fixture
def landlord_user_and_landlord():
    """Minimal User and Landlord for overriding get_current_landlord (no DB)."""
    from db.models import User, Landlord, UserRole
    from datetime import datetime
    user_id = "test-user-landlord-id"
    landlord_id = "test-landlord-id"
    user = User(
        id=user_id,
        organization_id="test-org-mock-id",
        email="landlord-test@test.example",
        full_name="Test Landlord",
        role=UserRole.landlord,
        is_active=True,
    )
    landlord = Landlord(
        id=landlord_id,
        organization_id="test-org-mock-id",
        user_id=user_id,
        contact_name="Test Landlord",
        email="landlord-test@test.example",
        status="active",
    )
    return user, landlord


@pytest.fixture
def mock_properties_for_landlord(landlord_user_and_landlord):
    """One Property belonging to the fixture landlord for scoping tests."""
    from db.models import Property
    _, landlord = landlord_user_and_landlord
    return [
        Property(
            id="prop-1",
            organization_id="test-org-mock-id",
            landlord_id=landlord.id,
            title="Test Property",
            city="Zurich",
            country="CH",
            status="active",
        )
    ]


class MockSession:
    """Minimal mock session: exec() returns an object with .all() returning the given list."""

    def __init__(self, exec_all_result=None):
        self._exec_all_result = exec_all_result if exec_all_result is not None else []

    def exec(self, _query):
        class Result:
            def __init__(self, data):
                self._data = data
            def all(self):
                return list(self._data)
        return Result(self._exec_all_result)

    def close(self):
        pass
