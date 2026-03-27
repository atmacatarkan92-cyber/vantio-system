"""Unit: optional landlord lease contract tracking fields.

Revision ID: 041_unit_landlord_lease
Revises: 040_document_category
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "041_unit_landlord_lease"
down_revision: Union[str, None] = "040_document_category"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("unit", sa.Column("lease_type", sa.String(), nullable=True))
    op.add_column("unit", sa.Column("lease_start_date", sa.Date(), nullable=True))
    op.add_column("unit", sa.Column("lease_end_date", sa.Date(), nullable=True))
    op.add_column("unit", sa.Column("notice_given_date", sa.Date(), nullable=True))
    op.add_column("unit", sa.Column("termination_effective_date", sa.Date(), nullable=True))
    op.add_column("unit", sa.Column("returned_to_landlord_date", sa.Date(), nullable=True))
    op.add_column("unit", sa.Column("lease_status", sa.String(), nullable=True))
    op.add_column("unit", sa.Column("lease_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("unit", "lease_notes")
    op.drop_column("unit", "lease_status")
    op.drop_column("unit", "returned_to_landlord_date")
    op.drop_column("unit", "termination_effective_date")
    op.drop_column("unit", "notice_given_date")
    op.drop_column("unit", "lease_end_date")
    op.drop_column("unit", "lease_start_date")
    op.drop_column("unit", "lease_type")
