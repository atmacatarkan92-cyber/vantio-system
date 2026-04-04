"""
Internal platform-admin API (Vantio). Not customer self-service.

Platform scope: list/create/read organizations across all tenants. This is intentional
cross-org access for operators. If PostgreSQL RLS is extended to the ``organization``
table or related reads, revisit session/context so platform-admin queries remain correct
without weakening customer org isolation for normal routes.
"""

import logging
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
from auth.schemas import Token
from auth.security import create_access_token, password_version_ts
from db.models import Organization, User, UserCredentials
from db.rls import apply_pg_organization_context

logger = logging.getLogger(__name__)

# Paths are mounted at /api/platform via server.include_router(..., prefix="/api/platform").
router = APIRouter(tags=["platform"])


class OrganizationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: Optional[str] = None
    created_at: Optional[datetime] = None


def _organization_to_list_item(org: Organization) -> OrganizationListItem:
    """Build response model; DB/driver may expose UUID primary keys as non-str objects."""
    return OrganizationListItem(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        created_at=getattr(org, "created_at", None),
    )


def _user_role_str(user: User) -> str:
    r = getattr(user, "role", None)
    if r is None:
        return ""
    return getattr(r, "value", r) if not isinstance(r, str) else r


class PlatformOrgUserItem(BaseModel):
    """Read-only org user row for platform detail (no credentials)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    role: str
    created_at: Optional[datetime] = None
    is_active: bool = True


def _user_to_platform_org_item(u: User) -> PlatformOrgUserItem:
    return PlatformOrgUserItem(
        id=str(u.id),
        email=u.email,
        role=_user_role_str(u),
        created_at=getattr(u, "created_at", None),
        is_active=bool(getattr(u, "is_active", True)),
    )


class OrganizationDetailResponse(BaseModel):
    """GET /organizations/{id} — org metadata plus users in that org."""

    id: str
    name: str
    slug: Optional[str] = None
    created_at: Optional[datetime] = None
    users: list[PlatformOrgUserItem]


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
    return [_organization_to_list_item(o) for o in rows]


@router.get("/organizations/{organization_id}", response_model=OrganizationDetailResponse)
def get_organization(
    organization_id: str,
    _: User = Depends(require_platform_admin),
    session: Session = Depends(get_db_session),
) -> OrganizationDetailResponse:
    org = session.get(Organization, organization_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    org_id_str = str(org.id)
    # RLS on users matches app.current_organization_id; platform admin's JWT still scopes
    # get_current_user to the shell org — switch GUC to the org being viewed for this request only
    # (SET LOCAL via apply_pg_organization_context; session discarded after response).
    apply_pg_organization_context(session, org_id_str)
    user_rows = session.exec(
        select(User).where(User.organization_id == org_id_str).order_by(User.created_at)
    ).all()
    users = [_user_to_platform_org_item(u) for u in user_rows]
    return OrganizationDetailResponse(
        id=org_id_str,
        name=org.name,
        slug=org.slug,
        created_at=getattr(org, "created_at", None),
        users=users,
    )


@router.post("/impersonate/{organization_id}", response_model=Token)
def platform_impersonate(
    organization_id: str,
    current_user: User = Depends(require_platform_admin),
    session: Session = Depends(get_db_session),
) -> Token:
    """
    Issue a short-lived access token that puts the platform admin in the target org context
    (support mode). Does not change the database user row; refresh uses the DB and clears imp.
    """
    org = session.get(Organization, organization_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    creds = session.exec(
        select(UserCredentials).where(UserCredentials.user_id == str(current_user.id))
    ).first()
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    logger.info(
        "event=platform_admin_impersonation_started actor_user_id=%s target_organization_id=%s",
        str(current_user.id),
        str(org.id),
    )
    access_token = create_access_token(
        {
            "sub": str(current_user.id),
            "imp": True,
            "imp_org": str(org.id),
            "pv": password_version_ts(creds.password_changed_at),
        }
    )
    return Token(access_token=access_token)


@router.post(
    "/organizations",
    response_model=PlatformCreateOrganizationResponse,
    status_code=status.HTTP_201_CREATED,
)
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
        organization=_organization_to_list_item(result.organization),
        organization_created=result.organization_created,
        admin_created=result.admin_created,
        message=result.message,
    )
