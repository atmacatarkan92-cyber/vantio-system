"""Landlord CRM notes (additive).

Revision ID: 048_landlord_notes
Revises: 047_landlords_address_fields
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "048_landlord_notes"
down_revision: Union[str, None] = "047_landlords_address_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "landlord_notes",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("landlord_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["landlord_id"], ["landlords.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_landlord_notes_landlord_id", "landlord_notes", ["landlord_id"])
    op.create_index("ix_landlord_notes_organization_id", "landlord_notes", ["organization_id"])
    op.create_index("ix_landlord_notes_created_at", "landlord_notes", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_landlord_notes_created_at", table_name="landlord_notes")
    op.drop_index("ix_landlord_notes_organization_id", table_name="landlord_notes")
    op.drop_index("ix_landlord_notes_landlord_id", table_name="landlord_notes")
    op.drop_table("landlord_notes")
