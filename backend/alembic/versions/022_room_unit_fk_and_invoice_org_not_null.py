"""Enforce room.unit_id -> unit (CASCADE) and invoices.organization_id NOT NULL.

Revision ID: 022_room_unit_fk_invoice_org
Revises: 021_invoice_org_backfill
Create Date: 2026-03-20

1) room.unit_id: drop legacy/incorrect FKs on room(unit_id)->unit(id); repair/delete rows;
   add or validate fk_rooms_unit_id ON DELETE CASCADE (idempotent vs pre-existing correct FK).
2) invoices.organization_id: deterministic backfill (same sources as 021), then NOT NULL if needed;
   fail if NULLs remain.
"""

from typing import NamedTuple, Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "022_room_unit_fk_invoice_org"
down_revision: Union[str, None] = "021_invoice_org_backfill"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


class RoomUnitFk(NamedTuple):
    conname: str
    confdeltype: str
    convalidated: bool


def _list_room_unit_id_fks_to_unit(conn) -> list[RoomUnitFk]:
    """Foreign keys on public.room(unit_id) -> public.unit(id) via pg_catalog (no def-string matching)."""
    rows = conn.execute(
        text("""
            WITH room_col AS (
                SELECT ARRAY_AGG(attnum ORDER BY attnum)::smallint[] AS cols
                FROM pg_attribute
                WHERE attrelid = 'public.room'::regclass
                  AND attname = 'unit_id'
                  AND NOT attisdropped
            ),
            unit_col AS (
                SELECT ARRAY_AGG(attnum ORDER BY attnum)::smallint[] AS cols
                FROM pg_attribute
                WHERE attrelid = 'public.unit'::regclass
                  AND attname = 'id'
                  AND NOT attisdropped
            )
            SELECT c.conname, c.confdeltype::text, c.convalidated
            FROM pg_constraint c
            JOIN pg_class rel ON rel.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = rel.relnamespace
            JOIN pg_class ref ON ref.oid = c.confrelid
            JOIN pg_namespace rn ON rn.oid = ref.relnamespace
            CROSS JOIN room_col rc
            CROSS JOIN unit_col uc
            WHERE n.nspname = 'public'
              AND rn.nspname = 'public'
              AND rel.relname = 'room'
              AND ref.relname = 'unit'
              AND c.contype = 'f'
              AND rc.cols IS NOT NULL
              AND uc.cols IS NOT NULL
              AND c.conkey = rc.cols
              AND c.confkey = uc.cols
        """)
    ).fetchall()
    out: list[RoomUnitFk] = []
    for r in rows:
        name, deltype, validated = r[0], (r[1] or "").strip(), bool(r[2])
        out.append(RoomUnitFk(conname=name, confdeltype=deltype, convalidated=validated))
    return out


def _invoices_org_id_is_not_null(conn) -> bool:
    row = conn.execute(
        text("""
            SELECT c.is_nullable
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = 'invoices'
              AND c.column_name = 'organization_id'
        """)
    ).fetchone()
    if row is None:
        return False
    return (row[0] or "").upper() == "NO"


