"""Tenant portal hardening: tenant.user_id as canonical link to users.id.

Revision ID: 007_tenant_user_id
Revises: 006_refresh_tokens
Create Date: tenant.user_id FK + unique + backfill by normalized email.

- Add tenant.user_id (nullable, FK users.id, index).
- Backfill: set user_id where normalized email matches exactly one user and
  this tenant is the only tenant with that normalized email (safe 1:1 match).
- Add UNIQUE on tenant.user_id (one user at most one tenant; multiple NULLs allowed).
- tenant.email remains non-unique.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "007_tenant_user_id"
down_revision: Union[str, None] = "006_refresh_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add column (nullable so existing rows remain valid)
    op.add_column(
        "tenant",
        sa.Column("user_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "tenant_user_id_fkey",
        "tenant",
        "users",
        ["user_id"],
        ["id"],
    )
    op.create_index(
        "ix_tenant_user_id",
        "tenant",
        ["user_id"],
        unique=False,
    )

    # 2. Backfill: only where normalized email matches exactly one user and
    #    this tenant is the only tenant with that email (no duplicate tenant emails)
    op.execute(sa.text("""
        UPDATE tenant t
        SET user_id = u.id
        FROM users u
        WHERE LOWER(TRIM(t.email)) = LOWER(TRIM(u.email))
          AND t.user_id IS NULL
          AND (
            SELECT COUNT(*) FROM tenant t2
            WHERE LOWER(TRIM(t2.email)) = LOWER(TRIM(t.email))
          ) = 1
    """))

    # 3. UNIQUE on user_id (one user -> at most one tenant; multiple NULLs allowed)
    op.create_unique_constraint(
        "tenant_user_id_key",
        "tenant",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_constraint("tenant_user_id_key", "tenant", type_="unique")
    op.drop_index("ix_tenant_user_id", table_name="tenant")
    op.drop_constraint("tenant_user_id_fkey", "tenant", type_="foreignkey")
    op.drop_column("tenant", "user_id")
