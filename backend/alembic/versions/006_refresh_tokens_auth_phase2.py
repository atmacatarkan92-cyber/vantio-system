"""Auth Phase 2: refresh_tokens table for refresh token persistence.

Revision ID: 006_refresh_tokens
Revises: 005_phase_d
Create Date: Refresh token storage (token_hash, user_id, expires_at, revoked_at, rotation).

- refresh_tokens: id, user_id FK users.id, token_hash, expires_at, created_at, revoked_at, replaced_by_token_id FK self.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006_refresh_tokens"
down_revision: Union[str, None] = "005_phase_d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("replaced_by_token_id", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["replaced_by_token_id"], ["refresh_tokens.id"]),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=False)
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"], unique=False)
    op.create_index("ix_refresh_tokens_replaced_by_token_id", "refresh_tokens", ["replaced_by_token_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_replaced_by_token_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
