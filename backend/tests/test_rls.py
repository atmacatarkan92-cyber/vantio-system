"""
PostgreSQL RLS integration tests (require DATABASE_URL and migrated schema).

Proves tenant isolation is enforced by the database (SELECT, INSERT, UPDATE), not only
application WHERE clauses. Uses real SQLAlchemy sessions and commits; assertions are on
row visibility, rowcount, and PostgreSQL RLS error messages.
"""
from __future__ import annotations

import uuid

import pytest
from datetime import date

from sqlalchemy import text, update
from sqlmodel import Session, select

from db.models import (
    Invoice,
    Landlord,
    Organization,
    Property,
    Room,
    Tenancy,
    TenancyStatus,
    Tenant,
    Unit,
    UnitCost,
)
from db.rls import apply_pg_organization_context


def _require_engine():
    from db import database as db_mod

    if db_mod.engine is None:
        pytest.skip("DATABASE_URL not configured")
    return db_mod.engine


@pytest.fixture
def engine():
    return _require_engine()


def test_rls_environment_validates_database_role_and_policies(engine):
    """
    Fail fast when the DB session bypasses RLS (superuser / BYPASSRLS) or migrations 023/025
    are missing. CI must connect as a dedicated app role; Alembic runs as the migration role.
    """
    expected_policies = {
        ("unit", "org_isolation_unit"),
        ("tenant", "org_isolation_tenant"),
        ("room", "org_isolation_room"),
        ("tenancies", "org_isolation_tenancies"),
        ("invoices", "org_isolation_invoices"),
        ("properties", "org_isolation_properties"),
        ("landlords", "org_isolation_landlords"),
        ("unit_costs", "org_isolation_unit_costs"),
        ("tenant_notes", "org_isolation_tenant_notes"),
        ("tenant_events", "org_isolation_tenant_events"),
    }
    with Session(engine) as session:
        cu, su = session.execute(text("SELECT current_user, session_user")).one()
        assert cu == su, (
            f"current_user and session_user must match (got {cu!r}, {su!r})"
        )

        rolsuper, rolbypass = session.execute(
            text(
                "SELECT r.rolsuper, r.rolbypassrls FROM pg_roles r "
                "WHERE r.rolname = current_user"
            )
        ).one()
        assert rolsuper is False, (
            "DATABASE_URL must use a non-superuser role; superuser bypasses RLS."
        )
        assert rolbypass is False, (
            "DATABASE_URL must use a role without BYPASSRLS; RLS is skipped for that attribute."
        )

        guc = session.execute(
            text("SELECT current_setting('app.current_organization_id', true)")
        ).scalar()
        assert guc is None or guc == "", (
            f"GUC must be unset without request context; got {guc!r}"
        )

        rls_rows = session.execute(
            text(
                """
                SELECT c.relname, c.relrowsecurity
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r'
                  AND c.relname IN (
                    'invoices', 'landlords', 'properties', 'room',
                    'tenancies', 'tenant', 'tenant_events', 'tenant_notes',
                    'unit', 'unit_costs'
                  )
                ORDER BY c.relname
                """
            )
        ).all()
        names = [r[0] for r in rls_rows]
        assert names == [
            "invoices",
            "landlords",
            "properties",
            "room",
            "tenancies",
            "tenant",
            "tenant_events",
            "tenant_notes",
            "unit",
            "unit_costs",
        ], (
            f"expected RLS tables from migrations 023/025/030; got {names}"
        )
        for relname, relrowsecurity in rls_rows:
            assert relrowsecurity is True, f"RLS not enabled on {relname}"

        pols = session.execute(
            text(
                """
                SELECT tablename, policyname
                FROM pg_policies
                WHERE tablename IN (
                    'unit', 'tenant', 'room', 'tenancies', 'invoices',
                    'properties', 'landlords', 'unit_costs',
                    'tenant_notes', 'tenant_events'
                )
                """
            )
        ).all()
        got = {(r[0], r[1]) for r in pols}
        assert got == expected_policies, (
            f"expected policies {expected_policies}; got {got}. "
            "Apply migrations 023_rls_unit_tenant_room, 025_rls_core_tables, and 030_rls_tenant_crm."
        )


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

    # Commit org + unit first so the room policy's EXISTS (.. unit ..) sees a committed unit row.
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
        session.commit()

    with Session(engine) as session:
        apply_pg_organization_context(session, org_a)
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

    # Teardown: child tables first (FK + RLS), then tenant → room → unit → organizations.
    with Session(engine) as session:
        apply_pg_organization_context(session, org_a)
        session.execute(
            text("DELETE FROM invoices WHERE organization_id = :oid"), {"oid": org_a}
        )
        session.execute(
            text("DELETE FROM tenancies WHERE organization_id = :oid"), {"oid": org_a}
        )
        session.execute(
            text("DELETE FROM unit_costs WHERE unit_id = :uid"), {"uid": ids["unit_a"]}
        )
        session.execute(
            text("DELETE FROM properties WHERE organization_id = :oid"), {"oid": org_a}
        )
        session.execute(
            text("DELETE FROM landlords WHERE organization_id = :oid"), {"oid": org_a}
        )
        session.execute(text("DELETE FROM tenant WHERE id = :id"), {"id": ids["tenant_a"]})
        session.execute(text("DELETE FROM room WHERE id = :id"), {"id": ids["room_a"]})
        session.execute(text("DELETE FROM unit WHERE id = :id"), {"id": ids["unit_a"]})
        session.commit()
    with Session(engine) as session:
        session.execute(text("DELETE FROM organization WHERE id = :id"), {"id": org_a})
        session.execute(text("DELETE FROM organization WHERE id = :id"), {"id": org_b})
        session.commit()


