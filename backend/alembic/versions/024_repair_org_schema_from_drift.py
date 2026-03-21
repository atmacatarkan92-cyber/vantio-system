"""Repair drift: organization_id on landlords, properties, unit (stamped DB, partial schema).

Revision ID: 024_repair_org_schema_from_drift
Revises: 023_rls_unit_tenant_room

Idempotent: safe if columns/FKs/indexes already exist. Does not modify prior migration files.
Downgrade: not supported (one-way repair).

Drift repair only: VARCHAR organization keys (no UUID type migration).
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "024_repair_org_schema_from_drift"
down_revision: Union[str, None] = "023_rls_unit_tenant_room"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table: str, column: str) -> bool:
    r = conn.execute(
        text(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = :t
              AND column_name = :c
            """
        ),
        {"t": table, "c": column},
    ).scalar()
    return r is not None


def _table_exists(conn, table: str) -> bool:
    r = conn.execute(
        text(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name = :t
            """
        ),
        {"t": table},
    ).scalar()
    return r is not None


def _fk_exists(conn, name: str) -> bool:
    r = conn.execute(
        text("SELECT 1 FROM pg_constraint WHERE conname = :n AND contype = 'f'"),
        {"n": name},
    ).scalar()
    return r is not None


def _ensure_organization_table(conn) -> None:
    if _table_exists(conn, "organization"):
        return
    conn.execute(
        text(
            """
            CREATE TABLE organization (
                id VARCHAR NOT NULL,
                name VARCHAR NOT NULL,
                created_at TIMESTAMP NOT NULL,
                CONSTRAINT organization_pkey PRIMARY KEY (id)
            )
            """
        )
    )


def _ensure_default_organization_row(conn) -> str:
    # Text id compatible with VARCHAR PK; gen_random_uuid()::text is built-in on PostgreSQL 13+ (no extension).
    conn.execute(
        text(
            """
            INSERT INTO organization (id, name, created_at)
            SELECT gen_random_uuid()::text,
                   'Default (repair 024)',
                   (NOW() AT TIME ZONE 'utc')
            WHERE NOT EXISTS (SELECT 1 FROM organization LIMIT 1)
            """
        )
    )
    oid = conn.execute(
        text(
            "SELECT id FROM organization ORDER BY created_at ASC NULLS LAST LIMIT 1"
        )
    ).scalar()
    if not oid:
        raise RuntimeError(
            "024_repair: organization table has no rows after seed; cannot continue."
        )
    return str(oid)


def upgrade() -> None:
    conn = op.get_bind()

    _ensure_organization_table(conn)

    default_org_id = _ensure_default_organization_row(conn)

    # --- nullable columns (only if missing) ---
    if not _column_exists(conn, "landlords", "organization_id"):
        op.add_column(
            "landlords",
            sa.Column("organization_id", sa.String(), nullable=True),
        )
    if not _column_exists(conn, "properties", "organization_id"):
        op.add_column(
            "properties",
            sa.Column("organization_id", sa.String(), nullable=True),
        )
    if not _column_exists(conn, "unit", "organization_id"):
        op.add_column(
            "unit",
            sa.Column("organization_id", sa.String(), nullable=True),
        )

    # --- backfill: landlords from users ---
    conn.execute(
        text(
            """
            UPDATE landlords l
            SET organization_id = u.organization_id
            FROM users u
            WHERE l.user_id IS NOT NULL
              AND l.user_id = u.id
              AND l.organization_id IS NULL
              AND u.organization_id IS NOT NULL
            """
        )
    )

    # --- properties from landlord ---
    conn.execute(
        text(
            """
            UPDATE properties p
            SET organization_id = l.organization_id
            FROM landlords l
            WHERE p.landlord_id IS NOT NULL
              AND p.landlord_id = l.id
              AND p.organization_id IS NULL
              AND l.organization_id IS NOT NULL
            """
        )
    )

    # --- unit from property ---
    conn.execute(
        text(
            """
            UPDATE unit u
            SET organization_id = p.organization_id
            FROM properties p
            WHERE u.property_id IS NOT NULL
              AND u.property_id = p.id
              AND u.organization_id IS NULL
              AND p.organization_id IS NOT NULL
            """
        )
    )

    # --- landlords: deterministic MIN(properties.organization_id) where still NULL ---
    conn.execute(
        text(
            """
            UPDATE landlords l
            SET organization_id = sub.org_id
            FROM (
                SELECT l2.id AS lid, MIN(p.organization_id) AS org_id
                FROM landlords l2
                INNER JOIN properties p ON p.landlord_id = l2.id
                WHERE l2.organization_id IS NULL
                  AND p.organization_id IS NOT NULL
                GROUP BY l2.id
            ) AS sub
            WHERE l.id = sub.lid
            """
        )
    )

    # --- remaining NULLs → default organization ---
    conn.execute(
        text("UPDATE landlords SET organization_id = :oid WHERE organization_id IS NULL"),
        {"oid": default_org_id},
    )
    conn.execute(
        text("UPDATE properties SET organization_id = :oid WHERE organization_id IS NULL"),
        {"oid": default_org_id},
    )
    conn.execute(
        text("UPDATE unit SET organization_id = :oid WHERE organization_id IS NULL"),
        {"oid": default_org_id},
    )

    # --- indexes (IF NOT EXISTS) ---
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_landlords_organization_id ON landlords (organization_id)"
        )
    )
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_properties_organization_id ON properties (organization_id)"
        )
    )
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_unit_organization_id ON unit (organization_id)"
        )
    )

    # --- FKs (only if missing) ---
    if not _fk_exists(conn, "landlords_organization_id_fkey"):
        op.create_foreign_key(
            "landlords_organization_id_fkey",
            "landlords",
            "organization",
            ["organization_id"],
            ["id"],
        )
    if not _fk_exists(conn, "properties_organization_id_fkey"):
        op.create_foreign_key(
            "properties_organization_id_fkey",
            "properties",
            "organization",
            ["organization_id"],
            ["id"],
        )
    if not _fk_exists(conn, "unit_organization_id_fkey"):
        op.create_foreign_key(
            "unit_organization_id_fkey",
            "unit",
            "organization",
            ["organization_id"],
            ["id"],
        )

    # --- verify no NULLs ---
    for table in ("landlords", "properties", "unit"):
        n = conn.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE organization_id IS NULL")
        ).scalar()
        if n is not None and int(n) > 0:
            raise RuntimeError(
                f"024_repair: {table} still has {n} row(s) with NULL organization_id after backfill."
            )

    # --- orphan references (values not in organization) ---
    for table in ("landlords", "properties", "unit"):
        n = conn.execute(
            text(
                f"""
                SELECT COUNT(*) FROM {table} t
                LEFT JOIN organization o ON t.organization_id = o.id
                WHERE t.organization_id IS NOT NULL AND o.id IS NULL
                """
            )
        ).scalar()
        if n is not None and int(n) > 0:
            raise RuntimeError(
                f"024_repair: {table} has {n} row(s) with organization_id not present in organization(id)."
            )

    # --- NOT NULL (only after checks; raw SQL avoids existing_type drift) ---
    conn.execute(
        text("ALTER TABLE landlords ALTER COLUMN organization_id SET NOT NULL")
    )
    conn.execute(
        text("ALTER TABLE properties ALTER COLUMN organization_id SET NOT NULL")
    )
    conn.execute(text("ALTER TABLE unit ALTER COLUMN organization_id SET NOT NULL"))


def downgrade() -> None:
    raise NotImplementedError(
        "024_repair_org_schema_from_drift is irreversible; restore from backup instead of downgrading."
    )
