"""
PostgreSQL RLS integration tests (require DATABASE_URL and migrated schema).

Proves tenant isolation is enforced by the database (SELECT, INSERT, UPDATE), not only
application WHERE clauses. Uses real SQLAlchemy sessions and commits; assertions are on
row visibility, rowcount, and PostgreSQL RLS error messages.
"""
from __future__ import annotations

import os
import uuid

import pytest
from sqlalchemy import text, update
from sqlmodel import Session, select

from db.models import Organization, Room, Tenant, Unit
from db.rls import apply_pg_organization_context


def _require_engine():
    from db import database as db_mod

    if db_mod.engine is None:
        pytest.skip("DATABASE_URL not configured")
    return db_mod.engine


@pytest.fixture
def engine():
    return _require_engine()


@pytest.fixture
def rls_test_ids():
    """Unique ids so tests do not collide with other data."""
    suffix = uuid.uuid4().hex[:12]
    return {
        "org_a": f"rls-test-org-a-{suffix}",
        "org_b": f"rls-test-org-b-{suffix}",
        "unit_a": f"rls-test-unit-a-{suffix}",
        "room_a": f"rls-test-room-a-{suffix}",
        "tenant_a": f"rls-test-tenant-a-{suffix}",
    }


@pytest.fixture
def seeded_tenant_rows(engine, rls_test_ids):
    """Insert org A/B, one unit+room+tenant under A; cleanup after."""
    ids = rls_test_ids
    org_a = ids["org_a"]
    org_b = ids["org_b"]

    with Session(engine) as session:
        apply_pg_organization_context(session, org_a)
        session.add(Organization(id=org_a, name="RLS test A"))
        session.add(
            Unit(
                id=ids["unit_a"],
                organization_id=org_a,
                title="RLS Unit",
                address="1 Test St",
                city="Zurich",
                rooms=2,
            )
        )
        session.add(
            Room(
                id=ids["room_a"],
                unit_id=ids["unit_a"],
                name="Room 1",
                price=500,
                is_active=True,
            )
        )
        session.add(
            Tenant(
                id=ids["tenant_a"],
                organization_id=org_a,
                name="RLS Tenant",
                email=f"rls-{ids['tenant_a']}@example.test",
            )
        )
        session.commit()

    with Session(engine) as session:
        session.add(Organization(id=org_b, name="RLS test B"))
        session.commit()

    yield ids

    with Session(engine) as session:
        apply_pg_organization_context(session, org_a)
        session.execute(text("DELETE FROM tenant WHERE id = :id"), {"id": ids["tenant_a"]})
        session.execute(text("DELETE FROM room WHERE id = :id"), {"id": ids["room_a"]})
        session.execute(text("DELETE FROM unit WHERE id = :id"), {"id": ids["unit_a"]})
        session.commit()
    with Session(engine) as session:
        session.execute(
            text("DELETE FROM organization WHERE id IN (:a, :b)"),
            {"a": org_a, "b": org_b},
        )
        session.commit()


def test_rls_same_org_sees_rows(engine, seeded_tenant_rows):
    ids = seeded_tenant_rows
    org_a = ids["org_a"]
    with Session(engine) as session:
        apply_pg_organization_context(session, org_a)
        units = session.exec(select(Unit).where(Unit.id == ids["unit_a"])).all()
        rooms = session.exec(select(Room).where(Room.id == ids["room_a"])).all()
        tenants = session.exec(select(Tenant).where(Tenant.id == ids["tenant_a"])).all()
    assert len(units) == 1
    assert len(rooms) == 1
    assert len(tenants) == 1


def test_rls_other_org_sees_no_tenant_rows(engine, seeded_tenant_rows):
    ids = seeded_tenant_rows
    org_b = ids["org_b"]
    with Session(engine) as session:
        apply_pg_organization_context(session, org_b)
        units = session.exec(select(Unit).where(Unit.id == ids["unit_a"])).all()
        tenants = session.exec(select(Tenant).where(Tenant.id == ids["tenant_a"])).all()
    assert len(units) == 0
    assert len(tenants) == 0


def test_rls_other_org_sees_no_room(engine, seeded_tenant_rows):
    """DB RLS: room visibility follows parent unit org; other org must see zero rooms."""
    ids = seeded_tenant_rows
    org_b = ids["org_b"]
    with Session(engine) as session:
        apply_pg_organization_context(session, org_b)
        rooms = session.exec(select(Room).where(Room.id == ids["room_a"])).all()
    assert len(rooms) == 0


