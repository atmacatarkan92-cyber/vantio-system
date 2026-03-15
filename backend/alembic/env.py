"""
Alembic env.py — uses existing backend db (sync SQLAlchemy/psycopg2).
Loads backend/.env and SQLModel metadata so migrations stay in sync with db/models.py.
"""
from logging.config import fileConfig

from alembic import context
from sqlmodel import SQLModel

# Ensure backend root is on path and .env is loaded before importing db
import sys
from pathlib import Path

_backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_backend_root))

from dotenv import load_dotenv
load_dotenv(_backend_root / ".env")

from db.database import engine as _engine, DATABASE_URL
from db import models  # noqa: F401 — register all table models on SQLModel.metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def get_url():
    """Use DATABASE_URL from backend/.env (same as db.database)."""
    if DATABASE_URL:
        return DATABASE_URL
    return config.get_main_option("sqlalchemy.url")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no live DB; only generates SQL)."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (connects to DB)."""
    if _engine is None:
        raise RuntimeError(
            "PostgreSQL is not configured. Set DATABASE_URL or PG_* in backend/.env (e.g. use docker compose up -d db)."
        )
    connectable = _engine
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
