"""
PostgreSQL connection. In production, set DATABASE_URL (e.g. from secrets manager).

Runtime vs migrations:
- DATABASE_URL must be the **application** role (NOSUPERUSER, NOBYPASSRLS) so Row Level
  Security applies. Do not point the app at a superuser.
- Production: DATABASE_URL is required (no PG_* fallback). User name `postgres` is rejected.
- MIGRATE_DATABASE_URL (optional): privileged role used only by Alembic and
  scripts/ci_grant_app_role.py. If unset, migrations use DATABASE_URL (same as before).
  Example: docker-compose sets MIGRATE_DATABASE_URL=postgres… and DATABASE_URL=feelathomenow_app…
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import event
from sqlalchemy.engine import URL
from sqlalchemy.exc import OperationalError
from sqlmodel import SQLModel, create_engine, Session

from db.rls import apply_pg_organization_context, get_request_organization_id

logger = logging.getLogger("app.database")

# Load backend/.env before reading DATABASE_URL (so scripts and app both see it)
_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env")


def _normalize_sqlalchemy_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif not url.startswith("postgresql"):
        url = f"postgresql+psycopg2://{url}"
    return url


def _validate_production_database_url(normalized: str) -> None:
    """Reject the default superuser role name in production URLs."""
    from sqlalchemy.engine import make_url

    u = make_url(normalized)
    if u.username and str(u.username).lower() == "postgres":
        raise RuntimeError(
            "Production DATABASE_URL must not use the 'postgres' role (typically superuser). "
            "Use a dedicated application role with NOBYPASSRLS."
        )


def _get_database_url():
    env = os.getenv("ENVIRONMENT", "development").lower()
    url = os.getenv("DATABASE_URL")
    if env == "production":
        if not url or not str(url).strip():
            # Defer hard failure to server startup so tests can import without DATABASE_URL.
            return None
        normalized = _normalize_sqlalchemy_url(url.strip())
        _validate_production_database_url(normalized)
        return normalized
    if url:
        return _normalize_sqlalchemy_url(url)
    # Non-production: optional PG_* (explicit only; no default postgres user without PG_* set)
    if os.getenv("PG_PASSWORD") is not None or os.getenv("PG_USER") is not None:
        user = os.getenv("PG_USER")
        if not user or not str(user).strip():
            raise RuntimeError(
                "PG_USER must be set explicitly when using PG_PASSWORD/PG_USER database config."
            )
        return URL.create(
            "postgresql+psycopg2",
            username=str(user).strip(),
            password=os.getenv("PG_PASSWORD", ""),
            host=os.getenv("PG_HOST", "localhost"),
            port=int(os.getenv("PG_PORT", "5432")),
            database=os.getenv("PG_DATABASE", "feelathomenow"),
        )
    return None


def get_migration_database_url() -> str | URL | None:
    """
    URL for Alembic and role-grant scripts. Prefer MIGRATE_DATABASE_URL when split from app.
    Falls back to DATABASE_URL / PG_* so existing local and CI flows keep working.
    """
    raw = os.getenv("MIGRATE_DATABASE_URL") or os.getenv("DATABASE_URL")
    if raw:
        return _normalize_sqlalchemy_url(raw)
    if os.getenv("PG_PASSWORD") is not None or os.getenv("PG_USER") is not None:
        user = os.getenv("PG_USER")
        if not user or not str(user).strip():
            raise RuntimeError(
                "PG_USER must be set explicitly when using PG_PASSWORD/PG_USER for migrations."
            )
        return URL.create(
            "postgresql+psycopg2",
            username=str(user).strip(),
            password=os.getenv("PG_PASSWORD", ""),
            host=os.getenv("PG_HOST", "localhost"),
            port=int(os.getenv("PG_PORT", "5432")),
            database=os.getenv("PG_DATABASE", "feelathomenow"),
        )
    return None


DATABASE_URL = _get_database_url()
_echo = os.getenv("SQL_ECHO", "").lower() in ("1", "true", "yes")

engine = (
    create_engine(
        DATABASE_URL,
        echo=_echo,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        connect_args={"client_encoding": "utf8"},
    )
    if DATABASE_URL
    else None
)

if engine is not None:

    @event.listens_for(engine, "handle_error")
    def _log_engine_errors(exception_context):
        exc = exception_context.original_exception
        if exc is None:
            return
        if isinstance(exc, OperationalError):
            logger.error("database_operational_error: %s", exc, exc_info=True)
        else:
            logger.warning("database_sql_error: %s", exc)


def get_session():
    """
    New Session per call. If the request ContextVar has an org id (set in get_current_user),
    apply_pg_organization_context stores rls_org_id on the session and opens a transaction
    (SELECT 1) so Session.after_begin runs SET LOCAL before any ORM query on this session.

    Without ContextVar, session.info has no rls_org_id — RLS denies tenant tables.

    Scripts: call apply_pg_organization_context(session, org_id) before tenant operations,
    or rely on ContextVar when running code under the same request model.
    """
    if engine is None:
        raise RuntimeError(
            "PostgreSQL is not configured. Set DATABASE_URL "
            "(or PG_USER + PG_PASSWORD in non-production)."
        )
    session = Session(engine)
    oid = get_request_organization_id()
    if oid:
        apply_pg_organization_context(session, oid)
    return session


def create_db():
    if engine is None:
        return
    SQLModel.metadata.create_all(engine)
