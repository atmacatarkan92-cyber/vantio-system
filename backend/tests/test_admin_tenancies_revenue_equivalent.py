"""Batch monthly_revenue_equivalent attachment for GET /api/admin/tenancies (and room list)."""
from datetime import date
from unittest.mock import MagicMock

import pytest

from db.models import Tenancy, TenancyRevenue, TenancyStatus
from app.api.v1.routes_admin_tenancies import _batch_attach_monthly_revenue_equivalent


class _Result:
    def __init__(self, data):
        self._data = list(data)

    def all(self):
        return self._data


@pytest.fixture
def active_tenancy():
    return Tenancy(
        id="ten-1",
        organization_id="org-1",
        tenant_id="tenant-1",
        room_id="room-1",
        unit_id="unit-1",
        move_in_date=date(2020, 1, 1),
        move_out_date=None,
        monthly_rent=800.0,
        status=TenancyStatus.active,
    )


@pytest.fixture
def monthly_revenue_row(active_tenancy):
    return TenancyRevenue(
        id="rev-1",
        organization_id="org-1",
        tenancy_id=active_tenancy.id,
        type="rent",
        amount_chf=1500.0,
        frequency="monthly",
        start_date=date(2020, 1, 1),
        end_date=None,
    )


def test_batch_attach_sets_equivalent_for_active_tenancy_with_revenue(
    active_tenancy, monthly_revenue_row
):
    session = MagicMock()
    session.exec.return_value = _Result([monthly_revenue_row])

    _batch_attach_monthly_revenue_equivalent(session, [active_tenancy])

    assert getattr(active_tenancy, "_monthly_revenue_equivalent", None) == 1500.0
    session.exec.assert_called_once()


def test_batch_attach_skips_exec_when_no_tenancies():
    session = MagicMock()
    _batch_attach_monthly_revenue_equivalent(session, [])
    session.exec.assert_not_called()
