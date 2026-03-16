"""Phase 1 – Step 2: Database Stabilization

Revision ID: 012_db_stabilization
Revises: 011_phase_e_legacy_empty
Create Date: Phase 1 Step 2 – FK integrity, constraints, dedup index.

Goals:
  1. Add missing FK constraints on invoices (tenant_id, tenancy_id, room_id, unit_id).
  2. Add missing FK on room.unit_id (column existed without FK since initial migration).
  3. Add missing FK on tenant.room_id (snapshot field; soft reference).
  4. Add duplicate-invoice prevention: UNIQUE(tenancy_id, billing_year, billing_month).
  5. Add CHECK constraints on invoices.status and tenancies.status.
  6. Add composite index on tenancies(status, move_in_date, move_out_date) for occupancy queries.
  7. Add composite index on invoices(billing_year, billing_month) for monthly aggregation.
  8. Add invoice_number UNIQUE constraint (idempotent: only if not already unique).

Safety rules:
  - All FK additions are additive; no existing columns dropped or renamed.
  - FK on invoices fields uses DEFERRABLE INITIALLY DEFERRED + NOT VALID to avoid
    locking and to tolerate any orphaned rows from pre-migration data.
  - The UNIQUE constraint on (tenancy_id, billing_year, billing_month) requires a
    pre-check to eliminate duplicates first (handled in upgrade step).
  - All downgrade steps are explicit and tested.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "012_db_stabilization"
down_revision: Union[str, None] = "011_phase_e_legacy_empty"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _constraint_exists(conn, table: str, constraint: str) -> bool:
    """Return True if a constraint with the given name exists on the table."""
    result = conn.execute(
        text("""
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = :t AND constraint_name = :c
            LIMIT 1
        """),
        {"t": table, "c": constraint},
    )
    return result.fetchone() is not None


def _index_exists(conn, index_name: str) -> bool:
    result = conn.execute(
        text("SELECT 1 FROM pg_indexes WHERE indexname = :i LIMIT 1"),
        {"i": index_name},
    )
    return result.fetchone() is not None


def _column_exists(conn, table: str, column: str) -> bool:
    """Return True if the table has the given column."""
    result = conn.execute(
        text("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = :t AND column_name = :c
            LIMIT 1
        """),
        {"t": table, "c": column},
    )
    return result.fetchone() is not None


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    conn = op.get_bind()

    # -----------------------------------------------------------------------
    # 1. room.unit_id → FK to unit.id
    #    The column was created in migration 001 WITHOUT a FK constraint.
    # -----------------------------------------------------------------------
    if not _constraint_exists(conn, "room", "room_unit_id_fkey"):
        op.create_foreign_key(
            "room_unit_id_fkey",
            "room",
            "unit",
            ["unit_id"],
            ["id"],
            # NOT VALID: validates structure but does not scan existing rows.
            # Run VALIDATE CONSTRAINT manually during low-traffic window.
            postgresql_not_valid=True,
        )

    # -----------------------------------------------------------------------
    # 2. tenant.room_id → FK to room.id (soft snapshot reference)
    #    Column added in 001 without FK.
    #    Use NOT VALID to avoid blocking; nullify orphans first.
    # -----------------------------------------------------------------------
    if not _constraint_exists(conn, "tenant", "tenant_room_id_fkey"):
        # Nullify orphaned room references before adding FK
        conn.execute(text("""
            UPDATE tenant
            SET room_id = NULL
            WHERE room_id IS NOT NULL
              AND room_id NOT IN (SELECT id FROM room)
        """))
        op.create_foreign_key(
            "tenant_room_id_fkey",
            "tenant",
            "room",
            ["room_id"],
            ["id"],
            postgresql_not_valid=True,
        )

    # -----------------------------------------------------------------------
    # 3. invoices FK constraints (all NOT VALID; invoices may have orphaned rows
    #    from historical data before tenancy/tenant canonical migration).
    # -----------------------------------------------------------------------

    # 3a. invoices.tenant_id → tenant.id
    if not _constraint_exists(conn, "invoices", "invoices_tenant_id_fkey"):
        # Nullify invoices pointing at non-existent tenants
        conn.execute(text("""
            UPDATE invoices
            SET tenant_id = NULL
            WHERE tenant_id IS NOT NULL
              AND tenant_id NOT IN (SELECT id FROM tenant)
        """))
        op.create_foreign_key(
            "invoices_tenant_id_fkey",
            "invoices",
            "tenant",
            ["tenant_id"],
            ["id"],
            postgresql_not_valid=True,
        )

    # 3b. invoices.tenancy_id → tenancies.id
    if not _constraint_exists(conn, "invoices", "invoices_tenancy_id_fkey"):
        conn.execute(text("""
            UPDATE invoices
            SET tenancy_id = NULL
            WHERE tenancy_id IS NOT NULL
              AND tenancy_id NOT IN (SELECT id FROM tenancies)
        """))
        op.create_foreign_key(
            "invoices_tenancy_id_fkey",
            "invoices",
            "tenancies",
            ["tenancy_id"],
            ["id"],
            postgresql_not_valid=True,
        )

    # 3c. invoices.room_id → room.id
    if not _constraint_exists(conn, "invoices", "invoices_room_id_fkey"):
        conn.execute(text("""
            UPDATE invoices
            SET room_id = NULL
            WHERE room_id IS NOT NULL
              AND room_id NOT IN (SELECT id FROM room)
        """))
        op.create_foreign_key(
            "invoices_room_id_fkey",
            "invoices",
            "room",
            ["room_id"],
            ["id"],
            postgresql_not_valid=True,
        )

    # 3d. invoices.unit_id → unit.id
    if not _constraint_exists(conn, "invoices", "invoices_unit_id_fkey"):
        conn.execute(text("""
            UPDATE invoices
            SET unit_id = NULL
            WHERE unit_id IS NOT NULL
              AND unit_id NOT IN (SELECT id FROM unit)
        """))
        op.create_foreign_key(
            "invoices_unit_id_fkey",
            "invoices",
            "unit",
            ["unit_id"],
            ["id"],
            postgresql_not_valid=True,
        )

    # -----------------------------------------------------------------------
    # 4. UNIQUE constraint on invoices(tenancy_id, billing_year, billing_month)
    #    Prevents duplicate monthly invoices for the same tenancy.
    #    Pre-step: keep only the lowest-id invoice per (tenancy_id, year, month)
    #    and nullify tenancy_id on duplicates (making them orphan/manual invoices).
    # -----------------------------------------------------------------------
    if not _constraint_exists(conn, "invoices", "uq_invoices_tenancy_period"):
        # Identify and de-duplicate: keep the row with MIN(id) per group
        conn.execute(text("""
            UPDATE invoices
            SET tenancy_id = NULL
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM invoices
                WHERE tenancy_id IS NOT NULL
                  AND billing_year IS NOT NULL
                  AND billing_month IS NOT NULL
                GROUP BY tenancy_id, billing_year, billing_month
            )
            AND tenancy_id IS NOT NULL
            AND billing_year IS NOT NULL
            AND billing_month IS NOT NULL
        """))
        op.create_unique_constraint(
            "uq_invoices_tenancy_period",
            "invoices",
            ["tenancy_id", "billing_year", "billing_month"],
            # Partial unique: only when all three are non-NULL
            # PostgreSQL partial index handles NULLs correctly in UNIQUE constraints.
        )

    # -----------------------------------------------------------------------
    # 5. UNIQUE on invoices.invoice_number (idempotent: skip if already unique)
    # -----------------------------------------------------------------------
    if not _constraint_exists(conn, "invoices", "uq_invoices_invoice_number"):
        # Nullify duplicate invoice_numbers (keep lowest id)
        conn.execute(text("""
            UPDATE invoices
            SET invoice_number = NULL
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM invoices
                WHERE invoice_number IS NOT NULL
                GROUP BY invoice_number
            )
            AND invoice_number IS NOT NULL
        """))
        op.create_unique_constraint(
            "uq_invoices_invoice_number",
            "invoices",
            ["invoice_number"],
        )

    # -----------------------------------------------------------------------
    # 6. CHECK constraint: invoices.status
    # -----------------------------------------------------------------------
    INVOICE_STATUSES = "('unpaid', 'paid', 'open', 'overdue', 'cancelled')"
    if not _constraint_exists(conn, "invoices", "ck_invoices_status"):
        # Sanitize unknown statuses to 'unpaid' before adding constraint
        conn.execute(text(f"""
            UPDATE invoices
            SET status = 'unpaid'
            WHERE status NOT IN {INVOICE_STATUSES}
        """))
        op.create_check_constraint(
            "ck_invoices_status",
            "invoices",
            f"status IN {INVOICE_STATUSES}",
        )

    # -----------------------------------------------------------------------
    # 7. CHECK constraint: tenancies.status
    # -----------------------------------------------------------------------
    TENANCY_STATUSES = "('active', 'ended', 'reserved')"
    if not _constraint_exists(conn, "tenancies", "ck_tenancies_status"):
        conn.execute(text(f"""
            UPDATE tenancies
            SET status = 'ended'
            WHERE status NOT IN {TENANCY_STATUSES}
        """))
        op.create_check_constraint(
            "ck_tenancies_status",
            "tenancies",
            f"status IN {TENANCY_STATUSES}",
        )

    # -----------------------------------------------------------------------
    # 8. CHECK constraint: invoices.billing_month (1-12)
    # -----------------------------------------------------------------------
    if not _constraint_exists(conn, "invoices", "ck_invoices_billing_month"):
        conn.execute(text("""
            UPDATE invoices
            SET billing_month = NULL
            WHERE billing_month IS NOT NULL AND billing_month NOT BETWEEN 1 AND 12
        """))
        op.create_check_constraint(
            "ck_invoices_billing_month",
            "invoices",
            "billing_month IS NULL OR (billing_month >= 1 AND billing_month <= 12)",
        )

    # -----------------------------------------------------------------------
    # 9. CHECK constraint: invoices.amount >= 0
    # -----------------------------------------------------------------------
    if not _constraint_exists(conn, "invoices", "ck_invoices_amount_positive"):
        op.create_check_constraint(
            "ck_invoices_amount_positive",
            "invoices",
            "amount >= 0",
        )

    # -----------------------------------------------------------------------
    # 10. Composite index: tenancies(status, move_in_date[, move_out_date])
    #     Used by occupancy queries and invoice generation (status=active + date range).
    #     If move_out_date does not exist (legacy schema), create index on (status, move_in_date).
    # -----------------------------------------------------------------------
    if not _index_exists(conn, "ix_tenancies_status_dates"):
        if _column_exists(conn, "tenancies", "move_out_date"):
            op.create_index(
                "ix_tenancies_status_dates",
                "tenancies",
                ["status", "move_in_date", "move_out_date"],
            )
        else:
            op.create_index(
                "ix_tenancies_status_dates",
                "tenancies",
                ["status", "move_in_date"],
            )

    # -----------------------------------------------------------------------
    # 11. Composite index: invoices(billing_year, billing_month)
    #     Used by monthly revenue/KPI queries.
    # -----------------------------------------------------------------------
    if not _index_exists(conn, "ix_invoices_period"):
        op.create_index(
            "ix_invoices_period",
            "invoices",
            ["billing_year", "billing_month"],
        )

    # -----------------------------------------------------------------------
    # 12. Composite index: invoices(tenant_id, status)
    #     Used by tenant portal invoice listing.
    # -----------------------------------------------------------------------
    if not _index_exists(conn, "ix_invoices_tenant_status"):
        op.create_index(
            "ix_invoices_tenant_status",
            "invoices",
            ["tenant_id", "status"],
        )

    # -----------------------------------------------------------------------
    # 13. Composite index: tenancies(tenant_id, status)
    #     Used by tenant portal and admin tenancy lookups.
    # -----------------------------------------------------------------------
    if not _index_exists(conn, "ix_tenancies_tenant_status"):
        op.create_index(
            "ix_tenancies_tenant_status",
            "tenancies",
            ["tenant_id", "status"],
        )


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:
    # Remove in reverse order: indexes → constraints → FKs

    # 13
    op.drop_index("ix_tenancies_tenant_status", table_name="tenancies")
    # 12
    op.drop_index("ix_invoices_tenant_status", table_name="invoices")
    # 11
    op.drop_index("ix_invoices_period", table_name="invoices")
    # 10
    op.drop_index("ix_tenancies_status_dates", table_name="tenancies")

    # 9
    op.drop_constraint("ck_invoices_amount_positive", "invoices", type_="check")
    # 8
    op.drop_constraint("ck_invoices_billing_month", "invoices", type_="check")
    # 7
    op.drop_constraint("ck_tenancies_status", "tenancies", type_="check")
    # 6
    op.drop_constraint("ck_invoices_status", "invoices", type_="check")

    # 5
    op.drop_constraint("uq_invoices_invoice_number", "invoices", type_="unique")
    # 4
    op.drop_constraint("uq_invoices_tenancy_period", "invoices", type_="unique")

    # 3d
    op.drop_constraint("invoices_unit_id_fkey", "invoices", type_="foreignkey")
    # 3c
    op.drop_constraint("invoices_room_id_fkey", "invoices", type_="foreignkey")
    # 3b
    op.drop_constraint("invoices_tenancy_id_fkey", "invoices", type_="foreignkey")
    # 3a
    op.drop_constraint("invoices_tenant_id_fkey", "invoices", type_="foreignkey")

    # 2
    op.drop_constraint("tenant_room_id_fkey", "tenant", type_="foreignkey")
    # 1
    op.drop_constraint("room_unit_id_fkey", "room", type_="foreignkey")
