"""RLS: user_credentials and refresh_tokens (organization_id + trusted auth paths).

Revision ID: 044_rls_tokens_credentials
Revises: 043_tokens_org_prereq

- user_credentials: org isolation OR app.auth_unscoped_user_lookup (same trusted pattern as
  users — login join only; must be cleared before commit per auth/routes.py).
- refresh_tokens: org isolation OR token_hash = app.current_refresh_token_hash (SET LOCAL
  only in auth refresh/logout before organization_id is known; see db.rls.py).

Both tables use FORCE ROW LEVEL SECURITY (sensitive data; consistent with users / audit_logs).
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "044_rls_tokens_credentials"
down_revision: Union[str, None] = "043_tokens_org_prereq"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # --- user_credentials ---
    conn.execute(text("DROP POLICY IF EXISTS org_isolation_user_credentials ON user_credentials"))
    conn.execute(text("ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE user_credentials FORCE ROW LEVEL SECURITY"))
    conn.execute(
        text(
            """
            CREATE POLICY org_isolation_user_credentials ON user_credentials FOR ALL
            USING (
                organization_id::text = current_setting('app.current_organization_id', true)
                OR current_setting('app.auth_unscoped_user_lookup', true) = 'true'
            )
            WITH CHECK (
                organization_id::text = current_setting('app.current_organization_id', true)
                OR current_setting('app.auth_unscoped_user_lookup', true) = 'true'
            )
            """
        )
    )

    # --- refresh_tokens ---
    conn.execute(text("DROP POLICY IF EXISTS org_isolation_refresh_tokens ON refresh_tokens"))
    conn.execute(text("ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY"))
    conn.execute(
        text(
            """
            CREATE POLICY org_isolation_refresh_tokens ON refresh_tokens FOR ALL
            USING (
                organization_id::text = current_setting('app.current_organization_id', true)
                OR (
                    token_hash IS NOT NULL
                    AND token_hash = current_setting('app.current_refresh_token_hash', true)
                )
            )
            WITH CHECK (
                organization_id::text = current_setting('app.current_organization_id', true)
                OR (
                    token_hash IS NOT NULL
                    AND token_hash = current_setting('app.current_refresh_token_hash', true)
                )
            )
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(text("DROP POLICY IF EXISTS org_isolation_refresh_tokens ON refresh_tokens"))
    conn.execute(text("ALTER TABLE refresh_tokens NO FORCE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE refresh_tokens DISABLE ROW LEVEL SECURITY"))

    conn.execute(text("DROP POLICY IF EXISTS org_isolation_user_credentials ON user_credentials"))
    conn.execute(text("ALTER TABLE user_credentials NO FORCE ROW LEVEL SECURITY"))
    conn.execute(text("ALTER TABLE user_credentials DISABLE ROW LEVEL SECURITY"))
