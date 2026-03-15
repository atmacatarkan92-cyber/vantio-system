"""
Seed minimum tenancy + invoice so /tenant/tenancies and /tenant/invoices are testable.

Uses existing tenant test account (tenant id 1649a8a8-2569-471b-8fef-a255eeb584a9).
- Prefers linking one existing tenancy (tenant_id IS NULL) to this tenant.
- Creates a new tenancy only if schema is compatible (e.g. tenancies.room_id accepts UUID).
- Creates one invoice for this tenant only when tenancy linkage is valid and no invoice exists.

Run from backend directory:
  python -m scripts.seed_tenant_portal_tenancy_invoice

No schema changes; no overwrite of existing tenants; only links unassigned tenancies or adds new rows when safe.
"""
import sys
from pathlib import Path
from datetime import date, timedelta, datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlmodel import select
from sqlalchemy import text

from db.database import engine, get_session
from db.models import Tenant, Invoice, Room

TEST_TENANT_ID = "1649a8a8-2569-471b-8fef-a255eeb584a9"


def main():
    if engine is None:
        print("PostgreSQL is not configured.")
        sys.exit(1)

    session = get_session()
    try:
        tenant = session.get(Tenant, TEST_TENANT_ID)
        if not tenant:
            print(f"Tenant {TEST_TENANT_ID} not found. Run seed_tenant_portal_test_data first.")
            return

        tenancy = None
        tenancy_created = False
        tenancy_linked_existing = False

        # 1. Prefer: link one existing tenancy that has no tenant assigned (tenant_id IS NULL)
        #    Use raw SQL to avoid ORM column mismatch with live tenancies table.
        tenancy_id_linked = None
        try:
            r = session.execute(text("SELECT id FROM tenancies WHERE tenant_id IS NULL LIMIT 1"))
            row = r.fetchone()
            if row:
                tid = row[0]
                session.execute(
                    text("UPDATE tenancies SET tenant_id = :canonical_id WHERE id = :id"),
                    {"canonical_id": str(tenant.id), "id": tid},
                )
                session.commit()
                tenancy_id_linked = tid
                tenancy_linked_existing = True
        except Exception as e:
            session.rollback()
            print(f"Failed to link existing tenancy: {e}")
            tenancy_id_linked = None

        if tenancy_id_linked is not None:
            class _TenancyRow:
                pass
            tenancy = _TenancyRow()
            tenancy.id = tenancy_id_linked
        else:
            tenancy = None

        # 3. Only if still no tenancy: consider creating one (only when schema is compatible)
        if not tenancy:
            # Check if tenancies.room_id accepts UUID (varchar); if integer, do not attempt insert
            try:
                r = session.execute(
                    text("SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenancies' AND column_name = 'room_id'")
                )
                row = r.fetchone()
                room_id_type = (row[0] or "").lower() if row else ""
            except Exception as e:
                print(f"Cannot check tenancies.room_id type: {e}. Skipping tenancy creation.")
                room_id_type = "unknown"
            if room_id_type in ("integer", "bigint", "smallint"):
                print("Tenancy creation not attempted: tenancies.room_id is integer in this DB; cannot supply UUID.")
                print("Link an existing tenancy (with tenant_id NULL) instead. Re-run after ensuring such a tenancy exists.")
                return
            room = session.get(Room, tenant.room_id) if tenant.room_id else None
            if not room:
                print("Tenant has no room_id; cannot create tenancy.")
                return
            move_in = date.today() - timedelta(days=30)
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            try:
                r = session.execute(
                    text("""
                        INSERT INTO tenancies (tenant_id, room_id, unit_id, move_in_date, monthly_rent, status, created_at)
                        VALUES (:tenant_id, :room_id, :unit_id, :move_in_date, :monthly_rent, :status, :created_at)
                        RETURNING id
                    """),
                    {
                        "tenant_id": str(tenant.id),
                        "room_id": str(room.id),
                        "unit_id": str(room.unit_id) if getattr(room, "unit_id", None) else None,
                        "move_in_date": move_in,
                        "monthly_rent": 0,
                        "status": "active",
                        "created_at": now,
                    },
                )
                row = r.fetchone()
                session.commit()
                tenancy_id_new = row[0] if row else None
                if tenancy_id_new is not None:
                    class _Row:
                        pass
                    tenancy = _Row()
                    tenancy.id = tenancy_id_new
                    tenancy_created = True
                else:
                    tenancy = None
            except Exception as e:
                session.rollback()
                print(f"Tenancy creation failed: {e}")
                return

        if not tenancy:
            print("No tenancy linked or created. Cannot create invoice.")
            return

        tenancy_id = tenancy.id  # may be int (bigint) or str
        tenancy_id_str = str(tenancy_id)

        # 4. Invoice: only when we have a valid linked tenancy
        existing_invoices = list(session.exec(select(Invoice).where(Invoice.tenant_id == str(tenant.id))).all())
        invoice = None
        invoice_created = False
        invoice_existing = False

        if existing_invoices:
            invoice = existing_invoices[0]
            invoice_existing = True
        else:
            today = date.today()
            try:
                invoice = Invoice(
                    invoice_number="TENANT-PORTAL-TEST-001",
                    tenant_id=str(tenant.id),
                    tenancy_id=tenancy_id_str,
                    room_id=None,
                    unit_id=None,
                    billing_year=today.year,
                    billing_month=today.month,
                    amount=0,
                    currency="CHF",
                    status="unpaid",
                    issue_date=today,
                    due_date=today + timedelta(days=14),
                )
                session.add(invoice)
                session.commit()
                session.refresh(invoice)
                invoice_created = True
            except Exception as e:
                session.rollback()
                print(f"Invoice creation failed: {e}")
                return

        invoice_id = invoice.id if invoice else None

        # Report
        print("--- Tenant portal tenancy & invoice ---")
        if tenancy_linked_existing:
            print("Tenancy: existing linked (tenant_id set to canonical tenant)")
        elif tenancy_created:
            print("Tenancy: new created")
        else:
            print("Tenancy: (existing)")
        print("Tenancy id:", tenancy_id)
        if invoice_existing:
            print("Invoice: existing reachable")
        elif invoice_created:
            print("Invoice: new created")
        else:
            print("Invoice: (none)")
        print("Invoice id:", invoice_id)
    except Exception as e:
        session.rollback()
        print(f"Error: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
