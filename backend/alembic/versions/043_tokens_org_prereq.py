"""Prerequisite: organization_id on refresh_tokens and user_credentials (Round 2 RLS prep).

Revision ID: 043_tokens_org_prereq
Revises: 042_rls_users_audit_logs

Adds organization_id matching public.organization.id (dynamic physical type per environment),
backfills from users via user_id = users.id, NOT NULL + FK + indexes.

Does NOT enable RLS — that is a later step.

Ownership path only:
  refresh_tokens.user_id → users.id → users.organization_id
  user_credentials.user_id → users.id → users.organization_id
"""

import re
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "043_tokens_org_prereq"
down_revision: Union[str, None] = "042_rls_users_audit_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _pg_column_format_type(conn, relname: str, attname: str) -> tuple[int, int, str] | None:
    """Return (atttypid, atttypmod, format_type) or None if column missing."""
    row = conn.execute(
        text(
            """
            SELECT a.atttypid, a.atttypmod,
                   pg_catalog.format_type(a.atttypid, a.atttypmod)
            FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = :relname
              AND a.attname = :attname AND a.attnum > 0 AND NOT a.attisdropped
            """
        ),
        {"relname": relname, "attname": attname},
    ).fetchone()
    if not row:
        return None
    typid, typmod, fmt = int(row[0]), int(row[1]), str(row[2])
    return typid, typmod, fmt


def _validate_type_sql_fragment(s: str) -> str:
    s = str(s).strip()
    if not re.match(r"^[a-zA-Z0-9\s\(\)]+$", s):
        raise RuntimeError(f"043: refusing unsafe organization.id type fragment: {s!r}")
    return s


def _using_expr_for_type_change(org_type_sql: str, col_type_sql: str) -> str:
    """USING (...) when altering organization_id to match organization.id."""
    ol = org_type_sql.lower()
    cl = col_type_sql.lower()
    if "uuid" in ol and "uuid" not in cl:
        return "organization_id::uuid"
    if "uuid" in cl and "uuid" not in ol:
        return "organization_id::text"
    return "organization_id::text"


def _ensure_org_column(conn, table: str, org_typid: int, org_typmod: int, org_type_sql: str) -> None:
    """Add or ALTER organization_id so (atttypid, atttypmod) match organization.id."""
    col = _pg_column_format_type(conn, table, "organization_id")
    if col is None:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN organization_id {org_type_sql}"))
    else:
        c_typid, c_typmod, c_fmt = col[0], col[1], col[2]
        if (c_typid, c_typmod) != (org_typid, org_typmod):
            using = _using_expr_for_type_change(org_type_sql, c_fmt)
            conn.execute(
                text(
                    f"ALTER TABLE {table} ALTER COLUMN organization_id TYPE {org_type_sql} "
                    f"USING ({using})"
                )
            )


def _backfill_and_enforce(conn, table: str, fk_name: str, ix_name: str) -> None:
    conn.execute(
        text(
            f"""
            UPDATE {table} t
            SET organization_id = u.organization_id
            FROM users u
            WHERE t.user_id = u.id
              AND t.organization_id IS NULL
            """
        )
    )
    n = conn.execute(
        text(f"SELECT COUNT(*) FROM {table} WHERE organization_id IS NULL")
    ).scalar()
    if n is not None and int(n) > 0:
        raise RuntimeError(
            f"043: {table}.organization_id backfill left {n} NULL row(s); "
            "cannot add NOT NULL / FK (orphan user_id or missing users.organization_id)."
        )

    conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN organization_id SET NOT NULL"))
    op.create_foreign_key(
        fk_name,
        table,
        "organization",
        ["organization_id"],
        ["id"],
    )
    op.create_index(ix_name, table, ["organization_id"])


def upgrade() -> None:
    conn = op.get_bind()

    org_attr = _pg_column_format_type(conn, "organization", "id")
    if not org_attr:
        raise RuntimeError("043: public.organization.id not found")
    org_typid, org_typmod, org_type_sql = org_attr[0], org_attr[1], _validate_type_sql_fragment(
        org_attr[2]
    )

    _ensure_org_column(conn, "refresh_tokens", org_typid, org_typmod, org_type_sql)
    _backfill_and_enforce(
        conn,
        "refresh_tokens",
        "refresh_tokens_organization_id_fkey",
        "ix_refresh_tokens_organization_id",
    )

    _ensure_org_column(conn, "user_credentials", org_typid, org_typmod, org_type_sql)
    _backfill_and_enforce(
        conn,
        "user_credentials",
        "user_credentials_organization_id_fkey",
        "ix_user_credentials_organization_id",
    )


def downgrade() -> None:
    op.drop_index("ix_user_credentials_organization_id", table_name="user_credentials")
    op.drop_constraint(
        "user_credentials_organization_id_fkey", "user_credentials", type_="foreignkey"
    )
    op.drop_column("user_credentials", "organization_id")

    op.drop_index("ix_refresh_tokens_organization_id", table_name="refresh_tokens")
    op.drop_constraint(
        "refresh_tokens_organization_id_fkey", "refresh_tokens", type_="foreignkey"
    )
    op.drop_column("refresh_tokens", "organization_id")
