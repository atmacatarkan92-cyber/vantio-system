"""
Shared helpers for DB-backed tests (not collected as tests — see pytest.ini python_files).
"""
import os

from sqlmodel import SQLModel


def ensure_test_db_schema_from_models(engine) -> None:
    """
    Local/dev: create tables from SQLModel metadata when using TEST_DATABASE_URL.
    CI: GITHUB_ACTIONS/CI is set — schema must already exist from `alembic upgrade head` only.
    """
    if os.getenv("GITHUB_ACTIONS", "").lower() == "true" or os.getenv("CI", "").lower() in (
        "true",
        "1",
        "yes",
    ):
        return
    SQLModel.metadata.create_all(engine)
