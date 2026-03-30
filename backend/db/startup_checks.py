"""
Production-only startup validation: Alembic revision, critical tables, DB role (RLS).

Does not modify RLS policies or business logic. Fails fast if the runtime catalog or role
does not match deployment expectations.
"""
from __future__ import annotations

import os
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

# Bump when adding migrations; override with EXPECTED_ALEMBIC_REVISION for staged rollouts.
_DEFAULT_EXPECTED_REVISION = "048_landlord_notes"

CRITICAL_TABLES: tuple[str, ...] = (
    "password_reset_tokens",
    "users",
    "organization",
    "listings",
    "inquiries",
)


def expected_alembic_revision() -> str:
    return (os.environ.get("EXPECTED_ALEMBIC_REVISION") or _DEFAULT_EXPECTED_REVISION).strip()


def verify_drift_lightweight(conn) -> dict[str, Any]:
    """
    Minimal drift checks: single alembic_version row and a known table exists.
    Callable from tooling or tests; does not assume production.
    """
    n = conn.execute(text("SELECT COUNT(*) FROM alembic_version")).scalar()
    count = int(n) if n is not None else 0
    ver = None
    if count == 1:
        ver = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    prt = conn.execute(
        text(
            """
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'password_reset_tokens'
            """
        )
    ).scalar()
    return {
        "alembic_version_rows": count,
        "alembic_version_num": str(ver) if ver is not None else None,
        "password_reset_tokens_exists": int(prt or 0) == 1,
    }


def run_production_startup_checks(engine: Engine) -> None:
    """
    ENVIRONMENT=production only (caller must enforce). Raises RuntimeError on any failure.
    """
    expected = expected_alembic_revision()
    with engine.connect() as conn:
        drift = verify_drift_lightweight(conn)
        if drift["alembic_version_rows"] != 1:
            raise RuntimeError(
                f"alembic_version must have exactly one row; got {drift['alembic_version_rows']}"
            )
        current_rev = drift["alembic_version_num"]
        if current_rev != expected:
            raise RuntimeError(
                f"Database schema revision mismatch: expected {expected!r}, "
                f"found {current_rev!r}. Run alembic upgrade head; do not stamp without applying."
            )

        for table in CRITICAL_TABLES:
            n = conn.execute(
                text(
                    """
                    SELECT COUNT(*) FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = :t
                    """
                ),
                {"t": table},
            ).scalar()
            if int(n or 0) != 1:
                raise RuntimeError(f"Critical table missing or not unique in public schema: {table}")

        row = conn.execute(
            text(
                """
                SELECT rolname, rolsuper, rolbypassrls
                FROM pg_roles
                WHERE rolname = current_user
                """
            )
        ).fetchone()
        if not row:
            raise RuntimeError("Could not resolve current database role (pg_roles)")
        rolsuper, rolbypassrls = bool(row[1]), bool(row[2])
        if rolsuper:
            raise RuntimeError(
                "Production app must not connect as a superuser: RLS is bypassed (rolsuper=true)."
            )
        if rolbypassrls:
            raise RuntimeError(
                "Production app role must have rolbypassrls=false or RLS is not enforced."
            )
