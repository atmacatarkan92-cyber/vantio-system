"""Tenant CRM: notes + activity events (additive).

Revision ID: 029_tenant_crm_notes
Revises: 028_tenant_master

Safe: new tables only; CASCADE delete with tenant keeps CRM data lifecycle aligned.
FK column types are inferred from organization.id, tenant.id, and users.id so CI and
production (UUID vs VARCHAR drift) both work.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.engine import Connection

revision: str = "029_tenant_crm_notes"
down_revision: Union[str, None] = "028_tenant_master"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _sqlatype_for_pg_column(conn: Connection, table: str, column: str) -> sa.types.TypeEngine:
    """
    Map the referenced column's PostgreSQL type to a matching SQLAlchemy type
    (information_schema: udt_name / data_type / character_maximum_length).
    """
    row = conn.execute(
        text(
            """
            SELECT udt_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = :t
              AND column_name = :c
            """
        ),
        {"t": table, "c": column},
    ).mappings().first()
    if row is None:
        raise RuntimeError(
            f"029_tenant_crm_notes: column {table}.{column} not found; cannot infer type"
        )
    udt = (row["udt_name"] or "").lower()
    data_type = (row["data_type"] or "").lower()
    char_len = row["character_maximum_length"]

    if udt == "uuid" or data_type == "uuid":
        return UUID(as_uuid=True)
    if udt == "text" or data_type == "text":
        return sa.Text()
    # varchar / char / name / citext (stored as udt_name in PG)
    if char_len is not None:
        return sa.String(length=int(char_len))
    return sa.String()


def upgrade() -> None:
    conn = op.get_bind()
    org_id_type = _sqlatype_for_pg_column(conn, "organization", "id")
    tenant_id_type = _sqlatype_for_pg_column(conn, "tenant", "id")
    users_id_type = _sqlatype_for_pg_column(conn, "users", "id")

    op.create_table(
        "tenant_notes",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", tenant_id_type, nullable=False),
        sa.Column("organization_id", org_id_type, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by_user_id", users_id_type, nullable=True),
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
        sa.Column("tenant_id", tenant_id_type, nullable=False),
        sa.Column("organization_id", org_id_type, nullable=False),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column("field_name", sa.String(length=128), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by_user_id", users_id_type, nullable=True),
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
