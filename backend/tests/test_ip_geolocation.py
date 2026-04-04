"""Unit tests for app.services.ip_geolocation (no live HTTP)."""

from unittest.mock import patch

import pytest

from app.services import ip_geolocation as geo


@pytest.fixture(autouse=True)
def clear_geo_cache():
    geo.clear_ip_geolocation_cache_for_tests()
    yield
    geo.clear_ip_geolocation_cache_for_tests()


def test_skips_private_ipv4():
    assert geo.get_ip_location("192.168.1.1") is None
    assert geo.get_ip_location("10.0.0.1") is None
    assert geo.get_ip_location("127.0.0.1") is None


def test_skips_empty():
    assert geo.get_ip_location("") is None
    assert geo.get_ip_location(None) is None


@patch("app.services.ip_geolocation._fetch_ipapi")
def test_uses_cache_second_call(mock_fetch):
    mock_fetch.return_value = {"city": "Zurich", "country": "Switzerland"}
    a = geo.get_ip_location("8.8.8.8")
    b = geo.get_ip_location("8.8.8.8")
    assert a == b
    assert mock_fetch.call_count == 1


@patch("app.services.ip_geolocation._fetch_ipapi")
def test_returns_city_country(mock_fetch):
    mock_fetch.return_value = {"city": "Zurich", "country": "Switzerland"}
    out = geo.get_ip_location("8.8.8.8")
    assert out == {"city": "Zurich", "country": "Switzerland"}
