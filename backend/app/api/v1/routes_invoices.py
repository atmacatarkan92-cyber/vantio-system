"""
Invoice API: list, status update, mark paid/unpaid, PDF download, generate.
Uses invoice_service and Invoice model. Protected by require_roles.
"""

import os
from typing import Optional, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import func
from sqlalchemy import or_
from sqlmodel import select

from db.database import get_session
from auth.dependencies import get_current_organization, require_roles
from app.core.rate_limit import limiter
from app.services.invoice_service import (
    _invoice_to_api,
    get_invoice,
    update_invoice_status,
    mark_invoice_paid,
    mark_invoice_unpaid,
)
from db.models import Invoice


router = APIRouter(prefix="/api", tags=["invoices"])


class InvoiceGenerateBody(BaseModel):
    year: int = Field(..., ge=1900, le=2100)
    month: int = Field(..., ge=1, le=12)


class MarkInvoicePaidBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None


@router.get("/invoices")
def get_invoices_route(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """
    List invoices for the current organization only (organization_id match).

    Rows with organization_id IS NULL are excluded (isolated from org-scoped UI/API).
    Operational follow-up: run alembic 021 backfill and/or
    SELECT id, tenant_id, tenancy_id FROM invoices WHERE organization_id IS NULL;
    """
    session = get_session()
    try:
        _total_rows = session.exec(
            select(func.count())
            .select_from(Invoice)
            .where(Invoice.organization_id == org_id)
        ).all()
        total = int(_total_rows[0]) if _total_rows else 0
        stmt = (
            select(Invoice)
            .where(Invoice.organization_id == org_id)
            .order_by(Invoice.issue_date.desc())
            .offset(skip)
            .limit(limit)
        )
        rows = session.exec(stmt).all()
        items = [_invoice_to_api(inv) for inv in rows]
        return {
            "items": items,
            "total": total,
            "skip": skip,
            "limit": limit,
        }
    finally:
        session.close()


@router.put("/invoices/{invoice_id}/status")
def update_invoice_status_route(
    invoice_id: int,
    status: Literal["unpaid", "paid", "open", "overdue", "cancelled"],
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Update invoice status (e.g. open, overdue, cancelled)."""
    session = get_session()
    try:
        inv = session.get(Invoice, invoice_id)
        if not inv or str(inv.organization_id or "") != org_id:
            raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
        result = update_invoice_status(session, invoice_id, status)
        if result is None:
            raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
        return result
    finally:
        session.close()


@router.patch("/admin/invoices/{invoice_id}/mark-paid")
@limiter.limit("10/minute")
def mark_invoice_paid_route(
    request: Request,
    invoice_id: int,
    body: Optional[MarkInvoicePaidBody] = Body(default=None),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Set status=paid, paid_at=now; optional payment_method and payment_reference."""
    session = get_session()
    try:
        inv = session.get(Invoice, invoice_id)
        if not inv or str(inv.organization_id or "") != org_id:
            raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
        payment_method = body.payment_method if body else None
        payment_reference = body.payment_reference if body else None
        result = mark_invoice_paid(session, invoice_id, payment_method, payment_reference)
        if result is None:
            raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
        return result
    finally:
        session.close()


@router.patch("/admin/invoices/{invoice_id}/mark-unpaid")
@limiter.limit("10/minute")
def mark_invoice_unpaid_route(
    request: Request,
    invoice_id: int,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Set status=unpaid, clear paid_at and payment fields."""
    session = get_session()
    try:
        inv = session.get(Invoice, invoice_id)
        if not inv or str(inv.organization_id or "") != org_id:
            raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
        result = mark_invoice_unpaid(session, invoice_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
        return result
    finally:
        session.close()


@router.get("/invoices/{invoice_id}/pdf")
def download_invoice_pdf_route(
    invoice_id: int,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Download invoice PDF by id (file must exist in invoices/ folder)."""
    session = get_session()
    try:
        inv = get_invoice(session, invoice_id)
        if not inv or str(inv.organization_id or "") != org_id or not inv.invoice_number:
            raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
        file_path = f"invoices/{inv.invoice_number}.pdf"
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="PDF nicht gefunden")
        return FileResponse(
            path=file_path,
            media_type="application/pdf",
            filename=f"{inv.invoice_number}.pdf",
        )
    finally:
        session.close()


@router.post("/admin/invoices/generate")
@limiter.limit("10/minute")
def generate_invoices_route(
    request: Request,
    body: InvoiceGenerateBody = Body(..., description="year and month"),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Generate monthly invoices from active tenancies; prorate; skip duplicates."""
    session = get_session()
    try:
        from app.services.invoice_generation_service import generate_monthly_invoices
        result = generate_monthly_invoices(session, body.year, body.month, organization_id=org_id)
        return result
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()
