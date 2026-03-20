"""
PostgreSQL connection. In production, set DATABASE_URL (e.g. from secrets manager).
Example: postgresql+psycopg2://user:password@host:5432/dbname
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL
from sqlmodel import SQLModel, create_engine, Session

from db.rls import apply_pg_organization_context, get_request_organization_id

# Load backend/.env before reading DATABASE_URL (so scripts and app both see it)
_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env")


def _get_database_url():
    url = os.getenv("DATABASE_URL")
    if url:
        # Ensure scheme is correct for SQLAlchemy
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg2://", 1)
        elif not url.startswith("postgresql"):
            url = f"postgresql+psycopg2://{url}"
        return url
    # Local dev fallback (set DATABASE_URL or PG_PASSWORD in .env for production)
    if os.getenv("PG_PASSWORD") is not None or os.getenv("PG_USER") is not None:
        return URL.create(
            "postgresql+psycopg2",
            username=os.getenv("PG_USER", "postgres"),
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
        raise RuntimeError("PostgreSQL is not configured. Set DATABASE_URL or PG_* env vars.")
    session = Session(engine)
    oid = get_request_organization_id()
    if oid:
        apply_pg_organization_context(session, oid)
    return session


def create_db():
    if engine is None:
        return
    SQLModel.metadata.create_all(engine)
