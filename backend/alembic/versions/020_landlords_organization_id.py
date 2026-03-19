"""Landlords: organization_id (multi-tenant ownership)

Revision ID: 020_landlords_org
Revises: 019_password_reset_tokens
Create Date: 2026-03-14

- Add landlords.organization_id (FK organization), nullable then backfill.
- Backfill from users.organization_id where landlord.user_id is set.
- Backfill remaining from properties (one DISTINCT org per landlord); fail if multiple.
- Remaining NULL rows: assign first organization by created_at (bootstrap only).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "020_landlords_org"
down_revision: Union[str, None] = "019_password_reset_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    op.add_column("landlords", sa.Column("organization_id", sa.String(), nullable=True))
    op.create_index("ix_landlords_organization_id", "landlords", ["organization_id"], unique=False)
    op.create_foreign_key(
        "landlords_organization_id_fkey",
        "landlords",
        "organization",
        ["organization_id"],
        ["id"],
    )

    conn.execute(
        text("""
            UPDATE landlords l
            SET organization_id = u.organization_id
            FROM users u
            WHERE l.user_id = u.id AND l.organization_id IS NULL
        """)
    )

    ambiguous = conn.execute(
        text("""
            SELECT l.id AS lid, COUNT(DISTINCT p.organization_id) AS n_org
            FROM landlords l
            INNER JOIN properties p ON p.landlord_id = l.id
            WHERE l.organization_id IS NULL
            GROUP BY l.id
            HAVING COUNT(DISTINCT p.organization_id) > 1
        """)
    ).fetchall()
    if ambiguous:
        sample = ", ".join(str(r[0]) for r in ambiguous[:10])
        raise RuntimeError(
            "Landlords linked to properties in multiple organizations; fix data then re-run. "
            f"Examples (ids): {sample}"
        )

    conn.execute(
        text("""
            UPDATE landlords l
            SET organization_id = sub.org_id
            FROM (
                SELECT l2.id AS lid, MIN(p.organization_id) AS org_id
                FROM landlords l2
                INNER JOIN properties p ON p.landlord_id = l2.id
                WHERE l2.organization_id IS NULL
                GROUP BY l2.id
            ) AS sub
            WHERE l.id = sub.lid
        """)
    )

    remaining = conn.execute(text("SELECT COUNT(*) FROM landlords WHERE organization_id IS NULL")).scalar()
    if remaining and int(remaining) > 0:
        default_org = conn.execute(
            text("SELECT id FROM organization ORDER BY created_at ASC NULLS LAST LIMIT 1")
        ).scalar()
        if not default_org:
            raise RuntimeError(
                "Some landlords have no organization_id and no organization row exists for bootstrap."
            )
        conn.execute(
            text("UPDATE landlords SET organization_id = :oid WHERE organization_id IS NULL"),
            {"oid": default_org},
        )

    op.alter_column("landlords", "organization_id", nullable=False)


def downgrade() -> None:
    op.drop_constraint("landlords_organization_id_fkey", "landlords", type_="foreignkey")
    op.drop_index("ix_landlords_organization_id", table_name="landlords")
    op.drop_column("landlords", "organization_id")
