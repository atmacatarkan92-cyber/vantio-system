"""Add CHECK constraint on users.role (allowed: admin, manager, landlord, tenant, support).

Revision ID: 003_users_role_check
Revises: 002_phase_a
Create Date: Follow-up to Phase A after cleaning users.role values.

Prerequisite: All existing users.role values must be in ('admin', 'manager', 'landlord', 'tenant', 'support').
No other tables or columns modified.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "003_users_role_check"
down_revision: Union[str, None] = "002_phase_a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CHECK_NAME = "users_role_allowed"


def upgrade() -> None:
    op.create_check_constraint(
        CHECK_NAME,
        "users",
        "role::text IN ('admin', 'manager', 'landlord', 'tenant', 'support')",
    )


def downgrade() -> None:
    op.execute(text(f"ALTER TABLE users DROP CONSTRAINT IF EXISTS {CHECK_NAME}"))
