"""
PostgreSQL Row Level Security (RLS) session context.

Tenant isolation policies compare rows to transaction-local GUCs:
  app.current_organization_id — primary org scope (most tables)
  app.current_user_id — bootstrap: SELECT own users row before org GUC is known (JWT sub)
  app.auth_unscoped_user_lookup — trusted auth-only: login / forgot-password email lookup
    (SET LOCAL only in auth routes; must not persist across commits; see auth/routes.py)
  app.current_refresh_token_hash — trusted auth-only: SELECT refresh_tokens by token_hash
    before app.current_organization_id is known (refresh / logout; see apply_pg_refresh_token_hash_lookup)

SET LOCAL is transaction-scoped: when a pooled connection returns to the pool and the
next transaction begins, the previous SET LOCAL is gone — no cross-request leakage.

We store context on session.info (rls_org_id, rls_user_id, rls_auth_unscoped, rls_refresh_token_hash) and:
- On a new transaction (after_begin): apply SET LOCAL on the connection before other
  statements in that transaction.
- When apply_pg_organization_context() / apply_pg_user_context() is called while a
  transaction is already open, we SET LOCAL immediately on the current transaction —
  after_begin has already run for that transaction.

Scripts without a request ContextVar must call apply_pg_organization_context(session, org_id)
before touching tenant-scoped tables (and apply_pg_user_context when loading users by id
before org context exists).
"""
from __future__ import annotations

from contextvars import ContextVar, Token

from sqlalchemy import event, text
from sqlmodel import Session
from starlette.middleware.base import BaseHTTPMiddleware

_request_organization_id: ContextVar[str | None] = ContextVar(
    "_request_organization_id", default=None
)


def get_request_organization_id() -> str | None:
    return _request_organization_id.get()


def set_request_organization_id(org_id: str | None) -> None:
    _request_organization_id.set(org_id)


def reset_request_organization_id(token: Token | None) -> None:
    if token is not None:
        _request_organization_id.reset(token)


class OrgContextMiddleware(BaseHTTPMiddleware):
    """
    Bind a fresh ContextVar value for each HTTP request so org id never leaks between
    requests on the same worker thread.
    """

    async def dispatch(self, request, call_next):
        token = _request_organization_id.set(None)
        try:
            return await call_next(request)
        finally:
            _request_organization_id.reset(token)


@event.listens_for(Session, "after_begin")
def _rls_after_begin(session: Session, transaction, connection) -> None:
    """Re-apply SET LOCAL at the start of each new transaction (e.g. after commit)."""
    org_id = session.info.get("rls_org_id")
    if org_id:
        connection.execute(
            text("SET LOCAL app.current_organization_id = :v"),
            {"v": org_id},
        )
    user_id = session.info.get("rls_user_id")
    if user_id:
        connection.execute(
            text("SET LOCAL app.current_user_id = :v"),
            {"v": str(user_id)},
        )
    if session.info.get("rls_auth_unscoped"):
        connection.execute(text("SET LOCAL app.auth_unscoped_user_lookup = 'true'"))
    rth = session.info.get("rls_refresh_token_hash")
    if rth is not None:
        connection.execute(
            text("SET LOCAL app.current_refresh_token_hash = :v"),
            {"v": str(rth)},
        )


def apply_pg_organization_context(session: Session, organization_id: str | None) -> None:
    """
    Bind tenant GUC for RLS. Must run before queries against RLS-protected tables.

    - Sets session.info["rls_org_id"] so subsequent transactions on this Session get
      SET LOCAL via after_begin.
    - If no transaction is active yet, the first execute opens a transaction; after_begin
      applies SET LOCAL before that statement completes.
    - If a transaction is already open (auth queries ran first), after_begin already
      fired for this transaction — we SET LOCAL immediately on the current transaction.
    """
    if not organization_id or not str(organization_id).strip():
        session.info.pop("rls_org_id", None)
        return
    s = str(organization_id).strip()
    session.info["rls_org_id"] = s

    if session.in_transaction():
        session.execute(
            text("SET LOCAL app.current_organization_id = :v"),
            {"v": s},
        )
    else:
        session.execute(text("SELECT 1"))


def apply_pg_user_context(session: Session, user_id: str | None) -> None:
    """
    Bind app.current_user_id for RLS on users (self-row visible before org GUC is set).
    Clears when user_id is empty.
    """
    if not user_id or not str(user_id).strip():
        session.info.pop("rls_user_id", None)
        return
    s = str(user_id).strip()
    session.info["rls_user_id"] = s
    if session.in_transaction():
        session.execute(text("SET LOCAL app.current_user_id = :v"), {"v": s})
    else:
        session.execute(text("SELECT 1"))


def apply_pg_refresh_token_hash_lookup(session: Session, token_hash: str | None) -> None:
    """
    Trusted server-only: allow SELECT/UPDATE refresh_tokens by token_hash before org GUC is set.
    Pass None to clear (SET LOCAL to empty string so policy does not match real hashes).
    """
    if not token_hash or not str(token_hash).strip():
        session.info.pop("rls_refresh_token_hash", None)
        if session.in_transaction():
            session.execute(text("SET LOCAL app.current_refresh_token_hash = ''"))
        else:
            session.execute(text("SELECT 1"))
        return
    s = str(token_hash).strip()
    session.info["rls_refresh_token_hash"] = s
    if session.in_transaction():
        session.execute(text("SET LOCAL app.current_refresh_token_hash = :v"), {"v": s})
    else:
        session.execute(text("SELECT 1"))


def apply_pg_auth_unscoped_user_lookup(session: Session) -> None:
    """
    Trusted server-only: allow auth routes to match users by email (login / forgot-password).
    Call session.info.pop('rls_auth_unscoped', None) and commit before any non-auth DML
    so the GUC does not span transactions.
    """
    session.info["rls_auth_unscoped"] = True
    if session.in_transaction():
        session.execute(text("SET LOCAL app.auth_unscoped_user_lookup = 'true'"))
    else:
        session.execute(text("SELECT 1"))
