"""
POST /api/admin/users — integration tests (PostgreSQL via TEST_DATABASE_URL).

Overrides get_db_session so auth and admin routes share the same test session.
"""

from __future__ import annotations

import os
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine

from auth.dependencies import get_db_session
from auth.security import hash_password
from db.models import Organization, RefreshToken, User, UserCredentials, UserRole
from tests.db_schema_utils import ensure_test_db_schema_from_models


@pytest.fixture(scope="session")
def admin_users_engine():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set; skipping admin user creation DB tests.")
    engine = create_engine(url, pool_pre_ping=True)
    ensure_test_db_schema_from_models(engine)
    return engine


@pytest.fixture
def admin_users_session(admin_users_engine) -> Generator[Session, None, None]:
    with Session(admin_users_engine) as session:
        yield session


@pytest.fixture
def admin_users_cleanup(admin_users_session: Session):
    admin_users_session.exec(RefreshToken.__table__.delete())
    admin_users_session.exec(UserCredentials.__table__.delete())
    admin_users_session.exec(User.__table__.delete())
    admin_users_session.exec(Organization.__table__.delete())
    admin_users_session.commit()


@pytest.fixture
def two_orgs_and_admins(admin_users_session: Session, admin_users_cleanup):
    """Organization A + B; admin user in each (with credentials). Returns dict with ids and passwords."""
    org_a = Organization(name="Org A")
    org_b = Organization(name="Org B")
    admin_users_session.add(org_a)
    admin_users_session.add(org_b)
    admin_users_session.flush()

    pwd_a = "AdminPass!A1"
    pwd_b = "AdminPass!B1"
    admin_a = User(
        organization_id=str(org_a.id),
        email="admin-a@test.example",
        full_name="Admin A",
        role=UserRole.admin,
        is_active=True,
    )
    admin_b = User(
        organization_id=str(org_b.id),
        email="admin-b@test.example",
        full_name="Admin B",
        role=UserRole.admin,
        is_active=True,
    )
    admin_users_session.add(admin_a)
    admin_users_session.add(admin_b)
    admin_users_session.flush()
    admin_users_session.add(
        UserCredentials(user_id=str(admin_a.id), password_hash=hash_password(pwd_a))
    )
    admin_users_session.add(
        UserCredentials(user_id=str(admin_b.id), password_hash=hash_password(pwd_b))
    )

    mgr = User(
        organization_id=str(org_a.id),
        email="manager-a@test.example",
        full_name="Manager A",
        role=UserRole.manager,
        is_active=True,
    )
    admin_users_session.add(mgr)
    admin_users_session.flush()
    admin_users_session.add(
        UserCredentials(user_id=str(mgr.id), password_hash=hash_password("ManagerPass!1"))
    )
    admin_users_session.commit()
    admin_users_session.refresh(org_a)
    admin_users_session.refresh(org_b)
    admin_users_session.refresh(admin_a)
    admin_users_session.refresh(admin_b)
    admin_users_session.refresh(mgr)

    return {
        "org_a_id": str(org_a.id),
        "org_b_id": str(org_b.id),
        "admin_a_email": admin_a.email,
        "admin_a_password": pwd_a,
        "admin_b_email": admin_b.email,
        "admin_b_password": pwd_b,
        "manager_a_email": mgr.email,
        "manager_a_password": "ManagerPass!1",
    }


@pytest.fixture
def override_db_and_patch_admin_users_session(admin_users_session: Session, app):
    """Auth + admin user routes share the same DB session via get_db_session."""

    def _override() -> Generator[Session, None, None]:
        try:
            yield admin_users_session
        finally:
            pass

    app.dependency_overrides[get_db_session] = _override
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)


STRONG_PW = "N3wUser!Str0ng"


