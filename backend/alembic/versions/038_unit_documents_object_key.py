"""unit_documents: optional object_key for R2 presigned URLs.

Revision ID: 038_unit_documents_object_key
Revises: 037_unit_documents
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "038_unit_documents_object_key"
down_revision: Union[str, None] = "037_unit_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "unit_documents",
        sa.Column("object_key", sa.String(length=1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("unit_documents", "object_key")
