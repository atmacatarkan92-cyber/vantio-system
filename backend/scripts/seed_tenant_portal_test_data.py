"""
Seed minimum DB records so the existing tenant test account can be fully linked for Tenant Portal Phase 1.

Creates only: 1 unit (if none), 1 room (if none), 1 tenant record for tenant-test@feelathomenow-test.com.
Optionally reassigns one existing tenancy from an orphan tenant to this tenant (no new tenancy).

Run from backend directory:
  python -m scripts.seed_tenant_portal_test_data

No schema changes; no auth/portal code; does not modify or delete meaningful existing data.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlmodel import select

from db.database import engine, get_session
from db.models import Unit, Room, Tenant, Tenancy, Invoice

TEST_USER_ID = "4ead0991-7730-44bd-81da-be609fe2d1bc"
TEST_EMAIL = "tenant-test@feelathomenow-test.com"
TEST_FULL_NAME = "Tenant Test Account"


def main():
    if engine is None:
        print("PostgreSQL is not configured.")
        sys.exit(1)

    session = get_session()
    created = []
    try:
        # 1. One unit if none exists
        unit = session.exec(select(Unit).limit(1)).first()
        if not unit:
            unit = Unit(
                title="Test unit (tenant portal)",
                address="Test 1",
                city="Zurich",
                rooms=1,
            )
            session.add(unit)
            session.flush()
            created.append(f"Unit({unit.id})")

        # 2. One room for that unit if none exists
        room = session.exec(select(Room).where(Room.unit_id == unit.id).limit(1)).first()
        if not room:
            room = session.exec(select(Room).limit(1)).first()
        if not room:
            room = Room(
                unit_id=unit.id,
                name="Test room",
                price=0,
                is_active=True,
            )
            session.add(room)
            session.flush()
            created.append(f"Room({room.id})")

        # 3. Tenant for test user if missing
        tenant = session.exec(select(Tenant).where(Tenant.user_id == TEST_USER_ID)).first()
        if not tenant:
            tenant = Tenant(
                user_id=TEST_USER_ID,
                name=TEST_FULL_NAME,
                email=TEST_EMAIL,
                room_id=room.id,
            )
            session.add(tenant)
            session.flush()
            created.append(f"Tenant({tenant.id})")

        session.commit()
        session.refresh(tenant)

        # 4. Optionally link one existing tenancy from an orphan tenant (reassign, no new tenancy)
        tenancy_linked = False
        orphan_tenant_ids = [t.id for t in session.exec(select(Tenant).where(Tenant.user_id.is_(None))).all()]
        orphan_tenancy = None
        if orphan_tenant_ids:
            orphan_tenancy = session.exec(
                select(Tenancy).where(Tenancy.tenant_id.in_([str(x) for x in orphan_tenant_ids])).limit(1)
            ).first()
        if orphan_tenancy:
            orphan_tenancy.tenant_id = tenant.id
            session.add(orphan_tenancy)
            session.commit()
            tenancy_linked = True

        # 5. Invoices reachable
        invoices = session.exec(select(Invoice).where(Invoice.tenant_id == tenant.id)).all()
        invoices_count = len(invoices)

        # Report
        print("--- Tenant portal test data ---")
        print("Minimum records created:", created if created else "(none; all already existed)")
        print("Tenant id:", tenant.id)
        print("tenant.user_id linked:", tenant.user_id == TEST_USER_ID)
        print("Tenancy linked:", tenancy_linked)
        print("Invoices reachable for this tenant:", invoices_count)
    except Exception as e:
        session.rollback()
        print(f"Error: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
