"""
Password reset flow tests.

Focus:
 - Generic forgot-password response (no enumeration)
 - Secure single-use, expiring reset tokens
 - Password update invalidates old password + refresh tokens + pv access tokens
"""

import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Generator
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlmodel import Session, create_engine, select

import auth.routes as auth_routes
from auth.dependencies import get_db_session
from auth.security import hash_password
from db.models import (
    Organization,
    RefreshToken,
    User,
    UserCredentials,
    UserRole,
    PasswordResetToken,
)
from db.rls import apply_pg_organization_context
from tests.db_schema_utils import ensure_test_db_schema_from_models


GENERIC_FORGOT_DETAIL = "If the account exists, a password reset link has been sent."


def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


@pytest.fixture(scope="session")
def reset_test_engine():
    test_db_url = os.getenv("TEST_DATABASE_URL")
    if not test_db_url:
        pytest.skip("TEST_DATABASE_URL is not set; skipping password reset DB tests.")
    engine = create_engine(test_db_url, pool_pre_ping=True)
    ensure_test_db_schema_from_models(engine)
    return engine


@pytest.fixture
def reset_db_session(reset_test_engine) -> Generator[Session, None, None]:
    with Session(reset_test_engine) as session:
        yield session


@pytest.fixture
def override_reset_db(reset_db_session: Session, app) -> Generator[None, None, None]:
    def _override() -> Generator[Session, None, None]:
        try:
            yield reset_db_session
        finally:
            pass

    app.dependency_overrides[get_db_session] = _override
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)


@pytest.fixture
def cleanup_reset_tables(reset_db_session: Session):
    # Delete in FK-safe order
    reset_db_session.exec(PasswordResetToken.__table__.delete())
    reset_db_session.exec(RefreshToken.__table__.delete())
    reset_db_session.exec(UserCredentials.__table__.delete())
    # users: RLS requires app.current_organization_id; delete per org (same pattern as test_rls.py)
    # Use scalars() so each id is a full string — exec().all() can yield plain str rows, and
    # row[0] on a str is only the first character, so deletes would silently match nothing.
    for oid in reset_db_session.scalars(select(Organization.id)).all():
        oid_s = str(oid)
        apply_pg_organization_context(reset_db_session, oid_s)
        reset_db_session.execute(delete(User).where(User.organization_id == oid_s))
    reset_db_session.exec(Organization.__table__.delete())
    reset_db_session.commit()


@pytest.fixture
def org_and_user(reset_db_session: Session, cleanup_reset_tables):
    org = Organization(name="Reset Org")
    reset_db_session.add(org)
    reset_db_session.flush()
    apply_pg_organization_context(reset_db_session, str(org.id))

    user = User(
        organization_id=str(org.id),
        email="reset-user@test.example",
        full_name="Reset User",
        role=UserRole.tenant,
        is_active=True,
    )
    reset_db_session.add(user)
    reset_db_session.flush()

    old_password = "OldPassword!1"
    creds = UserCredentials(
        user_id=str(user.id),
        organization_id=str(org.id),
        password_hash=hash_password(old_password),
    )
    reset_db_session.add(creds)
    reset_db_session.commit()
    reset_db_session.refresh(user)

    return {
        "org_id": str(org.id),
        "user_id": str(user.id),
        "email": user.email,
        "old_password": old_password,
    }


@pytest.fixture
def captured_reset_token(monkeypatch):
    captured = {"reset_link": None}

    def _fake_send(recipient_email: str, reset_link: str) -> bool:
        # Do not log password/token.
        captured["reset_link"] = reset_link
        return True

    monkeypatch.setattr(auth_routes, "send_password_reset_email", _fake_send)
    return captured


def _extract_token_from_link(reset_link: str) -> str:
    qs = parse_qs(urlparse(reset_link).query)
    token_list = qs.get("token") or []
    return token_list[0] if token_list else ""