def test_rls_missing_context_sees_nothing(engine, seeded_tenant_rows):
    ids = seeded_tenant_rows
    with Session(engine) as session:
        units = session.exec(select(Unit).where(Unit.id == ids["unit_a"])).all()
        rooms = session.exec(select(Room).where(Room.id == ids["room_a"])).all()
    assert len(units) == 0
    assert len(rooms) == 0


def test_rls_insert_unit_without_context_fails(engine):
    """
    WITH CHECK on unit requires organization_id = current_setting(...).
    With no GUC, INSERT must be rejected by PostgreSQL (not silently insert zero app-side rows).
    """
    suffix = uuid.uuid4().hex[:12]
    org_x = f"rls-insert-org-{suffix}"
    uid = f"rls-insert-unit-{suffix}"
    try:
        with Session(engine) as session:
            session.add(Organization(id=org_x, name="RLS insert org"))
            session.commit()
        with Session(engine) as session:
            session.add(
                Unit(
                    id=uid,
                    organization_id=org_x,
                    title="No ctx",
                    address="a",
                    city="Zurich",
                    rooms=1,
                )
            )
            with pytest.raises(Exception) as exc:
                session.commit()
        msg = str(exc.value).lower()
        assert "row-level security" in msg or "policy" in msg
    finally:
        with Session(engine) as session:
            session.execute(text("DELETE FROM organization WHERE id = :id"), {"id": org_x})
            session.commit()


def test_rls_insert_tenant_wrong_org_context_fails(engine, seeded_tenant_rows):
    """SET LOCAL to org B cannot INSERT a row for org A (WITH CHECK)."""
    ids = seeded_tenant_rows
    org_a = ids["org_a"]
    org_b = ids["org_b"]
    tid = f"rls-bad-tenant-{uuid.uuid4().hex[:12]}"
    with Session(engine) as session:
        apply_pg_organization_context(session, org_b)
        session.add(
            Tenant(
                id=tid,
                organization_id=org_a,
                name="Wrong org",
                email=f"{tid}@example.test",
            )
        )
        with pytest.raises(Exception) as exc:
            session.commit()
    msg = str(exc.value).lower()
    assert "row-level security" in msg or "policy" in msg


def test_rls_update_other_org_unit_affects_zero_rows(engine, seeded_tenant_rows):
    """UPDATE cannot touch another tenant's unit; rowcount must be 0."""
    ids = seeded_tenant_rows
    org_b = ids["org_b"]
    with Session(engine) as session:
        apply_pg_organization_context(session, org_b)
        result = session.execute(
            update(Unit)
            .where(Unit.id == ids["unit_a"])
            .values(title="Should not apply")
        )
        session.commit()
    assert getattr(result, "rowcount", None) == 0


def test_rls_same_session_after_commit_still_sees_tenant_rows(engine, seeded_tenant_rows):
    """
    After commit(), a new transaction begins; after_begin must SET LOCAL again so SELECT
    still returns rows for the same Session + session.info['rls_org_id'].
    """
    ids = seeded_tenant_rows
    org_a = ids["org_a"]
    with Session(engine) as session:
        apply_pg_organization_context(session, org_a)
        n_before = len(session.exec(select(Unit).where(Unit.id == ids["unit_a"])).all())
        session.commit()
        n_after = len(session.exec(select(Unit).where(Unit.id == ids["unit_a"])).all())
    assert n_before == 1
    assert n_after == 1


def test_rls_get_session_uses_context_var_like_post_auth_route(engine, seeded_tenant_rows):
    """
    Mirrors production: get_current_user sets ContextVar, then route calls get_session().
    Fresh Session must receive SET LOCAL via get_session -> apply_pg_organization_context.
    """
    from db.database import get_session as db_get_session
    from db.rls import set_request_organization_id

    ids = seeded_tenant_rows
    org_a = ids["org_a"]
    rows: list = []
    set_request_organization_id(org_a)
    try:
        session = db_get_session()
        try:
            rows = session.exec(select(Unit).where(Unit.id == ids["unit_a"])).all()
        finally:
            session.close()
    finally:
        set_request_organization_id(None)
    assert len(rows) == 1
