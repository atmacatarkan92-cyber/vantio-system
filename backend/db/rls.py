"""
PostgreSQL Row Level Security (RLS) session context.

Tenant isolation policies compare rows to the transaction-local GUC:
  app.current_organization_id

SET LOCAL is transaction-scoped: when a pooled connection returns to the pool and the
next transaction begins, the previous SET LOCAL is gone — no cross-request leakage.

We store the org id on session.info["rls_org_id"] and:
- On a new transaction (after_begin): apply SET LOCAL on the connection before other
  statements in that transaction.
- When apply_pg_organization_context() is called while a transaction is already open
  (e.g. after User/UserCredentials queries in get_current_user), we SET LOCAL immediately
  on the current transaction — after_begin has already run for that transaction.

Scripts without a request ContextVar must call apply_pg_organization_context(session, org_id)
(or set SESSION-level GUC on a dedicated connection) before touching tenant-scoped tables.
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
