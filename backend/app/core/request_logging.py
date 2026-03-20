"""
Request-scoped correlation (request_id, optional org_id / user_id) and safe HTTP lifecycle logs.

Context is injected into log records via RequestContextFilter; no secrets or auth headers are logged.
"""
from __future__ import annotations

import logging
import re
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware

from db.rls import get_request_organization_id

REQUEST_ID_HEADER = "X-Request-ID"
_INCOMING_ID_RE = re.compile(r"^[a-zA-Z0-9._-]{1,128}$")

_request_id: ContextVar[str | None] = ContextVar("_request_id", default=None)
_log_user_id: ContextVar[str | None] = ContextVar("_log_user_id", default=None)


def get_request_id() -> str | None:
    return _request_id.get()


def get_log_user_id() -> str | None:
    return _log_user_id.get()


def set_log_user_id(user_id: str | None) -> None:
    """Set for the current request after the user is resolved (auth dependency)."""
    _log_user_id.set(user_id)


def _resolve_request_id_from_headers(headers) -> str:
    raw = headers.get(REQUEST_ID_HEADER)
    if raw:
        s = raw.strip()
        if len(s) <= 128 and _INCOMING_ID_RE.match(s):
            return s
    return str(uuid.uuid4())


class RequestContextFilter(logging.Filter):
    """Attach request_id, org_id, user_id from ContextVar / RLS context to every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id() or "-"
        oid = get_request_organization_id()
        record.org_id = oid if oid else "-"
        uid = get_log_user_id()
        record.user_id = uid if uid else "-"
        return True


def install_request_context_filter() -> None:
    filt = RequestContextFilter()
    root = logging.getLogger()
    root.addFilter(filt)
    for h in root.handlers:
        h.addFilter(filt)


_request_logger = logging.getLogger("app.request")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Innermost HTTP middleware: assign request_id, log completion/failure, echo X-Request-ID.

    Registered first so it wraps the app directly; org/user context is still visible before
    OrgContextMiddleware resets the org ContextVar.
    """

    async def dispatch(self, request, call_next):
        token_rid = _request_id.set(None)
        token_uid = _log_user_id.set(None)
        try:
            rid = _resolve_request_id_from_headers(request.headers)
            _request_id.set(rid)
            path = request.url.path
            method = request.method
            start = time.perf_counter()
            try:
                response = await call_next(request)
            except Exception:
                duration_ms = int((time.perf_counter() - start) * 1000)
                _request_logger.exception(
                    "event=request_failed method=%s path=%s duration_ms=%s",
                    method,
                    path,
                    duration_ms,
                )
                raise
            duration_ms = int((time.perf_counter() - start) * 1000)
            response.headers[REQUEST_ID_HEADER] = rid
            _request_logger.info(
                "event=request_completed method=%s path=%s status_code=%s duration_ms=%s",
                method,
                path,
                response.status_code,
                duration_ms,
            )
            return response
        finally:
            _request_id.reset(token_rid)
            _log_user_id.reset(token_uid)
