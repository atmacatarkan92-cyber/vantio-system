"""
Admin landlords API: list, get, create, update (Phase D table).
Protected by require_roles("admin", "manager").
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlmodel import select

from db.database import get_session
from db.models import Landlord, User
from auth.dependencies import get_current_organization, require_roles
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
    notes: Optional[str] = None
    status: Optional[str] = "active"


class LandlordUpdate(BaseModel):
    user_id: Optional[str] = None
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


@router.get("/landlords", response_model=List[dict])
def admin_list_landlords(
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """List all landlords (Phase D table)."""
    session = get_session()
    try:
        landlords = list(
            session.exec(
                select(Landlord)
                .where(Landlord.organization_id == org_id)
                .order_by(Landlord.contact_name, Landlord.company_name)
            ).all()
        )
        return [_landlord_to_dict(l) for l in landlords]
    finally:
        session.close()


@router.get("/landlords/{landlord_id}", response_model=dict)
def admin_get_landlord(
    landlord_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Get a single landlord by id."""
    session = get_session()
    try:
        landlord = session.get(Landlord, landlord_id)
        if not landlord or str(landlord.organization_id) != org_id:
            raise HTTPException(status_code=404, detail="Landlord not found")
        return _landlord_to_dict(landlord)
    finally:
        session.close()


@router.post("/landlords", response_model=dict)
@limiter.limit("10/minute")
def admin_create_landlord(
    request: Request,
    body: LandlordCreate,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Create a new landlord."""
    session = get_session()
    try:
        if body.user_id:
            u = session.get(User, body.user_id)
            if not u or str(u.organization_id) != org_id:
                raise HTTPException(status_code=400, detail="Invalid user reference")
        landlord = Landlord(
            organization_id=org_id,
            user_id=body.user_id,
            company_name=body.company_name,
            contact_name=(body.contact_name or "").strip() or "—",
            email=(body.email or "").strip() or "",
            phone=body.phone,
            notes=body.notes,
            status=(body.status or "active").strip() or "active",
        )
        session.add(landlord)
        session.commit()
        session.refresh(landlord)
        return _landlord_to_dict(landlord)
    finally:
        session.close()


@router.put("/landlords/{landlord_id}", response_model=dict)
def admin_put_landlord(
    landlord_id: str,
    body: LandlordUpdate,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
):
    """Update a landlord (partial)."""
    session = get_session()
    try:
        landlord = session.get(Landlord, landlord_id)
        if not landlord or str(landlord.organization_id) != org_id:
            raise HTTPException(status_code=404, detail="Landlord not found")
        data = body.model_dump(exclude_unset=True)
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
    finally:
        session.close()
