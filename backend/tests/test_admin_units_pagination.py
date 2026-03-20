"""
Tests for /api/admin/units pagination behavior.
"""

from typing import List, Tuple

import pytest
from fastapi.testclient import TestClient

from auth.dependencies import get_current_user, get_db_session
from db.models import User, UserRole


def _make_units(n: int) -> List[Tuple[object, object]]:
    """Create in-memory (Unit-like, Property-like) pairs for mocking."""
    from datetime import datetime
    from types import SimpleNamespace

    rows = []
    for i in range(n):
        unit = SimpleNamespace(
            id=f"unit-{i}",
            title=f"Unit {i}",
            address="addr",
            city="city",
            city_id=None,
            type=None,
            rooms=0,
            property_id=None,
            created_at=datetime.utcnow(),
        )
        prop = None
        rows.append((unit, prop))
    return rows


class _UnitsMockSession:
    """Mock session for admin_list_units using an in-memory row list."""

    def __init__(self, rows):
        self._rows = rows
        self._org_id = "test-org-id"

    def exec(self, _query):
        class Result:
            def __init__(self, data):
                self._data = data

            def all(self):
                return list(self._data)

            def first(self):
                return self._data[0] if self._data else None

        # Simulate offset/limit applied via SQLAlchemy Select on the query object.
        data = list(self._rows)

        # Organization bootstrap query (get_or_create_default_organization)
        if "FROM organization" in str(_query):
            from db.models import Organization
            return Result([Organization(id=self._org_id, name="Default")])

        # COUNT(*) queries return a single scalar; emulate that.
        raw_cols = getattr(_query, "_raw_columns", None)
        if raw_cols and len(raw_cols) == 1 and "count" in str(raw_cols[0]).lower():
            return Result([len(data)])

        offset_clause = getattr(_query, "_offset_clause", None)
        limit_clause = getattr(_query, "_limit_clause", None)

        def _to_int(value):
            if value is None:
                return None
            if isinstance(value, int):
                return value
            # SQLAlchemy bind parameter often has .value
            v = getattr(value, "value", value)
            try:
                return int(v)
            except Exception:
                return None

        offset = _to_int(offset_clause)
        limit = _to_int(limit_clause)

        if offset:
            data = data[offset:]
        if limit is not None:
            data = data[:limit]

        return Result(data)

    def close(self):
        pass

    # No-ops for org helper compatibility if ever used
    def add(self, _obj):
        pass

    def commit(self):
        pass

    def refresh(self, _obj):
        pass


@pytest.fixture
def admin_user():
    return User(
        id="admin-user-id",
        organization_id="test-org-mock-id",
        email="admin@test.example",
        full_name="Admin",
        role=UserRole.admin,
        is_active=True,
    )


class TestAdminUnitsPagination:
    def test_default_pagination(self, client: TestClient, app, admin_user):
        rows = _make_units(10)

        def _override_db():
            yield _UnitsMockSession(rows)

        app.dependency_overrides[get_current_user] = lambda: admin_user
        app.dependency_overrides[get_db_session] = _override_db
        try:
            response = client.get(
                "/api/admin/units",
                headers={"Authorization": "Bearer test-token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_db_session, None)

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 10
        assert data["skip"] == 0
        assert data["limit"] == 50
        assert isinstance(data["items"], list)
        assert len(data["items"]) == 10

    def test_custom_skip_and_limit(self, client: TestClient, app, admin_user):
        rows = _make_units(30)

        def _override_db():
            yield _UnitsMockSession(rows)

        app.dependency_overrides[get_current_user] = lambda: admin_user
        app.dependency_overrides[get_db_session] = _override_db
        try:
            response = client.get(
                "/api/admin/units?skip=5&limit=10",
                headers={"Authorization": "Bearer test-token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_db_session, None)

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 30
        assert data["skip"] == 5
        assert data["limit"] == 10
        assert len(data["items"]) == 10
        # first item should be unit-5
        assert data["items"][0]["id"] == "unit-5"

    def test_max_limit_enforced(self, client: TestClient, app, admin_user):
        rows = _make_units(300)

        def _override_db():
            yield _UnitsMockSession(rows)

        app.dependency_overrides[get_current_user] = lambda: admin_user
        app.dependency_overrides[get_db_session] = _override_db
        try:
            response = client.get(
                "/api/admin/units?skip=0&limit=201",
                headers={"Authorization": "Bearer test-token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_db_session, None)

        # FastAPI validation should reject limit > 200
        assert response.status_code == 422

    def test_unauthorized_still_fails(self, client: TestClient):
        response = client.get("/api/admin/units")
        assert response.status_code == 403

