"""Add optional category to unit_documents and tenant_documents.

Revision ID: 040_document_category
Revises: 039_tenant_documents
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "040_document_category"
down_revision: Union[str, None] = "039_tenant_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("unit_documents", sa.Column("category", sa.String(), nullable=True))
    op.add_column("tenant_documents", sa.Column("category", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenant_documents", "category")
    op.drop_column("unit_documents", "category")
