"""Tenancy lifecycle helpers: display end, scheduling end sync, derived display status."""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.services.tenancy_lifecycle import (
    scheduling_end_date_from_parts,
    sync_tenancy_move_out_date,
    tenancy_derived_display_status,
    tenancy_display_end_date,
)
from db.models import Tenancy, TenancyStatus


def _tenancy(**kwargs) -> Tenancy:
    base = dict(
        id=str(uuid.uuid4()),
        organization_id=str(uuid.uuid4()),
        tenant_id=str(uuid.uuid4()),
        room_id=str(uuid.uuid4()),
        unit_id=str(uuid.uuid4()),
        move_in_date=date(2025, 1, 1),
        move_out_date=None,
        notice_given_at=None,
        termination_effective_date=None,
        actual_move_out_date=None,
        terminated_by=None,
        monthly_rent=0.0,
        status=TenancyStatus.active,
    )
    base.update(kwargs)
    return Tenancy(**base)


def test_display_end_prefers_actual_over_termination():
    t = _tenancy(
        termination_effective_date=date(2025, 6, 30),
        actual_move_out_date=date(2025, 7, 5),
    )
    assert tenancy_display_end_date(t) == date(2025, 7, 5)


def test_display_end_falls_back_to_move_out():
    t = _tenancy(move_out_date=date(2025, 12, 31))
    assert tenancy_display_end_date(t) == date(2025, 12, 31)


def test_sync_move_out_uses_max_of_contract_and_actual():
    t = _tenancy(
        move_out_date=date(2025, 5, 31),
        termination_effective_date=date(2025, 6, 30),
        actual_move_out_date=date(2025, 7, 2),
    )
    sync_tenancy_move_out_date(t)
    assert t.move_out_date == date(2025, 7, 2)


def test_scheduling_end_from_parts_max_contract():
    assert scheduling_end_date_from_parts(
        date(2025, 1, 31),
        date(2025, 2, 28),
        None,
    ) == date(2025, 2, 28)


def test_derived_notice_given_before_effective_date():
    t = _tenancy(
        move_in_date=date(2025, 1, 1),
        termination_effective_date=date(2025, 6, 30),
    )
    assert tenancy_derived_display_status(t, date(2025, 4, 15)) == "notice_given"
    assert tenancy_derived_display_status(t, date(2025, 6, 1)) == "notice_given"


def test_derived_ended_after_actual_move_out():
    today = date(2025, 4, 15)
    t = _tenancy(move_in_date=date(2025, 1, 1), actual_move_out_date=date(2025, 4, 1))
    assert tenancy_derived_display_status(t, today) == "ended"


def test_derived_legacy_move_out_only_past():
    today = date(2025, 4, 15)
    t = _tenancy(
        move_in_date=date(2024, 1, 1),
        move_out_date=date(2025, 3, 1),
        termination_effective_date=None,
        actual_move_out_date=None,
    )
    assert tenancy_derived_display_status(t, today) == "ended"


def test_derived_reserved_future_move_in():
    today = date(2025, 4, 15)
    t = _tenancy(move_in_date=date(2025, 8, 1), status=TenancyStatus.active)
    assert tenancy_derived_display_status(t, today) == "reserved"


def test_derived_active_no_notice():
    today = date(2025, 4, 15)
    t = _tenancy(move_in_date=date(2025, 1, 1), status=TenancyStatus.active)
    assert tenancy_derived_display_status(t, today) == "active"


def test_admin_tenancy_to_dict_includes_lifecycle_and_display():
    from app.api.v1.routes_admin_tenancies import _tenancy_to_dict

    t = _tenancy(
        notice_given_at=date(2025, 3, 1),
        termination_effective_date=date(2025, 9, 30),
        actual_move_out_date=None,
        terminated_by="tenant",
    )
    sync_tenancy_move_out_date(t)
    d = _tenancy_to_dict(t)
    assert d["notice_given_at"] == "2025-03-01"
    assert d["termination_effective_date"] == "2025-09-30"
    assert d["terminated_by"] == "tenant"
    assert d["display_end_date"] == "2025-09-30"
    assert d["display_status"] == "notice_given"
