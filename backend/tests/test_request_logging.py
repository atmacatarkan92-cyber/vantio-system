"""
Request correlation: X-Request-ID, structured lifecycle logs, no auth secrets in logs.
"""
import logging
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core import request_logging as request_logging_mod


class TestRequestIdHeaders:
    def test_health_returns_x_request_id(self, client: TestClient):
        r = client.get("/api/health")
        assert r.status_code == 200
        rid = r.headers.get("X-Request-ID")
        assert rid
        uuid.UUID(rid)

    def test_x_request_id_reused_when_valid(self, client: TestClient):
        custom = "client-trace-abc-01"
        r = client.get("/api/health", headers={"X-Request-ID": custom})
        assert r.status_code == 200
        assert r.headers.get("X-Request-ID") == custom

    def test_invalid_x_request_id_replaced(self, client: TestClient):
        r = client.get("/api/health", headers={"X-Request-ID": "bad id!"})
        assert r.status_code == 200
        rid = r.headers.get("X-Request-ID")
        assert rid
        assert "!" not in rid
        uuid.UUID(rid)


class TestRequestLoggingSafe:
    def test_request_completed_does_not_log_authorization_header(
        self, client: TestClient, caplog: pytest.LogCaptureFixture
    ):
        caplog.set_level(logging.INFO, logger="app.request")
        secret = "do-not-log-this-token-value"
        client.get(
            "/api/health",
            headers={"Authorization": f"Bearer {secret}"},
        )
        combined = "\n".join(rec.getMessage() for rec in caplog.records if rec.name == "app.request")
        assert secret not in combined
        assert "Bearer" not in combined


class TestRequestLogContext:
    def test_unauthenticated_request_log_has_dash_org_and_user(
        self, client: TestClient, caplog: pytest.LogCaptureFixture
    ):
        caplog.set_level(logging.INFO)
        client.get("/api/health")
        rec = next(
            r
            for r in caplog.records
            if r.name == "app.request" and "event=request_completed" in r.getMessage()
        )
        assert rec.request_id != "-"
        assert rec.org_id == "-"
        assert rec.user_id == "-"
        msg = rec.getMessage()
        assert "request_id=" in msg
        assert "user_id=null" in msg
        assert "organization_id=null" in msg

    def test_authenticated_request_completed_log_includes_user_and_org(
        self, client: TestClient, app, caplog: pytest.LogCaptureFixture
    ):
        from fastapi import Request

        from app.core.request_logging import set_log_user_id
        from auth.dependencies import get_current_user
        from db.models import User, UserRole
        from db.rls import set_request_organization_id

        uid = "req-log-test-user"
        oid = "req-log-test-org"

        def fake_current_user(request: Request) -> User:
            set_log_user_id(uid)
            set_request_organization_id(oid)
            request.state.user_id = uid
            request.state.organization_id = oid
            return User(
                id=uid,
                organization_id=oid,
                email="a@a.com",
                full_name="A",
                role=UserRole.admin,
                is_active=True,
            )

        app.dependency_overrides[get_current_user] = fake_current_user
        try:
            caplog.set_level(logging.INFO, logger="app.request")
            r = client.get("/auth/me")
            assert r.status_code == 200
            msg = next(
                rec.getMessage()
                for rec in caplog.records
                if rec.name == "app.request" and "event=request_completed" in rec.getMessage()
            )
            assert uid in msg
            assert oid in msg
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    def test_request_context_filter_injects_ids(self):
        """Filter reads ContextVar / RLS org (same bindings as an authenticated request)."""
        from db.rls import _request_organization_id, set_request_organization_id

        tok_r = request_logging_mod._request_id.set(None)
        tok_u = request_logging_mod._log_user_id.set(None)
        tok_o = _request_organization_id.set(None)
        try:
            request_logging_mod._request_id.set("req-test")
            set_request_organization_id("org-test")
            request_logging_mod.set_log_user_id("user-test")
            filt = request_logging_mod.RequestContextFilter()
            rec = logging.LogRecord("t", logging.INFO, __file__, 0, "msg", (), None)
            assert filt.filter(rec)
            assert rec.request_id == "req-test"
            assert rec.org_id == "org-test"
            assert rec.user_id == "user-test"
        finally:
            request_logging_mod._request_id.reset(tok_r)
            request_logging_mod._log_user_id.reset(tok_u)
            _request_organization_id.reset(tok_o)
