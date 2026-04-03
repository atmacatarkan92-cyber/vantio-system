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

# CI may use stubs or older models without UserRole.platform_admin; avoid AttributeError.
_PLATFORM_ADMIN_TEST_ROLE = getattr(UserRole, "platform_admin", "platform_admin")


def test_organization_slug_unique_on_model():
    """DB also enforces via migration 062 (ix_organization_slug); model stays aligned."""
    assert Organization.__table__.c.slug.unique


def test_organization_to_list_item_serializes_uuid_id_as_str():
    """PostgreSQL may return UUID objects; OrganizationListItem.id must be str."""
    import uuid
    from types import SimpleNamespace

    from app.api.v1.routes_platform import _organization_to_list_item

    uid = uuid.uuid4()
    org = SimpleNamespace(id=uid, name="N", slug="s", created_at=None)
    item = _organization_to_list_item(org)  # type: ignore[arg-type]
    assert item.id == str(uid)
    assert isinstance(item.id, str)


def test_user_to_platform_org_item_serializes_uuid_id_as_str():
    import uuid
    from types import SimpleNamespace

    from app.api.v1.routes_platform import _user_to_platform_org_item

    uid = uuid.uuid4()
    u = SimpleNamespace(
        id=uid,
        email="e@example.com",
        role=UserRole.manager,
        created_at=None,
        is_active=True,
    )
    item = _user_to_platform_org_item(u)  # type: ignore[arg-type]
    assert item.id == str(uid)
    assert isinstance(item.id, str)


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
    """Minimal session: list uses exec().all(); get uses get(); detail loads User rows."""

    def __init__(self, orgs: list[Organization], users: list[User] | None = None):
        self._orgs = orgs
        self._users = users or []
        self._last_org_id: str | None = None

    def exec(self, query):
        class _R:
            def __init__(self, data):
                self._data = data

            def all(self):
                return list(self._data)

        entities = [d.get("entity") for d in (getattr(query, "column_descriptions", None) or []) if d.get("entity")]
        if User in entities:
            lid = self._last_org_id
            if lid is None:
                return _R([])
            filtered = [u for u in self._users if str(u.organization_id) == str(lid)]
            return _R(filtered)
        return _R(self._orgs)

    def get(self, model, id_):
        if model is Organization:
            for o in self._orgs:
                if str(o.id) == str(id_):
                    self._last_org_id = str(o.id)
                    return o
            self._last_org_id = None
            return None
        return None

    def close(self) -> None:
        pass


def _user(
    *,
    role: UserRole | str,
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
    pa = _user(role=_PLATFORM_ADMIN_TEST_ROLE)
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
    org_users = [
        User(
            id="u-admin-1",
            organization_id="o1",
            email="admin@o1.example",
            full_name="Org Admin",
            role=UserRole.admin,
            is_active=True,
            created_at=ts,
        ),
        User(
            id="u-tenant-1",
            organization_id="o1",
            email="tenant@o1.example",
            full_name="Tenant User",
            role=UserRole.tenant,
            is_active=False,
            created_at=ts,
        ),
    ]
    return _PlatformListSession(
        [
            Organization(
                id="o1",
                name="FeelAtHomeNow",
                slug="feelathomenow",
                created_at=ts,
            ),
            Organization(id="o2", name="Other", slug="other", created_at=ts),
        ],
        users=org_users,
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
            role=_PLATFORM_ADMIN_TEST_ROLE
        )
        try:
            r = client.get("/api/platform/organizations")
            assert r.status_code == 200
            data = r.json()
            assert len(data) == 2
            assert {x["slug"] for x in data} == {"feelathomenow", "other"}
            assert all(isinstance(x["id"], str) for x in data)
            by_slug = {x["slug"]: x for x in data}
            assert by_slug["feelathomenow"]["id"] == "o1"
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    def test_platform_admin_get_organization_by_id(
        self,
        client: TestClient,
        app,
        override_platform_db,
    ):
        app.dependency_overrides[get_current_user] = lambda: _user(
            role=_PLATFORM_ADMIN_TEST_ROLE
        )
        try:
            r = client.get("/api/platform/organizations/o1")
            assert r.status_code == 200
            body = r.json()
            assert body["name"] == "FeelAtHomeNow"
            assert body["id"] == "o1"
            assert isinstance(body["id"], str)
            assert "users" in body
            assert isinstance(body["users"], list)
            assert len(body["users"]) == 2
            assert {u["email"] for u in body["users"]} == {
                "admin@o1.example",
                "tenant@o1.example",
            }
            admin_row = next(u for u in body["users"] if u["email"] == "admin@o1.example")
            assert admin_row["role"] == "admin"
            assert isinstance(admin_row["id"], str)
            assert admin_row["id"] == "u-admin-1"
            r_o2 = client.get("/api/platform/organizations/o2")
            assert r_o2.status_code == 200
            assert r_o2.json()["users"] == []
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
        from app.services.organization_onboarding_service import (
            create_initial_org_admin,
            organization_slug_column_exists,
        )

        delete_org_scoped_auth_and_users(platform_db_session)
        platform_db_session.exec(Organization.__table__.delete())  # type: ignore[attr-defined]
        platform_db_session.commit()

        org_kwargs: dict = {"name": "Svc Test Org"}
        if organization_slug_column_exists(platform_db_session):
            org_kwargs["slug"] = "svc-test-org-dup"
        org = Organization(**org_kwargs)
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
            organization_slug_column_exists,
            platform_create_organization_with_optional_admin,
        )

        if not organization_slug_column_exists(platform_db_session):
            pytest.skip("organization.slug column not present; duplicate-slug test requires it")

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
            organization_slug_column_exists,
            platform_create_organization_with_optional_admin,
        )

        delete_org_scoped_auth_and_users(platform_db_session)
        platform_db_session.exec(Organization.__table__.delete())  # type: ignore[attr-defined]
        platform_db_session.commit()

        email = "firstadmin@atomic.test"
        org_name = "Atomic Org CI Test"
        slug = "atomic-org-slug-xyz"
        slug_ok = organization_slug_column_exists(platform_db_session)
        platform_create_organization_with_optional_admin(
            platform_db_session,
            organization_name=org_name,
            organization_slug=slug if slug_ok else None,
            create_admin=True,
            admin_email=email,
            admin_password="ValidPwd1ab",
        )
        org = (
            platform_db_session.exec(
                select(Organization).where(Organization.slug == slug)
            ).first()
            if slug_ok
            else platform_db_session.exec(
                select(Organization).where(Organization.name == org_name)
            ).first()
        )
        assert org is not None
        u = platform_db_session.exec(
            select(User).where(
                User.organization_id == str(org.id),
                func.lower(User.email) == email.lower(),
            )
        ).first()
        assert u is not None
        assert u.role == UserRole.admin
