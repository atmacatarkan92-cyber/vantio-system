"""
Auth and admin units integration tests using FastAPI TestClient.

Covers:
- POST /auth/login (success, wrong password, unknown email)
- GET /api/admin/units without auth
- GET /api/admin/units with admin auth
"""

from typing import Generator
import os

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine

from auth.dependencies import get_current_user, get_db_session
from auth.security import hash_password
from db.models import RefreshToken, User, UserCredentials, UserRole


# ---------- Test database setup for /auth/login ----------


@pytest.fixture(scope="session")
def auth_test_engine():
    """
    PostgreSQL engine for auth tests.
    Requires TEST_DATABASE_URL to point to an isolated test database.
    """
    test_db_url = os.getenv("TEST_DATABASE_URL")
    if not test_db_url:
        pytest.skip("TEST_DATABASE_URL is not set; skipping auth login DB-backed tests.")

    engine = create_engine(test_db_url, pool_pre_ping=True)
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture
def auth_db_session(auth_test_engine) -> Generator[Session, None, None]:
    """Provide a SQLModel Session bound to the auth test engine."""
    with Session(auth_test_engine) as session:
        yield session


@pytest.fixture
def admin_user(auth_db_session: Session) -> User:
    """
    Create an admin user + credentials in the auth test DB.
    Password: 'test-password'
    Ensures a clean state for User, UserCredentials, and RefreshToken.
    """
    # Clean tables used by /auth/login before creating the test user
    auth_db_session.exec(RefreshToken.__table__.delete())
    auth_db_session.exec(UserCredentials.__table__.delete())
    auth_db_session.exec(User.__table__.delete())

    email = "admin@test.example"
    password = "test-password"

    user = User(
        email=email,
        full_name="Test Admin",
        role=UserRole.admin,
        is_active=True,
    )
    auth_db_session.add(user)
    auth_db_session.flush()  # ensure user.id is available

    creds = UserCredentials(
        user_id=str(user.id),
        password_hash=hash_password(password),
    )
    auth_db_session.add(creds)
    auth_db_session.commit()
    auth_db_session.refresh(user)
    return user


@pytest.fixture
def override_auth_db(auth_db_session: Session, app) -> Generator[None, None, None]:
    """
    Override get_db_session (used by /auth/login) to use the auth test DB.
    """

    def _override() -> Generator[Session, None, None]:
        try:
            yield auth_db_session
        finally:
            pass

    app.dependency_overrides[get_db_session] = _override
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)


class TestAuthLogin:
    def test_login_success_sets_access_token_and_cookie(
        self,
        client: TestClient,
        override_auth_db,
        admin_user: User,
    ):
        response = client.post(
            "/auth/login",
            json={"email": admin_user.email, "password": "test-password"},
        )
        assert response.status_code == 200
        data = response.json()
        # Token schema is Token(access_token=...)
        assert "access_token" in data
        assert isinstance(data["access_token"], str) and data["access_token"]
        # Refresh token is sent in HttpOnly cookie (default name fah_refresh_token)
        cookies = response.cookies
        assert cookies.get("fah_refresh_token") is not None

    def test_login_wrong_password_returns_401(
        self,
        client: TestClient,
        override_auth_db,
        admin_user: User,
    ):
        response = client.post(
            "/auth/login",
            json={"email": admin_user.email, "password": "wrong-password"},
        )
        assert response.status_code == 401
        assert response.json().get("detail") == "Invalid credentials"

    def test_login_unknown_email_returns_401(
        self,
        client: TestClient,
        override_auth_db,
        admin_user: User,
    ):
        response = client.post(
            "/auth/login",
            json={"email": "unknown@test.example", "password": "any-password"},
        )
        assert response.status_code == 401
        assert response.json().get("detail") == "Invalid credentials"

    def test_login_rejects_whitespace_only_password(self, client: TestClient, override_auth_db, admin_user: User):
        response = client.post(
            "/auth/login",
            json={"email": admin_user.email, "password": "   "},
        )
        # Input validation should fail before authentication logic.
        assert response.status_code == 422


