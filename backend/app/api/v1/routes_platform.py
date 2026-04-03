"""
Internal platform-admin API (Vantio). Not customer self-service.

Platform scope: list/create/read organizations across all tenants. This is intentional
cross-org access for operators. If PostgreSQL RLS is extended to the ``organization``
table or related reads, revisit session/context so platform-admin queries remain correct
without weakening customer org isolation for normal routes.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session
from sqlmodel import select

from app.services.organization_onboarding_service import (
    OrganizationDuplicateError,
    OrganizationNameAmbiguousError,
    platform_create_organization_with_optional_admin,
)
from auth.dependencies import get_db_session, require_platform_admin
from db.models import Organization, User

# Paths are mounted at /api/platform via server.include_router(..., prefix="/api/platform").
router = APIRouter(tags=["platform"])


class OrganizationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: Optional[str] = None
    created_at: Optional[datetime] = None


class PlatformCreateOrganizationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_name: str = Field(min_length=1, max_length=500)
    organization_slug: Optional[str] = Field(default=None, max_length=128)
    create_admin: bool = False
    admin_email: Optional[str] = Field(default=None, max_length=320)
    admin_password: Optional[str] = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def admin_when_create(self) -> "PlatformCreateOrganizationBody":
        if self.create_admin:
            if not self.admin_email or not str(self.admin_email).strip():
                raise ValueError("admin_email is required when create_admin is true")
            if self.admin_password is None or not str(self.admin_password).strip():
                raise ValueError("admin_password is required when create_admin is true")
        return self


class PlatformCreateOrganizationResponse(BaseModel):
    organization: OrganizationListItem
    organization_created: bool
    admin_created: bool
    message: str


@router.get("/organizations", response_model=list[OrganizationListItem])
def list_organizations(
    _: User = Depends(require_platform_admin),
    session: Session = Depends(get_db_session),
) -> list[OrganizationListItem]:
    # Intentionally lists all organizations (platform scope), not filtered by caller org.
    rows = session.exec(select(Organization).order_by(Organization.created_at)).all()
    return [OrganizationListItem.model_validate(o) for o in rows]


@router.get("/organizations/{organization_id}", response_model=OrganizationListItem)
def get_organization(
    organization_id: str,
    _: User = Depends(require_platform_admin),
    session: Session = Depends(get_db_session),
) -> OrganizationListItem:
    org = session.get(Organization, organization_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return OrganizationListItem.model_validate(org)


@router.post(
    "/organizations",
    response_model=PlatformCreateOrganizationResponse,
    status_code=status.HTTP_201_CREATED,
)
def _user_role_str(user: User) -> str:
    r = getattr(user, "role", None)
    if r is None:
        return ""
    return getattr(r, "value", r) if not isinstance(r, str) else r


def create_organization(
    body: PlatformCreateOrganizationBody,
    current_user: User = Depends(require_platform_admin),
    session: Session = Depends(get_db_session),
) -> PlatformCreateOrganizationResponse:
    try:
        result = platform_create_organization_with_optional_admin(
            session,
            organization_name=body.organization_name,
            organization_slug=body.organization_slug,
            create_admin=body.create_admin,
            admin_email=body.admin_email,
            admin_password=body.admin_password,
            actor_user_id=str(current_user.id),
            actor_role=_user_role_str(current_user),
        )
    except OrganizationDuplicateError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=e.message,
        ) from e
    except OrganizationNameAmbiguousError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=e.message,
        ) from e
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from e

    return PlatformCreateOrganizationResponse(
        organization=OrganizationListItem.model_validate(result.organization),
        organization_created=result.organization_created,
        admin_created=result.admin_created,
        message=result.message,
    )
