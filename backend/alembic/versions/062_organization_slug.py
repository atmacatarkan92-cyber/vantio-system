"""Add nullable unique slug to organization for onboarding idempotency.

Revision ID: 062_organization_slug
Revises: 061_invoice_integrity_hardening
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "062_organization_slug"
down_revision: Union[str, None] = "061_invoice_integrity_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organization",
        sa.Column("slug", sa.String(length=128), nullable=True),
    )
    op.create_index(
        "ix_organization_slug",
        "organization",
        ["slug"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_organization_slug", table_name="organization")
    op.drop_column("organization", "slug")