class TestPasswordReset:
    def test_forgot_password_generic_success_existing_email_sends_token(
        self,
        client: TestClient,
        override_reset_db,
        org_and_user,
        captured_reset_token,
    ):
        r = client.post("/auth/forgot-password", json={"email": org_and_user["email"]})
        assert r.status_code == 200
        assert r.json().get("detail") == GENERIC_FORGOT_DETAIL

        assert captured_reset_token["reset_link"] is not None
        token = _extract_token_from_link(captured_reset_token["reset_link"])
        assert token

    def test_forgot_password_generic_success_non_existing_email_does_not_send(
        self,
        client: TestClient,
        override_reset_db,
        cleanup_reset_tables,
        captured_reset_token,
    ):
        r = client.post("/auth/forgot-password", json={"email": "no-such-user@test.example"})
        assert r.status_code == 200
        assert r.json().get("detail") == GENERIC_FORGOT_DETAIL
        assert captured_reset_token["reset_link"] is None

    def test_reset_password_single_use_expiry_and_invalidation(
        self,
        client: TestClient,
        override_reset_db,
        reset_db_session: Session,
        org_and_user,
        captured_reset_token,
    ):
        # 1) Forgot -> get token from email
        forgot = client.post("/auth/forgot-password", json={"email": org_and_user["email"]})
        assert forgot.status_code == 200
        token = _extract_token_from_link(captured_reset_token["reset_link"])
        assert token

        # 2) Login to obtain refresh cookie + access token (used to validate invalidation)
        login = client.post(
            "/auth/login",
            json={"email": org_and_user["email"], "password": org_and_user["old_password"]},
        )
        assert login.status_code == 200
        access_token = login.json()["access_token"]
        old_refresh_cookie = login.cookies.get("fah_refresh_token")
        assert old_refresh_cookie is not None

        # 3) Reset password
        new_password = "NewPassword!2"
        reset = client.post(
            "/auth/reset-password",
            json={"token": token, "new_password": new_password},
        )
        assert reset.status_code == 200
        assert reset.json().get("detail") == "Password updated"

        # 4) Token cannot be reused
        reuse = client.post(
            "/auth/reset-password",
            json={"token": token, "new_password": new_password},
        )
        assert reuse.status_code == 400
        assert reuse.json().get("detail") == "Invalid or expired token"

        # 5) Old password no longer works
        bad_login = client.post(
            "/auth/login",
            json={"email": org_and_user["email"], "password": org_and_user["old_password"]},
        )
        assert bad_login.status_code == 401

        # 6) New password works
        good_login = client.post(
            "/auth/login",
            json={"email": org_and_user["email"], "password": new_password},
        )
        assert good_login.status_code == 200

        # 7) Refresh tokens revoked
        refresh = client.post("/auth/refresh", cookies={"fah_refresh_token": old_refresh_cookie})
        assert refresh.status_code == 401

        # 8) Access token invalidated via pv/password_changed_at
        me = client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        assert me.status_code == 401

        # Ensure token is marked used in DB
        token_hash = _sha256_hex(token)
        row = reset_db_session.exec(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)).first()
        assert row is not None
        assert row.used_at is not None

    def test_expired_reset_token_fails(
        self,
        client: TestClient,
        override_reset_db,
        reset_db_session: Session,
        org_and_user,
        captured_reset_token,
    ):
        forgot = client.post("/auth/forgot-password", json={"email": org_and_user["email"]})
        assert forgot.status_code == 200
        token = _extract_token_from_link(captured_reset_token["reset_link"])
        assert token

        token_hash = _sha256_hex(token)
        row = reset_db_session.exec(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        ).first()
        assert row is not None

        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        reset_db_session.add(row)
        reset_db_session.commit()

        reset = client.post(
            "/auth/reset-password",
            json={"token": token, "new_password": "NewPassword!2"},
        )
        assert reset.status_code == 400
        assert reset.json().get("detail") == "Invalid or expired token"

