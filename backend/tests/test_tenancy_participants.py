"""
Tenancy participants (Phase 1): DB invariants and admin create/patch behavior.

Requires DATABASE_URL and schema including migration 059_tenancy_participants for DB-backed tests.
"""

from __future__ import annotations

import uuid
from datetime import date
from unittest.mock import MagicMock

import pytest
from sqlalchemy import text
from sqlmodel import Session, select

from app.api.v1.routes_admin_tenancies import (
    TenancyCreate,
    TenancyParticipantInput,
    TenancyPatch,
    admin_create_tenancy,
    admin_patch_tenancy,
)
from db.models import (
    Organization,
    Room,
    Tenancy,
    TenancyParticipant,
    Tenant,
    Unit,
    User,
    UserRole,
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


def test_tenancy_create_accepts_participants_payload():
    b = TenancyCreate(
        tenant_id="tenant-1",
        room_id="room-1",
        unit_id="unit-1",
        move_in_date=date(2024, 1, 1),
        monthly_rent=0,
        deposit_amount=None,
        status="active",
        participants=[
            TenancyParticipantInput(tenant_id="tenant-1", role="primary_tenant"),
            TenancyParticipantInput(tenant_id="tenant-2", role="co_tenant"),
        ],
    )
    assert len(b.participants) == 2
    assert b.participants[0].role == "primary_tenant"


def test_migration_backfill_each_tenancy_has_primary_matching_tenant_id(engine):
    """
    After 059, every tenancy row should have a primary_tenant participant with the same tenant_id.
    Fails if backfill was not applied or data diverged.
    """
    with Session(engine) as session:
        missing = session.execute(
            text(
                """
                SELECT COUNT(*) FROM tenancies t
                WHERE NOT EXISTS (
                    SELECT 1 FROM tenancy_participants tp
                    WHERE tp.tenancy_id = t.id
                      AND tp.tenant_id = t.tenant_id
                      AND tp.role = 'primary_tenant'
                )
                """
            )
        ).scalar()
    assert missing == 0, (
        "expected each tenancy to have a primary_tenant participant matching tenant_id "
        "(migration 059 backfill)"
    )


def test_admin_create_and_patch_participants_sync_tenant_id(engine):
    """Create without explicit participants still inserts primary row; patch can swap primary."""
    s = uuid.uuid4().hex[:12]
    org = f"tp-org-{s}"
    ua = f"tp-ua-{s}"
    ub = f"tp-ub-{s}"
    ra = f"tp-ra-{s}"
    rb = f"tp-rb-{s}"
    ta = f"tp-ta-{s}"
    tb = f"tp-tb-{s}"
    uid = f"tp-user-{s}"

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        session.add(Organization(id=org, name="TP org"))
        session.add(
            Unit(
                id=ua,
                organization_id=org,
                title="TP U A",
                address="1 St",
                city="Zurich",
                rooms=2,
            )
        )
        session.add(
            Unit(
                id=ub,
                organization_id=org,
                title="TP U B",
                address="2 St",
                city="Zurich",
                rooms=2,
            )
        )
        session.add(
            User(
                id=uid,
                organization_id=org,
                email=f"{uid}@test.example",
                full_name="TP Admin",
                role=UserRole.admin,
                is_active=True,
            )
        )
        session.commit()

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        session.add(
            Room(id=ra, unit_id=ua, name="R A", price=100, is_active=True)
        )
        session.add(
            Room(id=rb, unit_id=ub, name="R B", price=100, is_active=True)
        )
        session.add(
            Tenant(
                id=ta,
                organization_id=org,
                name="T A",
                email=f"{ta}@example.test",
            )
        )
        session.add(
            Tenant(
                id=tb,
                organization_id=org,
                name="T B",
                email=f"{tb}@example.test",
            )
        )
        session.commit()

    user = User(
        id=uid,
        organization_id=org,
        email=f"{uid}@test.example",
        full_name="TP Admin",
        role=UserRole.admin,
        is_active=True,
    )
    req = MagicMock()

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        body = TenancyCreate(
            tenant_id=ta,
            room_id=ra,
            unit_id=ua,
            move_in_date=date(2031, 1, 1),
            monthly_rent=100.0,
            deposit_amount=None,
            status="active",
        )
        out = admin_create_tenancy(
            request=req,
            body=body,
            org_id=org,
            current_user=user,
            session=session,
        )
        assert out["tenant_id"] == ta
        assert len(out["participants"]) == 1
        assert out["participants"][0]["role"] == "primary_tenant"
        assert out["participants"][0]["tenant_id"] == ta
        tid_one = out["id"]

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        body2 = TenancyCreate(
            tenant_id=ta,
            room_id=rb,
            unit_id=ub,
            move_in_date=date(2031, 1, 1),
            monthly_rent=100.0,
            deposit_amount=None,
            status="active",
            participants=[
                TenancyParticipantInput(tenant_id=ta, role="primary_tenant"),
                TenancyParticipantInput(tenant_id=tb, role="co_tenant"),
            ],
        )
        out2 = admin_create_tenancy(
            request=req,
            body=body2,
            org_id=org,
            current_user=user,
            session=session,
        )
        assert out2["tenant_id"] == ta
        pids = {p["tenant_id"] for p in out2["participants"]}
        assert pids == {ta, tb}
        roles = {p["tenant_id"]: p["role"] for p in out2["participants"]}
        assert roles[ta] == "primary_tenant" and roles[tb] == "co_tenant"
        tid_two = out2["id"]

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        admin_patch_tenancy(
            request=req,
            tenancy_id=tid_two,
            body=TenancyPatch(
                participants=[
                    TenancyParticipantInput(tenant_id=tb, role="primary_tenant"),
                    TenancyParticipantInput(tenant_id=ta, role="co_tenant"),
                ]
            ),
            org_id=org,
            current_user=user,
            session=session,
        )
        t2 = session.get(Tenancy, tid_two)
        assert str(t2.tenant_id) == tb
        rows = session.exec(
            select(TenancyParticipant).where(TenancyParticipant.tenancy_id == tid_two)
        ).all()
        assert len(rows) == 2
        prim = [r for r in rows if r.role == "primary_tenant"]
        assert len(prim) == 1 and str(prim[0].tenant_id) == tb

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        session.execute(text("DELETE FROM audit_logs WHERE organization_id = :oid"), {"oid": org})
        session.execute(text("DELETE FROM tenancies WHERE organization_id = :oid"), {"oid": org})
        session.execute(text("DELETE FROM tenant WHERE id IN (:a, :b)"), {"a": ta, "b": tb})
        session.execute(text("DELETE FROM room WHERE id IN (:a, :b)"), {"a": ra, "b": rb})
        session.execute(text("DELETE FROM unit WHERE id IN (:a, :b)"), {"a": ua, "b": ub})
        session.execute(text("DELETE FROM users WHERE id = :u"), {"u": uid})
        session.execute(text("DELETE FROM organization WHERE id = :o"), {"o": org})
        session.commit()
