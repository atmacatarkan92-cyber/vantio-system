"""
Admin landlords API: list, get, create, update (Phase D table).
Protected by require_roles("admin", "manager").
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlmodel import select

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.models import Landlord, User
from app.core.rate_limit import limiter


router = APIRouter(prefix="/api/admin", tags=["admin-landlords"])


def _landlord_to_dict(l: Landlord) -> dict:
    return {
        "id": str(l.id),
        "user_id": getattr(l, "user_id", None),
        "company_name": getattr(l, "company_name", None),
        "contact_name": getattr(l, "contact_name", "") or "",
        "email": getattr(l, "email", "") or "",
        "phone": getattr(l, "phone", None),
        "address_line1": getattr(l, "address_line1", None),
        "postal_code": getattr(l, "postal_code", None),
        "city": getattr(l, "city", None),
        "canton": getattr(l, "canton", None),
        "website": getattr(l, "website", None),
        "notes": getattr(l, "notes", None),
        "status": getattr(l, "status", "active"),
        "created_at": l.created_at.isoformat() if getattr(l, "created_at", None) else None,
        "updated_at": l.updated_at.isoformat() if getattr(l, "updated_at", None) else None,
        "deleted_at": l.deleted_at.isoformat() if getattr(l, "deleted_at", None) and l.deleted_at else None,
    }


class LandlordCreate(BaseModel):
    user_id: Optional[str] = None
    company_name: Optional[str] = None
    contact_name: str = ""
    email: EmailStr
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    canton: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "active"


class LandlordUpdate(BaseModel):
    user_id: Optional[str] = None
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    canton: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


def _validate_address_create(body: LandlordCreate) -> None:
    if not (body.address_line1 or "").strip():
        raise HTTPException(status_code=400, detail="address_line1 is required")
    if not (body.postal_code or "").strip():
        raise HTTPException(status_code=400, detail="postal_code is required")
    if not (body.city or "").strip():
        raise HTTPException(status_code=400, detail="city is required")


def _validate_address_update(data: dict) -> None:
    for k in ("address_line1", "postal_code", "city"):
        if k not in data:
            continue
        v = data.get(k)
        if not (str(v) if v is not None else "").strip():
            raise HTTPException(status_code=400, detail=f"{k} is required")


@router.get("/landlords", response_model=List[dict])
def admin_list_landlords(
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """List all landlords (Phase D table)."""
    landlords = list(
        session.exec(
            select(Landlord)
            .where(Landlord.organization_id == org_id)
            .where(Landlord.deleted_at.is_(None))
            .order_by(Landlord.contact_name, Landlord.company_name)
        ).all()
    )
    return [_landlord_to_dict(l) for l in landlords]


@router.get("/landlords/{landlord_id}", response_model=dict)
def admin_get_landlord(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Get a single landlord by id."""
    landlord = session.get(Landlord, landlord_id)
    if (
        not landlord
        or str(landlord.organization_id) != org_id
        or getattr(landlord, "deleted_at", None) is not None
    ):
        raise HTTPException(status_code=404, detail="Landlord not found")
    return _landlord_to_dict(landlord)


@router.post("/landlords", response_model=dict)
@limiter.limit("10/minute")
def admin_create_landlord(
    request: Request,
    body: LandlordCreate,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Create a new landlord."""
    if body.user_id:
        u = session.get(User, body.user_id)
        if not u or str(u.organization_id) != org_id:
            raise HTTPException(status_code=400, detail="Invalid user reference")
    _validate_address_create(body)
    landlord = Landlord(
        organization_id=org_id,
        user_id=body.user_id,
        company_name=body.company_name,
        contact_name=(body.contact_name or "").strip() or "—",
        email=(body.email or "").strip() or "",
        phone=body.phone,
        address_line1=(body.address_line1 or "").strip(),
        postal_code=(body.postal_code or "").strip(),
        city=(body.city or "").strip(),
        canton=body.canton,
        website=body.website,
        notes=body.notes,
        status=(body.status or "active").strip() or "active",
    )
    session.add(landlord)
    session.commit()
    session.refresh(landlord)
    return _landlord_to_dict(landlord)


@router.put("/landlords/{landlord_id}", response_model=dict)
def admin_put_landlord(
    landlord_id: str,
    body: LandlordUpdate,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session=Depends(get_db_session),
):
    """Update a landlord (partial)."""
    landlord = session.get(Landlord, landlord_id)
    if (
        not landlord
        or str(landlord.organization_id) != org_id
        or getattr(landlord, "deleted_at", None) is not None
    ):
        raise HTTPException(status_code=404, detail="Landlord not found")
    data = body.model_dump(exclude_unset=True)
    _validate_address_update(data)
    if "user_id" in data and data["user_id"]:
        u = session.get(User, data["user_id"])
        if not u or str(u.organization_id) != org_id:
            raise HTTPException(status_code=400, detail="Invalid user reference")
    for k, v in data.items():
        if hasattr(landlord, k):
            setattr(landlord, k, v)
    session.add(landlord)
    session.commit()
    session.refresh(landlord)
    return _landlord_to_dict(landlord)