@pytest.fixture
def seeded_rls_extended_rows(engine, seeded_tenant_rows):
    """
    Org A: landlord, property, tenancy, invoice, unit_cost linked to existing unit/room/tenant.
    Tenancy is committed before the invoice so invoices.tenancy_id FK sees a real row.
    Teardown is handled by seeded_tenant_rows (child-first deletes for org_a).
    """
    ids = dict(seeded_tenant_rows)
    org_a = ids["org_a"]
    tag = uuid.uuid4().hex[:8]
    ids["landlord_a"] = f"rls-ll-{tag}"
    ids["property_a"] = f"rls-pr-{tag}"
    ids["tenancy_a"] = f"rls-tn-{tag}"
    ids["unit_cost_a"] = f"rls-uc-{tag}"

    with Session(engine) as session:
        apply_pg_organization_context(session, org_a)
        session.add(
            Landlord(
                id=ids["landlord_a"],
                organization_id=org_a,
                contact_name="RLS LL",
                email=f"ll-{tag}@example.test",
            )
        )
        session.add(
            Property(
                id=ids["property_a"],
                organization_id=org_a,
                title="RLS Property",
            )
        )
        session.commit()

    with Session(engine) as session:
        apply_pg_organization_context(session, org_a)
        session.add(
            Tenancy(
                id=ids["tenancy_a"],
                organization_id=org_a,
                tenant_id=ids["tenant_a"],
                room_id=ids["room_a"],
                unit_id=ids["unit_a"],
                move_in_date=date(2024, 1, 1),
                status=TenancyStatus.active,
            )
        )
        session.commit()

    with Session(engine) as session:
        apply_pg_organization_context(session, org_a)
        session.add(
            UnitCost(
                id=ids["unit_cost_a"],
                unit_id=ids["unit_a"],
                cost_type="rent",
                amount_chf=250.0,
            )
        )
        inv = Invoice(
            organization_id=org_a,
            tenant_id=ids["tenant_a"],
            tenancy_id=ids["tenancy_a"],
            amount=99.0,
            issue_date=date(2024, 6, 1),
            due_date=date(2024, 6, 15),
        )
        session.add(inv)
        session.commit()
        session.refresh(inv)
        ids["invoice_id"] = inv.id

    yield ids


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
        # Teardown: 1 tenant (none) → 2 room (none) → 3 unit → 4 organization.
        with Session(engine) as session:
            apply_pg_organization_context(session, org_x)
            session.execute(text("DELETE FROM unit WHERE id = :id"), {"id": uid})
            session.commit()
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
    Mirrors production: after auth sets ContextVar, db.database.get_session() (used by
    get_db_session) must apply SET LOCAL via apply_pg_organization_context.
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


