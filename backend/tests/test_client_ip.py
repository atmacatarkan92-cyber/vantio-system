"""Unit tests for app.core.client_ip.get_client_ip."""

from types import SimpleNamespace

import pytest

from app.core.client_ip import get_client_ip


def _req(*, xff=None, client_host="192.168.1.1"):
    h = SimpleNamespace()

    def _get(key, default=None):
        if key.lower() == "x-forwarded-for":
            return xff if xff is not None else default
        return default

    h.get = _get
    client = None if client_host is None else SimpleNamespace(host=client_host)
    return SimpleNamespace(headers=h, client=client)


def test_ignores_xff_when_trust_disabled(monkeypatch):
    monkeypatch.delenv("TRUST_X_FORWARDED_FOR", raising=False)
    r = _req(xff="203.0.113.1, 10.0.0.1", client_host="10.0.0.2")
    assert get_client_ip(r) == "10.0.0.2"


def test_prefers_first_xff_when_trusted(monkeypatch):
    monkeypatch.setenv("TRUST_X_FORWARDED_FOR", "1")
    r = _req(xff="203.0.113.1, 10.0.0.1", client_host="10.0.0.2")
    assert get_client_ip(r) == "203.0.113.1"


def test_invalid_xff_falls_back_to_client(monkeypatch):
    monkeypatch.setenv("TRUST_X_FORWARDED_FOR", "1")
    r = _req(xff="not-a-valid-ip", client_host="10.0.0.3")
    assert get_client_ip(r) == "10.0.0.3"


def test_no_client_no_xff_returns_none(monkeypatch):
    monkeypatch.delenv("TRUST_X_FORWARDED_FOR", raising=False)
    r = _req(xff=None, client_host=None)
    assert get_client_ip(r) is None


def test_trusted_xff_skips_invalid_first_hop(monkeypatch):
    monkeypatch.setenv("TRUST_X_FORWARDED_FOR", "1")
    r = _req(xff="bogus, 198.51.100.2", client_host="10.0.0.1")
    assert get_client_ip(r) == "198.51.100.2"


@pytest.mark.parametrize("truthy", ["1", "true", "TRUE", "yes", "on"])
def test_trust_env_var_truthy(monkeypatch, truthy):
    monkeypatch.setenv("TRUST_X_FORWARDED_FOR", truthy)
    r = _req(xff="2001:db8::1", client_host="10.0.0.1")
    assert get_client_ip(r) == "2001:db8::1"
