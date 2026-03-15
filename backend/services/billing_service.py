# DEPRECATED: Uses legacy tenancy columns (start_date, end_date, monthly_rent). Safe to remove after later legacy cleanup.
"""
DEPRECATED — Do not use.

This module uses an old tenancy schema (start_date, end_date, monthly_rent, billing_cycle)
and billing_runs table. The current system uses:
  - db.models.Tenancy (move_in_date, move_out_date, rent_chf, status)
  - app.services.invoice_generation_service.generate_monthly_invoices()
  - db.models.Invoice

Use POST /api/admin/invoices/generate and the Invoice model instead.
"""
from datetime import date, timedelta
from calendar import monthrange
from sqlalchemy import text
from pdf.invoice_pdf import generate_invoice_pdf


def get_month_period(year: int, month: int):
    start_date = date(year, month, 1)
    end_day = monthrange(year, month)[1]
    end_date = date(year, month, end_day)
    return start_date, end_date


def build_invoice_number(invoice_id: int, year: int, month: int):
    return f"INV-{year}-{month:02d}-{invoice_id:04d}"


def generate_monthly_invoices(session, year: int, month: int):
    period_start, period_end = get_month_period(year, month)

    tenancies = session.execute(text("""
        SELECT id, start_date, end_date, monthly_rent, billing_cycle, status
        FROM tenancies
        WHERE status = 'active'
          AND billing_cycle = 'monthly'
          AND start_date <= :period_end
          AND (end_date IS NULL OR end_date >= :period_start)
    """), {
        "period_start": period_start,
        "period_end": period_end
    }).mappings().all()

    created_invoices = []

    for tenancy in tenancies:
        existing = session.execute(text("""
            SELECT id
            FROM billing_runs
            WHERE tenancy_id = :tenancy_id
              AND billing_year = :year
              AND billing_month = :month
        """), {
            "tenancy_id": tenancy["id"],
            "year": year,
            "month": month
        }).first()

        if existing:
            continue

        issue_date = period_start
        due_date = issue_date + timedelta(days=10)

        invoice_result = session.execute(text("""
            INSERT INTO invoices
            (
                tenancy_id,
                invoice_type,
                issue_date,
                due_date,
                period_start,
                period_end,
                amount,
                currency,
                status
            )
            VALUES
            (
                :tenancy_id,
                'rent',
                :issue_date,
                :due_date,
                :period_start,
                :period_end,
                :amount,
                'CHF',
                'open'
            )
            RETURNING id
        """), {
            "tenancy_id": tenancy["id"],
            "issue_date": issue_date,
            "due_date": due_date,
            "period_start": period_start,
            "period_end": period_end,
            "amount": tenancy["monthly_rent"]
        })

        invoice_id = invoice_result.scalar_one()
        invoice_number = build_invoice_number(invoice_id, year, month)
        generate_invoice_pdf(
    invoice_number,
    tenancy["id"],
    tenancy["monthly_rent"],
    period_start,
    period_end
)

        session.execute(text("""
            UPDATE invoices
            SET invoice_number = :invoice_number
            WHERE id = :invoice_id
        """), {
            "invoice_number": invoice_number,
            "invoice_id": invoice_id
        })

        session.execute(text("""
            INSERT INTO billing_runs
            (
                tenancy_id,
                invoice_id,
                billing_year,
                billing_month,
                period_start,
                period_end,
                status,
                generated_at,
                created_at
            )
            VALUES
            (
                :tenancy_id,
                :invoice_id,
                :year,
                :month,
                :period_start,
                :period_end,
                'generated',
                NOW(),
                NOW()
            )
        """), {
            "tenancy_id": tenancy["id"],
            "invoice_id": invoice_id,
            "year": year,
            "month": month,
            "period_start": period_start,
            "period_end": period_end
        })

        created_invoices.append({
            "invoice_id": invoice_id,
            "invoice_number": invoice_number,
            "tenancy_id": tenancy["id"]
        })

    session.commit()
    return created_invoices