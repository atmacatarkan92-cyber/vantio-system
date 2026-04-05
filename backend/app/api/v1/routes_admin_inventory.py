"""
Admin inventory catalog + assignments. Paths ordered so static segments match before {item_id}.
"""

from datetime import date
import uuid
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.models import User
from app.core.rate_limit import limiter
from app.services import inventory_import_extraction as invimport
from app.services import inventory_service as invsvc

router = APIRouter(prefix="/api/admin", tags=["admin-inventory"])


def _normalize_supplier_article(v: object) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _normalize_product_url(v: object) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    from urllib.parse import urlparse

    p = urlparse(s)
    if p.scheme not in ("http", "https") or not p.netloc:
        raise ValueError("product_url must be a valid http(s) URL with a host")
    return s


class InventoryItemCreateBody(BaseModel):
    name: str = Field(..., min_length=1)
    category: str = ""
    brand: Optional[str] = None
    total_quantity: int = Field(default=1, ge=1)
    condition: str = ""
    status: str = "active"
    purchase_price_chf: Optional[float] = None
    purchase_date: Optional[date] = None
    purchased_from: Optional[str] = None
    supplier_article_number: Optional[str] = None
    product_url: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("supplier_article_number", mode="before")
    @classmethod
    def _v_supplier_article(cls, v: object) -> Optional[str]:
        return _normalize_supplier_article(v)

    @field_validator("product_url", mode="before")
    @classmethod
    def _v_product_url(cls, v: object) -> Optional[str]:
        return _normalize_product_url(v)


class InventoryItemPatchBody(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    total_quantity: Optional[int] = Field(default=None, ge=1)
    condition: Optional[str] = None
    status: Optional[str] = None
    purchase_price_chf: Optional[float] = None
    purchase_date: Optional[date] = None
    purchased_from: Optional[str] = None
    supplier_article_number: Optional[str] = None
    product_url: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("supplier_article_number", mode="before")
    @classmethod
    def _v_supplier_article_patch(cls, v: object) -> Optional[str]:
        return _normalize_supplier_article(v)

    @field_validator("product_url", mode="before")
    @classmethod
    def _v_product_url_patch(cls, v: object) -> Optional[str]:
        return _normalize_product_url(v)


class AssignmentCreateBody(BaseModel):
    unit_id: str = Field(..., min_length=1)
    room_id: Optional[str] = None
    quantity: int = Field(..., ge=1)
    notes: Optional[str] = None


class AssignmentPatchBody(BaseModel):
    unit_id: Optional[str] = None
    room_id: Optional[str] = None
    quantity: Optional[int] = Field(default=None, ge=1)
    notes: Optional[str] = None


class ImportPreviewBody(BaseModel):
    source_type: Literal["url", "text"]
    url: Optional[str] = None
    text: Optional[str] = None


@router.get("/inventory/summary", response_model=dict)
def admin_inventory_org_summary(
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return invsvc.get_inventory_summary(session, org_id)


@router.get("/inventory", response_model=dict)
def admin_list_inventory(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return invsvc.list_inventory_items(
        session, org_id, skip=skip, limit=limit, q=q, category=category, status=status
    )


@router.get("/inventory/{item_id}", response_model=dict)
def admin_get_inventory_item(
    item_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return invsvc.get_inventory_item(session, org_id, item_id)


@router.post("/inventory", response_model=dict)
@limiter.limit("30/minute")
def admin_create_inventory_item(
    request: Request,
    body: InventoryItemCreateBody,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return invsvc.create_inventory_item(session, org_id, body, str(current_user.id), request)


@router.post("/inventory/import-preview", response_model=dict)
def admin_inventory_import_preview(
    request: Request,
    body: ImportPreviewBody,
    _org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Smart Import preview: safe URL fetch, normalization, LLM extraction with fallbacks."""
    if body.source_type == "url":
        raw = (body.url or "").strip()
        if not raw:
            raise HTTPException(status_code=422, detail="URL erforderlich.")
    else:
        raw = (body.text or "").strip()
        if not raw:
            raise HTTPException(status_code=422, detail="Text erforderlich.")

    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    try:
        return invimport.build_import_preview_response(body, request_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.patch("/inventory/assignments/{assignment_id}", response_model=dict)
@limiter.limit("30/minute")
def admin_patch_inventory_assignment(
    request: Request,
    assignment_id: str,
    body: AssignmentPatchBody,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return invsvc.update_assignment(session, org_id, assignment_id, body, str(current_user.id), request)


@router.delete("/inventory/assignments/{assignment_id}")
@limiter.limit("30/minute")
def admin_delete_inventory_assignment(
    request: Request,
    assignment_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return invsvc.delete_assignment(session, org_id, assignment_id, str(current_user.id), request)


@router.get("/units/{unit_id}/inventory-assignments", response_model=List[Dict[str, Any]])
def admin_list_assignments_for_unit(
    unit_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return invsvc.list_assignments_for_unit(session, org_id, unit_id)


@router.get("/inventory/{item_id}/assignments", response_model=List[Dict[str, Any]])
def admin_list_assignments_for_item(
    item_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return invsvc.list_assignments_for_item(session, org_id, item_id)


@router.post("/inventory/{item_id}/assignments", response_model=dict)
@limiter.limit("30/minute")
def admin_create_assignment(
    request: Request,
    item_id: str,
    body: AssignmentCreateBody,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return invsvc.create_assignment(session, org_id, item_id, body, str(current_user.id), request)


@router.patch("/inventory/{item_id}", response_model=dict)
@limiter.limit("30/minute")
def admin_patch_inventory_item(
    request: Request,
    item_id: str,
    body: InventoryItemPatchBody,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return invsvc.update_inventory_item(session, org_id, item_id, body, str(current_user.id), request)


@router.delete("/inventory/{item_id}")
@limiter.limit("30/minute")
def admin_delete_inventory_item(
    request: Request,
    item_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    return invsvc.delete_inventory_item(session, org_id, item_id, str(current_user.id), request)