class TestChangePassword:
    """POST /auth/change-password — requires TEST_DATABASE_URL + auth fixtures."""

    NEW_PASSWORD = "N3wStr0ng!PW"

    def test_change_password_success(
        self,
        client: TestClient,
        override_auth_db,
        admin_user: User,
    ):
        login = client.post(
            "/auth/login",
            json={"email": admin_user.email, "password": "test-password"},
        )
        assert login.status_code == 200
        token = login.json()["access_token"]
        r = client.post(
            "/auth/change-password",
            json={"current_password": "test-password", "new_password": self.NEW_PASSWORD},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json().get("detail") == "Password updated"

    def test_change_password_wrong_current_returns_generic_401(
        self,
        client: TestClient,
        override_auth_db,
        admin_user: User,
    ):
        login = client.post(
            "/auth/login",
            json={"email": admin_user.email, "password": "test-password"},
        )
        assert login.status_code == 200
        token = login.json()["access_token"]
        r = client.post(
            "/auth/change-password",
            json={"current_password": "not-the-password", "new_password": self.NEW_PASSWORD},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 401
        assert r.json().get("detail") == "Invalid credentials"

    def test_login_with_new_password_works_after_change(
        self,
        client: TestClient,
        override_auth_db,
        admin_user: User,
    ):
        login = client.post(
            "/auth/login",
            json={"email": admin_user.email, "password": "test-password"},
        )
        token = login.json()["access_token"]
        ch = client.post(
            "/auth/change-password",
            json={"current_password": "test-password", "new_password": self.NEW_PASSWORD},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert ch.status_code == 200
        login2 = client.post(
            "/auth/login",
            json={"email": admin_user.email, "password": self.NEW_PASSWORD},
        )
        assert login2.status_code == 200
        assert login2.json().get("access_token")

    def test_old_password_rejected_after_change(
        self,
        client: TestClient,
        override_auth_db,
        admin_user: User,
    ):
        login = client.post(
            "/auth/login",
            json={"email": admin_user.email, "password": "test-password"},
        )
        token = login.json()["access_token"]
        client.post(
            "/auth/change-password",
            json={"current_password": "test-password", "new_password": self.NEW_PASSWORD},
            headers={"Authorization": f"Bearer {token}"},
        )
        bad = client.post(
            "/auth/login",
            json={"email": admin_user.email, "password": "test-password"},
        )
        assert bad.status_code == 401
        assert bad.json().get("detail") == "Invalid credentials"

    def test_access_token_invalidated_after_password_change(
        self,
        client: TestClient,
        override_auth_db,
        admin_user: User,
    ):
        login = client.post(
            "/auth/login",
            json={"email": admin_user.email, "password": "test-password"},
        )
        old_access = login.json()["access_token"]
        ch = client.post(
            "/auth/change-password",
            json={"current_password": "test-password", "new_password": self.NEW_PASSWORD},
            headers={"Authorization": f"Bearer {old_access}"},
        )
        assert ch.status_code == 200
        me = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {old_access}"},
        )
        assert me.status_code == 401


# ---------- Admin units tests ----------


class TestAdminUnitsAuth:
    def test_get_units_without_auth_returns_403(self, client: TestClient):
        """
        /api/admin/units is protected by HTTPBearer + require_roles.
        Without Authorization header, HTTPBearer returns 403.
        """
        response = client.get("/api/admin/units")
        assert response.status_code == 403

    def test_get_units_with_admin_auth_returns_200(self, client: TestClient, app):
        """
        Provide an admin user via get_current_user override and
        patch get_session used by the admin units route so no real DB is needed.
        """
        from unittest.mock import patch

        admin_user = User(
            id="admin-user-id",
            email="admin-units@test.example",
            full_name="Admin Units",
            role=UserRole.admin,
            is_active=True,
        )

        app.dependency_overrides[get_current_user] = lambda: admin_user
        try:
            # Minimal session mock compatible with admin_list_units:
            # uses exec(...).all() and close().
            class _UnitsMockSession:
                def __init__(self, rows=None):
                    self._rows = rows or []
                    self._org_id = "test-org-id"

                def exec(self, _query):
                    class Result:
                        def __init__(self, data):
                            self._data = data

                        def all(self):
                            return list(self._data)

                    if "FROM organization" in str(_query):
                        from db.models import Organization
                        return Result([Organization(id=self._org_id, name="Default")])
                    return Result(self._rows)

                def close(self):
                    pass

                def add(self, _obj):
                    pass

                def commit(self):
                    pass

                def refresh(self, _obj):
                    pass

            with patch("app.api.v1.routes_admin_units.get_session") as mock_get_session:
                mock_get_session.return_value = _UnitsMockSession(rows=[])
                response = client.get(
                    "/api/admin/units",
                    headers={"Authorization": "Bearer test-token"},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "items" in data and "total" in data and "skip" in data and "limit" in data
        assert isinstance(data["items"], list)