class TestAdminCreateUser:
    def test_admin_creates_landlord_tenant_admin_roles(
        self,
        client: TestClient,
        two_orgs_and_admins,
        override_db_and_patch_admin_users_session,
    ):
        ctx = two_orgs_and_admins
        login = client.post(
            "/auth/login",
            json={"email": ctx["admin_a_email"], "password": ctx["admin_a_password"]},
        )
        assert login.status_code == 200
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        for role, email in (
            ("landlord", "new-landlord@test.example"),
            ("tenant", "new-tenant@test.example"),
            ("admin", "new-admin@test.example"),
        ):
            r = client.post(
                "/api/admin/users",
                json={
                    "email": email,
                    "password": STRONG_PW,
                    "role": role,
                    "name": f"User {role}",
                },
                headers=headers,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["email"] == email
            assert data["role"] == role
            assert data["organization_id"] == ctx["org_a_id"]
            assert data["created"] is True
            assert "password" not in data

    def test_manager_forbidden(
        self,
        client: TestClient,
        two_orgs_and_admins,
        override_db_and_patch_admin_users_session,
    ):
        ctx = two_orgs_and_admins
        login = client.post(
            "/auth/login",
            json={"email": ctx["manager_a_email"], "password": ctx["manager_a_password"]},
        )
        assert login.status_code == 200
        token = login.json()["access_token"]
        r = client.post(
            "/api/admin/users",
            json={
                "email": "x@test.example",
                "password": STRONG_PW,
                "role": "tenant",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403

    def test_duplicate_email_same_org_conflict(
        self,
        client: TestClient,
        two_orgs_and_admins,
        override_db_and_patch_admin_users_session,
    ):
        ctx = two_orgs_and_admins
        login = client.post(
            "/auth/login",
            json={"email": ctx["admin_a_email"], "password": ctx["admin_a_password"]},
        )
        token = login.json()["access_token"]
        email = "dup@test.example"
        h = {"Authorization": f"Bearer {token}"}
        assert client.post(
            "/api/admin/users",
            json={"email": email, "password": STRONG_PW, "role": "tenant"},
            headers=h,
        ).status_code == 200
        r2 = client.post(
            "/api/admin/users",
            json={"email": email, "password": STRONG_PW, "role": "tenant"},
            headers=h,
        )
        assert r2.status_code == 409
        assert r2.json().get("detail") == "Email already in use"

    def test_same_email_different_org_allowed(
        self,
        client: TestClient,
        two_orgs_and_admins,
        override_db_and_patch_admin_users_session,
    ):
        ctx = two_orgs_and_admins
        shared_email = "shared@test.example"
        login_a = client.post(
            "/auth/login",
            json={"email": ctx["admin_a_email"], "password": ctx["admin_a_password"]},
        )
        token_a = login_a.json()["access_token"]
        assert (
            client.post(
                "/api/admin/users",
                json={"email": shared_email, "password": STRONG_PW, "role": "tenant"},
                headers={"Authorization": f"Bearer {token_a}"},
            ).status_code
            == 200
        )

        login_b = client.post(
            "/auth/login",
            json={"email": ctx["admin_b_email"], "password": ctx["admin_b_password"]},
        )
        token_b = login_b.json()["access_token"]
        r = client.post(
            "/api/admin/users",
            json={"email": shared_email, "password": STRONG_PW, "role": "tenant"},
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert r.status_code == 200
        assert r.json()["organization_id"] == ctx["org_b_id"]

    def test_created_user_can_login(
        self,
        client: TestClient,
        two_orgs_and_admins,
        override_db_and_patch_admin_users_session,
    ):
        ctx = two_orgs_and_admins
        login = client.post(
            "/auth/login",
            json={"email": ctx["admin_a_email"], "password": ctx["admin_a_password"]},
        )
        token = login.json()["access_token"]
        new_email = "login-check@test.example"
        assert (
            client.post(
                "/api/admin/users",
                json={"email": new_email, "password": STRONG_PW, "role": "tenant"},
                headers={"Authorization": f"Bearer {token}"},
            ).status_code
            == 200
        )
        login_new = client.post(
            "/auth/login",
            json={"email": new_email, "password": STRONG_PW},
        )
        assert login_new.status_code == 200
        assert login_new.json().get("access_token")

    def test_rejects_body_organization_id(
        self,
        client: TestClient,
        two_orgs_and_admins,
        override_db_and_patch_admin_users_session,
    ):
        ctx = two_orgs_and_admins
        login = client.post(
            "/auth/login",
            json={"email": ctx["admin_a_email"], "password": ctx["admin_a_password"]},
        )
        token = login.json()["access_token"]
        r = client.post(
            "/api/admin/users",
            json={
                "email": "extra-field@test.example",
                "password": STRONG_PW,
                "role": "tenant",
                "organization_id": ctx["org_b_id"],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 422
