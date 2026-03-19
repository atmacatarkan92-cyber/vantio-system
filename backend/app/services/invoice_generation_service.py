"""
Generate monthly invoices from active tenancies.
One invoice per tenancy per month; prorate by overlapping days; prevent duplicates.
Uses Invoice model and generates PDFs via pdf.invoice_pdf.
"""

from calendar import monthrange
from datetime import date, timedelta
from typing import Tuple

from sqlmodel import select

from db.models import Invoice, Tenancy, TenancyStatus


def get_month_bounds(year: int, month: int) -> Tuple[date, date]:
    first = date(year, month, 1)
    _, last_day = monthrange(year, month)
    last = date(year, month, last_day)
    return first, last


def build_invoice_number(invoice_id: int, year: int, month: int) -> str:
    return f"INV-{year}-{month:02d}-{invoice_id:04d}"


def generate_monthly_invoices(session, year: int, month: int, *, organization_id: str) -> dict:
    """
    Find all tenancies with status=active that overlap the given month.
    For each: prorate rent_chf by overlapping days, create one Invoice and PDF.
    Skip if an invoice already exists for (tenancy_id, billing_year, billing_month).

    Returns: { "created_count": int, "skipped_count": int, "year": year, "month": month }
    """
    first, last = get_month_bounds(year, month)
    days_in_month = (last - first).days + 1
    due_date = first + timedelta(days=10)

    stmt = (
        select(Tenancy)
        .where(Tenancy.organization_id == organization_id)
        .where(Tenancy.status == TenancyStatus.active)
        .where(Tenancy.move_in_date <= last)
        .where((Tenancy.move_out_date == None) | (Tenancy.move_out_date >= first))
    )
    tenancies = list(session.exec(stmt).all())

    created_count = 0
    skipped_count = 0
    org_id = organization_id

    for t in tenancies:
        tenancy_id = str(t.id)
        existing = session.exec(
            select(Invoice)
            .where(Invoice.tenancy_id == tenancy_id)
            .where(Invoice.billing_year == year)
            .where(Invoice.billing_month == month)
        ).first()
        if existing:
            skipped_count += 1
            continue

        move_out = t.move_out_date or date(9999, 12, 31)
        start = max(first, t.move_in_date)
        end = min(last, move_out)
        overlapping_days = (end - start).days + 1
        prorated_amount = round(float(t.rent_chf) * (overlapping_days / days_in_month), 2)

        inv = Invoice(
            organization_id=org_id,
            tenant_id=str(t.tenant_id),
            tenancy_id=tenancy_id,
            room_id=str(t.room_id),
            unit_id=str(t.unit_id),
            billing_year=year,
            billing_month=month,
            issue_date=first,
            due_date=due_date,
            amount=prorated_amount,
            currency="CHF",
            status="unpaid",
        )
        session.add(inv)
        session.flush()

        invoice_number = build_invoice_number(inv.id, year, month)
        inv.invoice_number = invoice_number
        session.add(inv)

        try:
            from pdf.invoice_pdf import generate_invoice_pdf
            generate_invoice_pdf(
                invoice_number,
                str(t.tenant_id),
                prorated_amount,
                first,
                last,
            )
        except Exception:
            pass

        created_count += 1

    session.commit()
    return {
        "created_count": created_count,
        "skipped_count": skipped_count,
        "year": year,
        "month": month,
    }
