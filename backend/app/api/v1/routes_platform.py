"""
Internal platform-admin API (Vantio). Not customer self-service.

Platform scope: list/create/read organizations across all tenants. This is intentional
cross-org access for operators. If PostgreSQL RLS is extended to the ``organization``
table or related reads, revisit session/context so platform-admin queries remain correct
without weakening customer org isolation for normal routes.
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import desc
from sqlalchemy.orm import Session
from sqlmodel import select

from app.services.email_verification_helpers import (
    try_create_and_send_email_verification_for_org_admin,
)
from app.services.ip_geolocation import get_ip_location
from app.services.organization_onboarding_service import (
    OrganizationDuplicateError,
    OrganizationNameAmbiguousError,
    platform_create_organization_with_admin,
)
from auth.dependencies import get_db_session, require_platform_admin
from auth.schemas import Token
from auth.security import create_access_token, password_version_ts
from db.models import AuditLog, Organization, User, UserCredentials
from db.platform_audit_log import log_audit_event
from db.rls import apply_pg_organization_context, apply_pg_platform_audit_full_read

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
    admin_email: Optional[str] = Field(default=None, max_length=320)
    admin_password: Optional[str] = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def require_initial_admin(self) -> "PlatformCreateOrganizationBody":
        if (
            self.admin_email is None
            or not str(self.admin_email).strip()
            or self.admin_password is None
            or not str(self.admin_password).strip()
        ):
            raise ValueError("Initial admin is required")
        self.admin_email = str(self.admin_email).strip()
        return self


class PlatformCreateOrganizationResponse(BaseModel):
    organization: OrganizationListItem
    organization_created: bool
    admin_created: bool
    message: str


class PlatformAuditLogItem(BaseModel):
    """Platform audit feed row (maps DB audit_logs + optional org name)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: Optional[datetime] = None
    actor_user_id: Optional[str] = None
    actor_email: Optional[str] = None
    action: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    organization_id: str
    organization_name: Optional[str] = None
    metadata: Optional[dict] = None
    old_values: Optional[dict] = None
    new_values: Optional[dict] = None
    # Read-time enrichment for login rows only (not stored in DB).
    location_city: Optional[str] = None
    location_country: Optional[str] = None


def _audit_row_to_platform_item(row: AuditLog, org_names: dict[str, str]) -> PlatformAuditLogItem:
    oid = str(row.organization_id)
    return PlatformAuditLogItem(
        id=str(row.id),
        created_at=getattr(row, "created_at", None),
        actor_user_id=row.actor_user_id,
        actor_email=row.actor_email,
        action=row.action,
        target_type=row.entity_type,
        target_id=row.entity_id or None,
        organization_id=oid,
        organization_name=org_names.get(oid),
        metadata=row.extra_metadata,
        old_values=row.old_values,
        new_values=row.new_values,
    )


def _enrich_platform_audit_log_locations(items: list[PlatformAuditLogItem]) -> list[PlatformAuditLogItem]:
    """Attach location_city / location_country for login rows (read-time, cached GeoIP)."""
    ips_unique: list[str] = []
    seen: set[str] = set()
    for it in items:
        if it.action != "login" or not it.metadata or not isinstance(it.metadata, dict):
            continue
        raw = it.metadata.get("ip_address")
        if raw is None:
            continue
        ip = str(raw).strip()
        if not ip or ip in seen:
            continue
        seen.add(ip)
        ips_unique.append(ip)

    if not ips_unique:
        return items

    ip_to_loc: dict[str, dict[str, str | None] | None] = {}
    max_workers = min(8, len(ips_unique))
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_to_ip = {pool.submit(get_ip_location, ip): ip for ip in ips_unique}
        for fut in as_completed(future_to_ip):
            ip = future_to_ip[fut]
            try:
                ip_to_loc[ip] = fut.result()
            except Exception:
                logger.exception("ip_geolocation enrichment failed for ip=%s", ip)
                ip_to_loc[ip] = None

    out: list[PlatformAuditLogItem] = []
    for it in items:
        if it.action != "login" or not it.metadata or not isinstance(it.metadata, dict):
            out.append(it)
            continue
        ip = str(it.metadata.get("ip_address") or "").strip()
        loc = ip_to_loc.get(ip) if ip else None
        if loc and (loc.get("city") or loc.get("country")):
            out.append(
                it.model_copy(
                    update={
                        "location_city": loc.get("city"),
                        "location_country": loc.get("country"),
                    }
                )
            )
        else:
            out.append(it)
    return out


@router.get("/organizations", response_model=list[OrganizationListItem])
def list_organizations(
    _: User = Depends(require_platform_admin),
    session: Session = Depends(get_db_session),
) -> list[OrganizationListItem]:
    # Intentionally lists all organizations (platform scope), not filtered by caller org.
    rows = session.exec(select(Organization).order_by(Organization.created_at)).all()
    return [_organization_to_list_item(o) for o in rows]


@router.get("/audit-logs", response_model=list[PlatformAuditLogItem])
def list_platform_audit_logs(
    _: User = Depends(require_platform_admin),
    session: Session = Depends(get_db_session),
) -> list[PlatformAuditLogItem]:
    apply_pg_platform_audit_full_read(session)
    rows = session.exec(select(AuditLog).order_by(desc(AuditLog.created_at)).limit(50)).all()
    org_ids = {str(r.organization_id) for r in rows}
    org_names: dict[str, str] = {}
    for oid in org_ids:
        o = session.get(Organization, oid)
        if o is not None:
            org_names[oid] = o.name or ""
    items = [_audit_row_to_platform_item(r, org_names) for r in rows]
    return _enrich_platform_audit_log_locations(items)


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
    apply_pg_organization_context(session, str(org.id))
    log_audit_event(
        session,
        actor=current_user,
        action="impersonation_started",
        organization_id=org.id,
        target_type="organization",
        target_id=org.id,
        metadata={"impersonation_started_at": datetime.utcnow().isoformat()},
    )
    access_token = create_access_token(
        {
            "sub": str(current_user.id),
            "imp": True,
            "imp_org": str(org.id),
            "pv": password_version_ts(creds.password_changed_at),
            "impersonated_by": str(current_user.id),
            "impersonator_email": current_user.email,
            "is_impersonation": True,
            "impersonation_started_at": datetime.utcnow().isoformat(),
        }
    )
    return Token(access_token=access_token)


@router.post(
    "/organizations",
    response_model=PlatformCreateOrganizationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_organization(
    request: Request,
    body: PlatformCreateOrganizationBody,
    current_user: User = Depends(require_platform_admin),
    session: Session = Depends(get_db_session),
) -> PlatformCreateOrganizationResponse:
    try:
        result = platform_create_organization_with_admin(
            session,
            organization_name=body.organization_name,
            organization_slug=body.organization_slug,
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

    response = PlatformCreateOrganizationResponse(
        organization=_organization_to_list_item(result.organization),
        organization_created=result.organization_created,
        admin_created=result.admin_created,
        message=result.message,
    )
    if result.admin_created:
        try_create_and_send_email_verification_for_org_admin(
            session,
            organization_id=str(result.organization.id),
            admin_email=body.admin_email,
            request_id=getattr(request.state, "request_id", None),
        )
    return response
