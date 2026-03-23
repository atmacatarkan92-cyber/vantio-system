"""Tenancies: exclusion constraint — no overlapping date ranges per unit_id.

Revision ID: 026_tenancies_no_overlap
Revises: 025_rls_core_tables

Half-open daterange [move_in, COALESCE(move_out + 1 day, infinity)) so adjacent bookings
(e.g. ends Apr 30, next starts May 1) do not overlap.

Requires btree_gist for EXCLUDE (unit_id WITH =) combined with (daterange WITH &&).
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "026_tenancies_no_overlap"
down_revision: Union[str, None] = "025_rls_core_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT_NAME = "tenancies_unit_daterange_excl"


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))

    exists = conn.execute(
        text(
            """
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public' AND t.relname = 'tenancies'
              AND c.conname = :cname
            """
        ),
        {"cname": CONSTRAINT_NAME},
    ).scalar()
    if exists:
        return

    overlap_pairs = conn.execute(
        text(
            """
            WITH bounds AS (
              SELECT
                id,
                unit_id,
                daterange(
                  move_in_date,
                  COALESCE(move_out_date + 1, 'infinity'::date),
                  '[)'
                ) AS dr
              FROM tenancies
            )
            SELECT COUNT(*)::bigint FROM bounds b1
            INNER JOIN bounds b2
              ON b1.unit_id = b2.unit_id AND b1.id < b2.id
            WHERE b1.dr && b2.dr
            """
        )
    ).scalar()
    if overlap_pairs and int(overlap_pairs) > 0:
        raise RuntimeError(
            "Cannot add tenancies exclusion constraint: overlapping tenancy rows exist for the "
            "same unit_id (overlapping move_in_date/move_out_date ranges). Fix or remove "
            "overlapping tenancies before re-running this migration."
        )

    conn.execute(
        text(
            f"""
            ALTER TABLE tenancies
            ADD CONSTRAINT {CONSTRAINT_NAME}
            EXCLUDE USING gist (
              unit_id WITH =,
              daterange(
                move_in_date,
                COALESCE(move_out_date + 1, 'infinity'::date),
                '[)'
              ) WITH &&
            )
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text(f"ALTER TABLE tenancies DROP CONSTRAINT IF EXISTS {CONSTRAINT_NAME}")
    )
