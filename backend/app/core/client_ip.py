"""
Trusted client IP for audit/logging.

X-Forwarded-For is only interpreted when TRUST_X_FORWARDED_FOR is enabled (opt-in),
so directly exposed apps are not vulnerable to clients spoofing the header.
"""

from __future__ import annotations

import ipaddress
import os

from starlette.requests import Request


def _trust_x_forwarded_for_enabled() -> bool:
    v = (os.environ.get("TRUST_X_FORWARDED_FOR") or "").strip().lower()
    return v in ("1", "true", "yes", "on")


def _sanitize_ip_candidate(raw: str) -> str | None:
    if not raw:
        return None
    s = raw.strip()
    if not s:
        return None
    if "%" in s:
        s = s.split("%", 1)[0]
    try:
        return str(ipaddress.ip_address(s))
    except ValueError:
        return None


def _first_ip_from_x_forwarded_for(value: str) -> str | None:
    """Return the leftmost (original client) address from a comma-separated XFF list."""
    if not value or not value.strip():
        return None
    for part in value.split(","):
        ip = _sanitize_ip_candidate(part)
        if ip is not None:
            return ip
    return None


def get_client_ip(request: Request) -> str | None:
    """
    Resolve the client IP for logging.

    - When TRUST_X_FORWARDED_FOR is set, prefer the first IP in X-Forwarded-For
      (typical client IP when a trusted reverse proxy appends hops).
    - Otherwise ignore X-Forwarded-For to avoid spoofing on direct exposure.
    - Always fall back to request.client.host when forwarded IP is unavailable or invalid.
    """
    if _trust_x_forwarded_for_enabled():
        xff = request.headers.get("x-forwarded-for")
        if xff:
            ip = _first_ip_from_x_forwarded_for(xff)
            if ip is not None:
                return ip

    if request.client is not None and request.client.host:
        return request.client.host
    return None
