"""
Temporary production hotfix: ensure users.organization_id exists and is populated.

Use when a deploy missed Alembic migration 018 (users.organization_id). Idempotent;
safe to run on every startup. PostgreSQL only.

DDL may be skipped in environments without table ownership (e.g. CI); never raises.
"""
from __future__ import annotations

import logging

from sqlalchemy import text

logger = logging.getLogger(__name__)


def apply_users_organization_id_hotfix(engine) -> None:
    """ALTER / UPDATE / CREATE INDEX — idempotent; failures are logged, never raised."""
    try:
        _apply_users_organization_id_hotfix_impl(engine)
    except Exception as e:
        logger.warning(
            "startup_repair_users_org: non-fatal error (continuing startup): %s",
            e,
            exc_info=True,
        )


def _apply_users_organization_id_hotfix_impl(engine) -> None:
    if engine is None:
        logger.info("startup_repair_users_org: skipped (no database engine)")
        return

    if engine.dialect.name != "postgresql":
        logger.info(
            "startup_repair_users_org: skipped (dialect=%s, not postgresql)",
            engine.dialect.name,
        )
        return

    logger.info("startup_repair_users_org: checking users.organization_id ...")

    # --- ALTER TABLE (may fail without ownership, e.g. CI test role) ---
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id VARCHAR"
                )
            )
        logger.info(
            "startup_repair_users_org: OK — ALTER TABLE users ADD COLUMN organization_id (IF NOT EXISTS)"
        )
    except Exception as e:
        logger.warning(
            "startup_repair_users_org: skipped ALTER TABLE users ADD COLUMN organization_id — "
            "not applied (reason: %s). Typical cause: insufficient privileges (must be owner). "
            "Continuing.",
            e,
        )

    # --- Pre-UPDATE count (best-effort; column may not exist) ---
    before = None
    try:
        with engine.begin() as conn:
            before = conn.execute(
                text("SELECT COUNT(*) FROM users WHERE organization_id IS NULL")
            ).scalar()
        logger.info(
            "startup_repair_users_org: pre-UPDATE count of users.organization_id IS NULL = %s",
            before,
        )
    except Exception as e:
        logger.warning(
            "startup_repair_users_org: skipped pre-UPDATE COUNT — "
            "could not read users.organization_id (reason: %s). Continuing.",
            e,
        )

    # --- UPDATE (required to run when possible; failure is non-fatal) ---
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    UPDATE users
                    SET organization_id = (
                        SELECT id FROM organization ORDER BY id ASC LIMIT 1
                    )
                    WHERE organization_id IS NULL
                      AND EXISTS (SELECT 1 FROM organization LIMIT 1)
                    """
                )
            )
        logger.info(
            "startup_repair_users_org: OK — UPDATE users backfill (NULL organization_id)"
        )
    except Exception as e:
        logger.warning(
            "startup_repair_users_org: skipped UPDATE backfill — "
            "not applied (reason: %s). Typical cause: missing column or insufficient privileges. "
            "Continuing.",
            e,
        )

    # --- Post-UPDATE count ---
    after = None
    try:
        with engine.begin() as conn:
            after = conn.execute(
                text("SELECT COUNT(*) FROM users WHERE organization_id IS NULL")
            ).scalar()
        logger.info(
            "startup_repair_users_org: post-UPDATE count of users.organization_id IS NULL = %s",
            after,
        )
    except Exception as e:
        logger.warning(
            "startup_repair_users_org: skipped post-UPDATE COUNT — "
            "could not read users.organization_id (reason: %s). Continuing.",
            e,
        )

    if before is not None and after is not None:
        if before > 0:
            logger.info(
                "startup_repair_users_org: backfill summary — NULL rows before=%s, after=%s",
                before,
                after,
            )
        else:
            logger.info(
                "startup_repair_users_org: no users with NULL organization_id before UPDATE"
            )
        if after and after > 0:
            logger.warning(
                "startup_repair_users_org: %s user(s) still have NULL organization_id "
                "(no organization row, or UPDATE did not apply — add organization or fix schema)",
                after,
            )

    # --- CREATE INDEX (may fail without ownership) ---
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_users_organization_id ON users (organization_id)"
                )
            )
        logger.info(
            "startup_repair_users_org: OK — CREATE INDEX IF NOT EXISTS ix_users_organization_id"
        )
    except Exception as e:
        logger.warning(
            "startup_repair_users_org: skipped CREATE INDEX ix_users_organization_id — "
            "not applied (reason: %s). Typical cause: insufficient privileges (must be owner). "
            "Continuing.",
            e,
        )

    logger.info("startup_repair_users_org: finished")
