"""Property manager CRM notes + updated_at on property_managers.

Revision ID: 051_property_manager_notes
Revises: 050_property_manager_status
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "051_property_manager_notes"
down_revision: Union[str, None] = "050_property_manager_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "property_managers",
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.execute(text("UPDATE property_managers SET updated_at = created_at WHERE updated_at IS NULL"))

    op.create_table(
        "property_manager_notes",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("property_manager_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["property_manager_id"], ["property_managers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_property_manager_notes_property_manager_id",
        "property_manager_notes",
        ["property_manager_id"],
    )
    op.create_index(
        "ix_property_manager_notes_organization_id",
        "property_manager_notes",
        ["organization_id"],
    )
    op.create_index(
        "ix_property_manager_notes_created_at",
        "property_manager_notes",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_property_manager_notes_created_at", table_name="property_manager_notes")
    op.drop_index("ix_property_manager_notes_organization_id", table_name="property_manager_notes")
    op.drop_index("ix_property_manager_notes_property_manager_id", table_name="property_manager_notes")
    op.drop_table("property_manager_notes")
    op.drop_column("property_managers", "updated_at")
