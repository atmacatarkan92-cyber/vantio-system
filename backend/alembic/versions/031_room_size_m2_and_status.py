"""Room: size_m2 (nullable) and status (default Frei).

Revision ID: 031_room_size_m2_and_status
Revises: 030_rls_tenant_crm
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "031_room_size_m2_and_status"
down_revision: Union[str, None] = "030_rls_tenant_crm"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("room", sa.Column("size_m2", sa.Float(), nullable=True))
    op.add_column(
        "room",
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="Frei",
        ),
    )


def downgrade() -> None:
    op.drop_column("room", "status")
    op.drop_column("room", "size_m2")
