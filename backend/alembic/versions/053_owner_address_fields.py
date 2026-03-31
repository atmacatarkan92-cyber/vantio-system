"""Owner address fields (same shape as landlord).

Revision ID: 053_owner_address_fields
Revises: 052_owners_and_unit_owner_id
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "053_owner_address_fields"
down_revision: Union[str, None] = "052_owners_and_unit_owner_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("owners", sa.Column("address_line1", sa.String(), nullable=True))
    op.add_column("owners", sa.Column("postal_code", sa.String(), nullable=True))
    op.add_column("owners", sa.Column("city", sa.String(), nullable=True))
    op.add_column("owners", sa.Column("canton", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("owners", "canton")
    op.drop_column("owners", "city")
    op.drop_column("owners", "postal_code")
    op.drop_column("owners", "address_line1")
