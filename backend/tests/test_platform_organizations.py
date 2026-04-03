"""
Platform-admin organization API: access control and lightweight route behavior.

Uses dependency overrides (no DATABASE_URL). Optional PostgreSQL tests when TEST_DATABASE_URL is set.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Generator

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func
from sqlmodel import Session, create_engine, select

from auth.dependencies import get_current_user, get_db_session, require_roles
from auth.security import verify_password
from db.models import Organization, User, UserCredentials, UserRole
from db.rls import apply_pg_organization_context
from tests.db_schema_utils import ensure_test_db_schema_from_models
from tests.org_scoped_cleanup import delete_org_scoped_auth_and_users


def test_onboarding_slug_helpers():
    from app.services.organization_onboarding_service import normalize_slug, validate_slug_format

    assert normalize_slug("  Acme & Co  ") == "acme-co"
    validate_slug_format("acme-co")
    try:
        validate_slug_format("")
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError")


class _PlatformListSession:
    """Minimal session: list uses exec().all(); get uses get()."""

    def __init__(self, orgs: list[Organization]):
        self._orgs = orgs

    def exec(self, _query):
        class _R:
            def __init__(self, data):
                self._data = data

            def all(self):
                return list(self._data)

        return _R(self._orgs)

    def get(self, model, id_):
        if model is Organization:
            for o in self._orgs:
                if str(o.id) == str(id_):
                    return o
        return None

    def close(self) -> None:
        pass


def _user(
    *,
    role: UserRole,
    org_id: str = "platform-org-id",
    uid: str = "user-id-1",
    email: str = "u@example.com",
) -> User:
    return User(
        id=uid,
        organization_id=org_id,
        email=email,
        full_name="T",
        role=role,
        is_active=True,
    )


def test_platform_admin_not_granted_org_admin_roles():
    """platform_admin must not pass require_roles('admin', ...) unless explicitly listed."""
    dep = require_roles("admin", "manager")
    pa = _user(role=UserRole.platform_admin)
    with pytest.raises(HTTPException) as exc:
        dep(user=pa)
    assert exc.value.status_code == 403

    admin_u = _user(role=UserRole.admin, uid="adm-1", email="adm@t.c")
    assert dep(user=admin_u) is admin_u

    dep_explicit = require_roles("platform_admin")
    assert dep_explicit(user=pa) is pa


@pytest.fixture
def platform_list_session() -> _PlatformListSession:
    ts = datetime.utcnow()
    return _PlatformListSession(
        [
            Organization(
                id="o1",
                name="FeelAtHomeNow",
                slug="feelathomenow",
                created_at=ts,
            ),
            Organization(id="o2", name="Other", slug="other", created_at=ts),
        ]
    )


@pytest.fixture
def override_platform_db(app, platform_list_session: _PlatformListSession):
    def _inner() -> Generator[Session, None, None]:
        try:
            yield platform_list_session  # type: ignore[misc]
        finally:
            platform_list_session.close()

    app.dependency_overrides[get_db_session] = _inner
    yield
    app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.usefixtures("app")
class TestPlatformOrganizationsAccess:
    def test_org_admin_cannot_list_platform_orgs(
        self,
        client: TestClient,
        app,
        override_platform_db,
    ):
        app.dependency_overrides[get_current_user] = lambda: _user(role=UserRole.admin)
        try:
            r = client.get("/api/platform/organizations")
            assert r.status_code == 403
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    def test_tenant_cannot_list_platform_orgs(
        self,
        client: TestClient,
        app,
        override_platform_db,
    ):
        app.dependency_overrides[get_current_user] = lambda: _user(role=UserRole.tenant)
        try:
            r = client.get("/api/platform/organizations")
            assert r.status_code == 403
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    def test_platform_admin_can_list_organizations(
        self,
        client: TestClient,
        app,
        override_platform_db,
    ):
        app.dependency_overrides[get_current_user] = lambda: _user(
            role=UserRole.platform_admin
        )
        try:
            r = client.get("/api/platform/organizations")
            assert r.status_code == 200
            data = r.json()
            assert len(data) == 2
            assert {x["slug"] for x in data} == {"feelathomenow", "other"}
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    def test_platform_admin_get_organization_by_id(
        self,
        client: TestClient,
        app,
        override_platform_db,
    ):
        app.dependency_overrides[get_current_user] = lambda: _user(
            role=UserRole.platform_admin
        )
        try:
            r = client.get("/api/platform/organizations/o1")
            assert r.status_code == 200
            assert r.json()["name"] == "FeelAtHomeNow"
            r2 = client.get("/api/platform/organizations/missing-id")
            assert r2.status_code == 404
        finally:
            app.dependency_overrides.pop(get_current_user, None)


# ---------- PostgreSQL: onboarding service invariants ----------


@pytest.fixture(scope="session")
def platform_test_engine():
    test_db_url = os.getenv("TEST_DATABASE_URL")
    if not test_db_url:
        pytest.skip("TEST_DATABASE_URL is not set; skipping platform DB tests.")
    engine = create_engine(test_db_url, pool_pre_ping=True)
    ensure_test_db_schema_from_models(engine)
    return engine


@pytest.fixture
def platform_db_session(platform_test_engine) -> Generator[Session, None, None]:
    with Session(platform_test_engine) as session:
        yield session


@pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not set",
)
class TestOrganizationOnboardingServiceDB:
    def test_duplicate_admin_does_not_overwrite_password(
        self, platform_db_session: Session
    ):
        from app.services.organization_onboarding_service import create_initial_org_admin

        delete_org_scoped_auth_and_users(platform_db_session)
        platform_db_session.exec(Organization.__table__.delete())  # type: ignore[attr-defined]
        platform_db_session.commit()

        org = Organization(name="Svc Test Org", slug="svc-test-org-dup")
        platform_db_session.add(org)
        platform_db_session.commit()
        platform_db_session.refresh(org)
        oid = str(org.id)
        apply_pg_organization_context(platform_db_session, oid)

        email = "dupadmin@test.example"
        pw1 = "FirstPwd1ab"
        m1 = create_initial_org_admin(
            platform_db_session,
            apply=True,
            org_id=oid,
            admin_email=email,
            admin_password=pw1,
            commit=True,
            prompt_for_password_if_missing=False,
        )
        assert "created" in m1.lower()
        u = platform_db_session.exec(
            select(User).where(
                User.organization_id == oid,
                func.lower(User.email) == email.lower(),
            )
        ).first()
        assert u is not None
        creds = platform_db_session.exec(
            select(UserCredentials).where(UserCredentials.user_id == u.id)
        ).first()
        assert creds is not None
        hash_after_first = creds.password_hash

        m2 = create_initial_org_admin(
            platform_db_session,
            apply=True,
            org_id=oid,
            admin_email=email,
            admin_password="DifferentPwd2ab",
            commit=True,
            prompt_for_password_if_missing=False,
        )
        assert "already exists" in m2
        platform_db_session.expire_all()
        creds2 = platform_db_session.exec(
            select(UserCredentials).where(UserCredentials.user_id == u.id)
        ).first()
        assert creds2 is not None
        assert creds2.password_hash == hash_after_first
        assert verify_password(pw1, creds2.password_hash)

    def test_platform_create_rejects_duplicate_slug(
        self, platform_db_session: Session
    ):
        from app.services.organization_onboarding_service import (
            OrganizationDuplicateError,
            platform_create_organization_with_optional_admin,
        )

        delete_org_scoped_auth_and_users(platform_db_session)
        platform_db_session.exec(Organization.__table__.delete())  # type: ignore[attr-defined]
        platform_db_session.commit()

        slug = "dup-slug-abc"
        platform_create_organization_with_optional_admin(
            platform_db_session,
            organization_name="One",
            organization_slug=slug,
            create_admin=False,
            admin_email=None,
            admin_password=None,
        )
        with pytest.raises(OrganizationDuplicateError):
            platform_create_organization_with_optional_admin(
                platform_db_session,
                organization_name="Two",
                organization_slug=slug,
                create_admin=False,
                admin_email=None,
                admin_password=None,
            )

    def test_platform_create_org_and_optional_admin_committed_together(
        self, platform_db_session: Session
    ):
        from app.services.organization_onboarding_service import (
            platform_create_organization_with_optional_admin,
        )

        delete_org_scoped_auth_and_users(platform_db_session)
        platform_db_session.exec(Organization.__table__.delete())  # type: ignore[attr-defined]
        platform_db_session.commit()

        slug = "atomic-org-slug-xyz"
        email = "firstadmin@atomic.test"
        platform_create_organization_with_optional_admin(
            platform_db_session,
            organization_name="Atomic Org",
            organization_slug=slug,
            create_admin=True,
            admin_email=email,
            admin_password="ValidPwd1ab",
        )
        org = platform_db_session.exec(
            select(Organization).where(Organization.slug == slug)
        ).first()
        assert org is not None
        u = platform_db_session.exec(
            select(User).where(
                User.organization_id == str(org.id),
                func.lower(User.email) == email.lower(),
            )
        ).first()
        assert u is not None
        assert u.role == UserRole.admin