def test_rls_org_a_sees_own_tenancy_invoice_property_landlord_unit_cost(
    engine, seeded_rls_extended_rows
):
    """Migration 025: same organization context can read all seeded extended rows."""
    ids = seeded_rls_extended_rows
    org_a = ids["org_a"]
    with Session(engine) as session:
        apply_pg_organization_context(session, org_a)
        assert (
            len(
                session.exec(select(Tenancy).where(Tenancy.id == ids["tenancy_a"])).all()
            )
            == 1
        )
        assert (
            len(
                session.exec(
                    select(Invoice).where(Invoice.id == ids["invoice_id"])
                ).all()
            )
            == 1
        )
        assert (
            len(
                session.exec(
                    select(Property).where(Property.id == ids["property_a"])
                ).all()
            )
            == 1
        )
        assert (
            len(
                session.exec(
                    select(Landlord).where(Landlord.id == ids["landlord_a"])
                ).all()
            )
            == 1
        )
        assert (
            len(
                session.exec(
                    select(UnitCost).where(UnitCost.id == ids["unit_cost_a"])
                ).all()
            )
            == 1
        )


def test_rls_org_b_sees_no_extended_rows(engine, seeded_rls_extended_rows):
    """Org B must not see org A rows on any migration 025 table."""
    ids = seeded_rls_extended_rows
    org_b = ids["org_b"]
    with Session(engine) as session:
        apply_pg_organization_context(session, org_b)
        assert (
            len(
                session.exec(select(Tenancy).where(Tenancy.id == ids["tenancy_a"])).all()
            )
            == 0
        )
        assert (
            len(
                session.exec(
                    select(Invoice).where(Invoice.id == ids["invoice_id"])
                ).all()
            )
            == 0
        )
        assert (
            len(
                session.exec(
                    select(Property).where(Property.id == ids["property_a"])
                ).all()
            )
            == 0
        )
        assert (
            len(
                session.exec(
                    select(Landlord).where(Landlord.id == ids["landlord_a"])
                ).all()
            )
            == 0
        )
        assert (
            len(
                session.exec(
                    select(UnitCost).where(UnitCost.id == ids["unit_cost_a"])
                ).all()
            )
            == 0
        )


def test_rls_missing_context_sees_no_extended_rows(engine, seeded_rls_extended_rows):
    """No SET LOCAL org id => RLS denies all extended rows."""
    ids = seeded_rls_extended_rows
    with Session(engine) as session:
        assert (
            len(
                session.exec(select(Tenancy).where(Tenancy.id == ids["tenancy_a"])).all()
            )
            == 0
        )
        assert (
            len(
                session.exec(
                    select(Invoice).where(Invoice.id == ids["invoice_id"])
                ).all()
            )
            == 0
        )
        assert (
            len(
                session.exec(
                    select(Property).where(Property.id == ids["property_a"])
                ).all()
            )
            == 0
        )
        assert (
            len(
                session.exec(
                    select(Landlord).where(Landlord.id == ids["landlord_a"])
                ).all()
            )
            == 0
        )
        assert (
            len(
                session.exec(
                    select(UnitCost).where(UnitCost.id == ids["unit_cost_a"])
                ).all()
            )
            == 0
        )
