"""Tenant CRM: notes + activity events (additive).

Revision ID: 029_tenant_crm_notes
Revises: 028_tenant_master

Safe: new tables only; CASCADE delete with tenant keeps CRM data lifecycle aligned.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "029_tenant_crm_notes"
down_revision: Union[str, None] = "028_tenant_master"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tenant_notes",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenant_notes_tenant_id", "tenant_notes", ["tenant_id"])
    op.create_index("ix_tenant_notes_organization_id", "tenant_notes", ["organization_id"])
    op.create_index("ix_tenant_notes_created_at", "tenant_notes", ["created_at"])

    op.create_table(
        "tenant_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column("field_name", sa.String(length=128), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenant_events_tenant_id", "tenant_events", ["tenant_id"])
    op.create_index("ix_tenant_events_organization_id", "tenant_events", ["organization_id"])
    op.create_index("ix_tenant_events_action_type", "tenant_events", ["action_type"])
    op.create_index("ix_tenant_events_created_at", "tenant_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_tenant_events_created_at", table_name="tenant_events")
    op.drop_index("ix_tenant_events_action_type", table_name="tenant_events")
    op.drop_index("ix_tenant_events_organization_id", table_name="tenant_events")
    op.drop_index("ix_tenant_events_tenant_id", table_name="tenant_events")
    op.drop_table("tenant_events")

    op.drop_index("ix_tenant_notes_created_at", table_name="tenant_notes")
    op.drop_index("ix_tenant_notes_organization_id", table_name="tenant_notes")
    op.drop_index("ix_tenant_notes_tenant_id", table_name="tenant_notes")
    op.drop_table("tenant_notes")
