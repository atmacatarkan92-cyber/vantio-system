"""
PostgreSQL EXCLUDE constraint on tenancies (migration 026): no overlapping occupancy per unit.

Requires DATABASE_URL and migrated schema including 026_tenancies_no_overlap.
"""
from __future__ import annotations

import re
import uuid

import pytest
from datetime import date

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from db.models import Organization, Room, Tenancy, TenancyStatus, Tenant, Unit
from db.rls import apply_pg_organization_context


def _require_engine():
    from db import database as db_mod

    if db_mod.engine is None:
        pytest.skip("DATABASE_URL not configured")
    return db_mod.engine


def _norm_constraint_def(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _assert_exclusion_constraint_semantics(defn: str, move_out_col_sql: str) -> None:
    """Semantic validation of migration 026 EXCLUDE (tolerates pg_get_constraintdef formatting drift)."""
    n = _norm_constraint_def(defn)
    n_lower = n.lower()
    assert "exclude using gist" in n_lower
    assert "unit_id with =" in n_lower
    assert "daterange(" in n_lower
    assert "move_in_date" in n_lower
    assert "coalesce" in n_lower
    assert "infinity" in n_lower
    assert "&&" in n
    if move_out_col_sql == '"move_out_date date"':
        assert '"move_out_date date"' in defn
    else:
        assert "move_out_date" in n_lower


def _resolve_move_out_column_sql(session) -> str:
    if session.execute(
        text(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'tenancies'
              AND column_name = 'move_out_date'
            """
        )
    ).scalar():
        return "move_out_date"
    if session.execute(
        text(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'tenancies'
              AND column_name = 'move_out_date date'
            """
        )
    ).scalar():
        return '"move_out_date date"'
    pytest.fail(
        "tenancies has neither move_out_date nor legacy 'move_out_date date' column; "
        "migration 026 cannot be validated"
    )


def _require_exclusion_constraint(engine):
    with Session(engine) as session:
        row = session.execute(
            text(
                """
                SELECT pg_get_constraintdef(c.oid), c.contype
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE n.nspname = 'public' AND t.relname = 'tenancies'
                  AND c.conname = 'tenancies_unit_daterange_excl'
                """
            )
        ).one_or_none()
        if row is None:
            pytest.skip(
                "tenancies_unit_daterange_excl not present — apply migration 026_tenancies_no_overlap"
            )
        defn, contype = row[0], row[1]
        assert contype == "x", f"expected EXCLUDE constraint, got contype={contype!r}"
        move_out_sql = _resolve_move_out_column_sql(session)
        _assert_exclusion_constraint_semantics(defn, move_out_sql)


@pytest.fixture
def engine():
    return _require_engine()


@pytest.fixture
def exclusion_seed(engine):
    """One org, two units, rooms, two tenants; teardown child-first."""
    _require_exclusion_constraint(engine)
    s = uuid.uuid4().hex[:12]
    org = f"excl-org-{s}"
    ua = f"excl-ua-{s}"
    ub = f"excl-ub-{s}"
    ra = f"excl-ra-{s}"
    rb = f"excl-rb-{s}"
    ra2 = f"excl-ra2-{s}"
    ta = f"excl-ta-{s}"
    tb = f"excl-tb-{s}"

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        session.add(Organization(id=org, name="Exclusion test org"))
        session.add(
            Unit(
                id=ua,
                organization_id=org,
                title="U A",
                address="1 St",
                city="Zurich",
                rooms=2,
            )
        )
        session.add(
            Unit(
                id=ub,
                organization_id=org,
                title="U B",
                address="2 St",
                city="Zurich",
                rooms=2,
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
            Room(id=ra2, unit_id=ua, name="R A2", price=100, is_active=True)
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

    ids = {
        "org": org,
        "ua": ua,
        "ub": ub,
        "ra": ra,
        "rb": rb,
        "ra2": ra2,
        "ta": ta,
        "tb": tb,
    }
    yield ids

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        session.execute(
            text("DELETE FROM tenancies WHERE organization_id = :oid"), {"oid": org}
        )
        session.execute(text("DELETE FROM tenant WHERE id IN (:a, :b)"), {"a": ta, "b": tb})
        session.execute(
            text("DELETE FROM room WHERE id IN (:a, :b, :c)"),
            {"a": ra, "b": rb, "c": ra2},
        )
        session.execute(text("DELETE FROM unit WHERE id IN (:a, :b)"), {"a": ua, "b": ub})
        session.commit()
    with Session(engine) as session:
        session.execute(text("DELETE FROM organization WHERE id = :id"), {"id": org})
        session.commit()


def test_tenancies_exclusion_rejects_overlap_same_unit(engine, exclusion_seed):
    """Same unit_id: overlapping calendar ranges must fail at commit."""
    ids = exclusion_seed
    org, ua, ra, ra2, ta, tb = (
        ids["org"],
        ids["ua"],
        ids["ra"],
        ids["ra2"],
        ids["ta"],
        ids["tb"],
    )
    t1 = f"excl-tn1-{uuid.uuid4().hex[:10]}"
    t2 = f"excl-tn2-{uuid.uuid4().hex[:10]}"

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        session.add(
            Tenancy(
                id=t1,
                organization_id=org,
                tenant_id=ta,
                room_id=ra,
                unit_id=ua,
                move_in_date=date(2026, 4, 1),
                move_out_date=date(2026, 4, 30),
                status=TenancyStatus.ended,
            )
        )
        session.commit()

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        session.add(
            Tenancy(
                id=t2,
                organization_id=org,
                tenant_id=tb,
                room_id=ra2,
                unit_id=ua,
                move_in_date=date(2026, 4, 15),
                move_out_date=date(2026, 5, 15),
                status=TenancyStatus.ended,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_tenancies_exclusion_allows_back_to_back_same_unit(engine, exclusion_seed):
    """Same unit: move_out Apr 30 then move_in May 1 — allowed (half-open ranges)."""
    ids = exclusion_seed
    org, ua, ra, ra2, ta, tb = (
        ids["org"],
        ids["ua"],
        ids["ra"],
        ids["ra2"],
        ids["ta"],
        ids["tb"],
    )
    t1 = f"excl-b2b1-{uuid.uuid4().hex[:10]}"
    t2 = f"excl-b2b2-{uuid.uuid4().hex[:10]}"

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        session.add(
            Tenancy(
                id=t1,
                organization_id=org,
                tenant_id=ta,
                room_id=ra,
                unit_id=ua,
                move_in_date=date(2026, 4, 1),
                move_out_date=date(2026, 4, 30),
                status=TenancyStatus.ended,
            )
        )
        session.add(
            Tenancy(
                id=t2,
                organization_id=org,
                tenant_id=tb,
                room_id=ra2,
                unit_id=ua,
                move_in_date=date(2026, 5, 1),
                move_out_date=date(2026, 5, 31),
                status=TenancyStatus.ended,
            )
        )
        session.commit()


def test_tenancies_exclusion_allows_overlap_different_units(engine, exclusion_seed):
    """Different unit_id: overlapping calendar ranges are independent."""
    ids = exclusion_seed
    org, ua, ub, ra, rb, ta, tb = (
        ids["org"],
        ids["ua"],
        ids["ub"],
        ids["ra"],
        ids["rb"],
        ids["ta"],
        ids["tb"],
    )
    t1 = f"excl-du1-{uuid.uuid4().hex[:10]}"
    t2 = f"excl-du2-{uuid.uuid4().hex[:10]}"

    with Session(engine) as session:
        apply_pg_organization_context(session, org)
        session.add(
            Tenancy(
                id=t1,
                organization_id=org,
                tenant_id=ta,
                room_id=ra,
                unit_id=ua,
                move_in_date=date(2026, 6, 1),
                move_out_date=date(2026, 6, 30),
                status=TenancyStatus.ended,
            )
        )
        session.add(
            Tenancy(
                id=t2,
                organization_id=org,
                tenant_id=tb,
                room_id=rb,
                unit_id=ub,
                move_in_date=date(2026, 6, 10),
                move_out_date=date(2026, 6, 20),
                status=TenancyStatus.ended,
            )
        )
        session.commit()
