"""
Read-time IP → approximate city/country for platform audit display only.

Uses ipapi.co (HTTPS, no browser). Results are cached in memory (TTL).
Does not persist to DB. Skips private/reserved IPs.
"""

from __future__ import annotations

import ipaddress
import logging
import threading
import time

import httpx

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, dict[str, str | None] | None]] = {}
_CACHE_LOCK = threading.Lock()
_TTL_SECONDS = 86400  # 24h
_TIMEOUT_SECONDS = 1.0
_IPAPI_URL = "https://ipapi.co/{ip}/json/"


def _is_public_lookup_eligible(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError:
        return False
    if (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
    ):
        return False
    return True


def _cache_get(ip: str) -> dict[str, str | None] | None | object:
    """Return cached value, or a sentinel if miss/expired."""
    now = time.monotonic()
    with _CACHE_LOCK:
        entry = _CACHE.get(ip)
        if entry is None:
            return _MISSING
        exp, val = entry
        if now > exp:
            del _CACHE[ip]
            return _MISSING
        return val


_MISSING = object()


def _cache_set(ip: str, value: dict[str, str | None] | None) -> None:
    with _CACHE_LOCK:
        _CACHE[ip] = (time.monotonic() + _TTL_SECONDS, value)


def _fetch_ipapi(ip: str) -> dict[str, str | None] | None:
    url = _IPAPI_URL.format(ip=ip)
    try:
        r = httpx.get(
            url,
            timeout=_TIMEOUT_SECONDS,
            headers={"User-Agent": "feelathomenow-backend/1.0"},
        )
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.info("ip_geolocation lookup failed for %s: %s", ip, e)
        return None
    if not isinstance(data, dict):
        return None
    if data.get("error"):
        return None
    city = data.get("city")
    country = data.get("country_name")
    out: dict[str, str | None] = {
        "city": str(city).strip() if city is not None and str(city).strip() else None,
        "country": str(country).strip() if country is not None and str(country).strip() else None,
    }
    if out["city"] is None and out["country"] is None:
        return None
    return out


def get_ip_location(ip_address: str | None) -> dict[str, str | None] | None:
    """
    Return approximate ``{"city": ..., "country": ...}`` or ``None`` if skipped/unknown.

    Private/reserved IPs return ``None`` (no external call). Failures return ``None``.
    Negative results are cached briefly implicitly via None cache - we cache None for 24h
    to avoid hammering the API on bad IPs.
    """
    if ip_address is None:
        return None
    ip = str(ip_address).strip()
    if not ip:
        return None
    if not _is_public_lookup_eligible(ip):
        return None

    cached = _cache_get(ip)
    if cached is not _MISSING:
        return cached

    result = _fetch_ipapi(ip)
    _cache_set(ip, result)
    return result


def clear_ip_geolocation_cache_for_tests() -> None:
    """Test helper only."""
    with _CACHE_LOCK:
        _CACHE.clear()