def upgrade() -> None:
    conn = op.get_bind()

    # --- invoices.organization_id: backfill then NOT NULL (021 semantics, fail-closed) ---
    conn.execute(
        text("""
            UPDATE invoices i
            SET organization_id = t.organization_id
            FROM tenancies t
            WHERE i.organization_id IS NULL
              AND i.tenancy_id IS NOT NULL
              AND i.tenancy_id = t.id
              AND t.organization_id IS NOT NULL
        """)
    )
    conn.execute(
        text("""
            UPDATE invoices i
            SET organization_id = u.organization_id
            FROM unit u
            WHERE i.organization_id IS NULL
              AND i.unit_id IS NOT NULL
              AND i.unit_id = u.id
              AND u.organization_id IS NOT NULL
        """)
    )
    conn.execute(
        text("""
            UPDATE invoices i
            SET organization_id = te.organization_id
            FROM tenant te
            WHERE i.organization_id IS NULL
              AND i.tenant_id IS NOT NULL
              AND i.tenant_id = te.id
              AND te.organization_id IS NOT NULL
        """)
    )
    null_invoices = conn.execute(
        text("SELECT COUNT(*) FROM invoices WHERE organization_id IS NULL")
    ).scalar()
    if (null_invoices or 0) > 0:
        sample = conn.execute(
            text(
                "SELECT id FROM invoices WHERE organization_id IS NULL ORDER BY id LIMIT 5"
            )
        ).fetchall()
        ids = [str(r[0]) for r in sample]
        raise RuntimeError(
            "022_integrity: invoices.organization_id is still NULL after deterministic backfill "
            f"(tenancy_id / unit_id / tenant_id). Example invoice ids: {ids}. "
            "Fix source rows or remove invalid invoices; migration will not invent organization_id."
        )

    if not _invoices_org_id_is_not_null(conn):
        op.alter_column(
            "invoices",
            "organization_id",
            existing_type=sa.String(),
            nullable=False,
        )

    # --- room.unit_id: drop legacy/incorrect FKs; repair; validate or create fk_rooms_unit_id CASCADE ---
    fks = _list_room_unit_id_fks_to_unit(conn)
    ideal = next(
        (f for f in fks if f.conname == "fk_rooms_unit_id" and f.confdeltype == "c"),
        None,
    )
    kept_ideal = False
    for fk in fks:
        if ideal is not None and fk.conname == ideal.conname and fk.confdeltype == "c":
            kept_ideal = True
            continue
        op.drop_constraint(fk.conname, "room", type_="foreignkey")

    bad_room_sql = """
        SELECT r.id FROM room r
        WHERE NOT EXISTS (SELECT 1 FROM unit u WHERE u.id = r.unit_id)
    """

    amb_t = conn.execute(
        text(f"""
            SELECT COUNT(*) FROM (
                SELECT t.room_id
                FROM tenancies t
                WHERE t.room_id IS NOT NULL
                  AND t.unit_id IN (SELECT id FROM unit)
                  AND t.room_id IN ({bad_room_sql})
                GROUP BY t.room_id
                HAVING COUNT(DISTINCT t.unit_id) > 1
            ) x
        """)
    ).scalar() or 0
    if amb_t > 0:
        raise RuntimeError(
            "022_integrity: room rows have invalid unit_id and tenancies disagree on unit_id "
            "(multiple distinct unit_ids for the same room_id). Resolve tenancies data before upgrade."
        )

    amb_l = conn.execute(
        text(f"""
            SELECT COUNT(*) FROM (
                SELECT l.room_id
                FROM listings l
                WHERE l.room_id IS NOT NULL
                  AND l.unit_id IN (SELECT id FROM unit)
                  AND l.room_id IN ({bad_room_sql})
                GROUP BY l.room_id
                HAVING COUNT(DISTINCT l.unit_id) > 1
            ) x
        """)
    ).scalar() or 0
    if amb_l > 0:
        raise RuntimeError(
            "022_integrity: room rows have invalid unit_id and listings disagree on unit_id "
            "(multiple distinct unit_ids for the same room_id). Resolve listings data before upgrade."
        )

    conflict = conn.execute(
        text("""
            WITH bad AS (
                SELECT r.id AS room_id FROM room r
                WHERE NOT EXISTS (SELECT 1 FROM unit u WHERE u.id = r.unit_id)
            ),
            ten_u AS (
                SELECT t.room_id AS rid, MIN(t.unit_id) AS u
                FROM tenancies t
                INNER JOIN bad ON bad.room_id = t.room_id
                WHERE t.unit_id IN (SELECT id FROM unit)
                GROUP BY t.room_id
                HAVING COUNT(DISTINCT t.unit_id) = 1
            ),
            list_u AS (
                SELECT l.room_id AS rid, MIN(l.unit_id) AS u
                FROM listings l
                INNER JOIN bad ON bad.room_id = l.room_id
                WHERE l.unit_id IN (SELECT id FROM unit)
                GROUP BY l.room_id
                HAVING COUNT(DISTINCT l.unit_id) = 1
            )
            SELECT COUNT(*) FROM ten_u
            INNER JOIN list_u ON ten_u.rid = list_u.rid
            WHERE ten_u.u <> list_u.u
        """)
    ).scalar() or 0
    if conflict > 0:
        raise RuntimeError(
            "022_integrity: for at least one room with invalid unit_id, tenancies and listings "
            "point to different units. Resolve the conflict before upgrade."
        )

    conn.execute(
        text("""
            UPDATE room r
            SET unit_id = sub.u
            FROM (
                SELECT t.room_id AS rid, MIN(t.unit_id) AS u
                FROM tenancies t
                WHERE t.room_id IS NOT NULL
                  AND t.unit_id IN (SELECT id FROM unit)
                GROUP BY t.room_id
                HAVING COUNT(DISTINCT t.unit_id) = 1
            ) sub
            WHERE r.id = sub.rid
              AND NOT EXISTS (SELECT 1 FROM unit u WHERE u.id = r.unit_id)
        """)
    )
    conn.execute(
        text("""
            UPDATE room r
            SET unit_id = sub.u
            FROM (
                SELECT l.room_id AS rid, MIN(l.unit_id) AS u
                FROM listings l
                WHERE l.room_id IS NOT NULL
                  AND l.unit_id IN (SELECT id FROM unit)
                GROUP BY l.room_id
                HAVING COUNT(DISTINCT l.unit_id) = 1
            ) sub
            WHERE r.id = sub.rid
              AND NOT EXISTS (SELECT 1 FROM unit u WHERE u.id = r.unit_id)
        """)
    )

    conn.execute(
        text("""
            DELETE FROM room r
            WHERE NOT EXISTS (SELECT 1 FROM unit u WHERE u.id = r.unit_id)
              AND NOT EXISTS (SELECT 1 FROM tenancies WHERE room_id = r.id)
              AND NOT EXISTS (SELECT 1 FROM tenant WHERE room_id = r.id)
              AND NOT EXISTS (SELECT 1 FROM listings WHERE room_id = r.id)
              AND NOT EXISTS (SELECT 1 FROM invoices WHERE room_id = r.id)
        """)
    )

    remaining = conn.execute(
        text("""
            SELECT COUNT(*) FROM room r
            WHERE NOT EXISTS (SELECT 1 FROM unit u WHERE u.id = r.unit_id)
        """)
    ).scalar() or 0
    if remaining > 0:
        sample = conn.execute(
            text("""
                SELECT r.id, r.unit_id FROM room r
                WHERE NOT EXISTS (SELECT 1 FROM unit u WHERE u.id = r.unit_id)
                ORDER BY r.id
                LIMIT 5
            """)
        ).fetchall()
        raise RuntimeError(
            "022_integrity: room rows still reference missing unit_id after repair/delete. "
            f"Examples (id, unit_id): {sample}. Fix or remove these rows."
        )

    if kept_ideal:
        if ideal is not None and not ideal.convalidated:
            conn.execute(text("ALTER TABLE room VALIDATE CONSTRAINT fk_rooms_unit_id"))
    else:
        op.create_foreign_key(
            "fk_rooms_unit_id",
            "room",
            "unit",
            ["unit_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    op.drop_constraint("fk_rooms_unit_id", "room", type_="foreignkey")

    op.create_foreign_key(
        "room_unit_id_fkey",
        "room",
        "unit",
        ["unit_id"],
        ["id"],
        postgresql_not_valid=True,
    )

    conn = op.get_bind()
    if _invoices_org_id_is_not_null(conn):
        op.alter_column(
            "invoices",
            "organization_id",
            existing_type=sa.String(),
            nullable=True,
        )
