"""
RLS-safe deletion for test DB fixtures.

Global DELETE FROM refresh_tokens / user_credentials / password_reset_tokens without org GUC
deletes zero rows under org isolation policies, leaving FK children and causing user DELETE to fail.
"""
from __future__ import annotations

from sqlalchemy import delete
from sqlmodel import Session, select

from db.models import Organization, PasswordResetToken, RefreshToken, User, UserCredentials
from db.rls import apply_pg_organization_context


def delete_org_scoped_auth_and_users(session: Session) -> None:
    """
    For each organization: set org GUC, then delete password_reset_tokens (by user in org),
    refresh_tokens, user_credentials, and users scoped to that org. Caller commits after.
    Does not delete Organization rows.
    """
    for oid in session.scalars(select(Organization.id)).all():
        oid_s = str(oid)
        apply_pg_organization_context(session, oid_s)
        session.execute(
            delete(PasswordResetToken).where(
                PasswordResetToken.user_id.in_(
                    select(User.id).where(User.organization_id == oid_s)
                )
            )
        )
        session.execute(delete(RefreshToken).where(RefreshToken.organization_id == oid_s))
        session.execute(delete(UserCredentials).where(UserCredentials.organization_id == oid_s))
        session.execute(delete(User).where(User.organization_id == oid_s))
