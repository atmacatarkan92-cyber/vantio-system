"""Unit documents table (R2 file metadata, org-scoped).

Revision ID: 037_unit_documents
Revises: 036_unit_pm_links
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "037_unit_documents"
down_revision: Union[str, None] = "036_unit_pm_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "unit_documents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("unit_id", sa.String(), nullable=False),
        sa.Column("file_name", sa.String(), nullable=True),
        sa.Column("file_url", sa.String(), nullable=False, server_default=""),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("uploaded_by", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["unit_id"], ["unit.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
    )
    op.create_index("ix_unit_documents_organization_id", "unit_documents", ["organization_id"])
    op.create_index("ix_unit_documents_unit_id", "unit_documents", ["unit_id"])
    op.create_index("ix_unit_documents_uploaded_by", "unit_documents", ["uploaded_by"])

    conn = op.get_bind()
    conn.execute(text("ALTER TABLE unit_documents ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("DROP POLICY IF EXISTS org_isolation_unit_documents ON unit_documents"))
    conn.execute(
        text(
            """
            CREATE POLICY org_isolation_unit_documents ON unit_documents FOR ALL
            USING (organization_id::text = current_setting('app.current_organization_id', true))
            WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true))
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("DROP POLICY IF EXISTS org_isolation_unit_documents ON unit_documents"))
    conn.execute(text("ALTER TABLE unit_documents DISABLE ROW LEVEL SECURITY"))

    op.drop_index("ix_unit_documents_uploaded_by", table_name="unit_documents")
    op.drop_index("ix_unit_documents_unit_id", table_name="unit_documents")
    op.drop_index("ix_unit_documents_organization_id", table_name="unit_documents")
    op.drop_table("unit_documents")
