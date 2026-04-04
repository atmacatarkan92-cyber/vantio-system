from typing import Tuple

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from sqlmodel import select

from app.core.request_logging import set_log_user_id
from auth.security import decode_access_token, password_version_ts
from db.database import get_session as _db_get_session
from db.models import Landlord, Organization, Tenant, User, UserCredentials, UserRole
from db.rls import (
    apply_pg_organization_context,
    apply_pg_user_context,
    set_request_organization_id,
)

# HTTPBearer makes Swagger UI show "Authorize" with a Bearer token field
http_bearer = HTTPBearer(auto_error=True)

# DB enum value for platform operators; use string literal so auth helpers do not depend on
# UserRole.platform_admin existing on the enum at import time (CI stubs / partial models).
_PLATFORM_ADMIN_ROLE = "platform_admin"


def get_db_session():
    """Request-scoped DB session; closed after the request."""
    db = _db_get_session()
    try:
        yield db
    finally:
        db.close()


def _user_role_value(user: User) -> str:
    """Role as string for comparison (handles Enum or str)."""
    r = getattr(user, "role", None)
    if r is None:
        return ""
    return getattr(r, "value", r) if not isinstance(r, str) else r


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
    db: Session = Depends(get_db_session),
) -> User:
    """Resolve current user from Bearer JWT. 401 if invalid or inactive."""
    request.state.impersonation_active = False
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise ValueError("Missing sub")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    apply_pg_user_context(db, user_id)
    statement = select(User).where(User.id == user_id)
    user = db.exec(statement).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive or unknown user",
        )

    set_log_user_id(str(user.id))

    # Invalidate access tokens issued before last password change (`pv` claim).
    creds = db.exec(
        select(UserCredentials).where(UserCredentials.user_id == str(user.id))
    ).first()
    if creds is not None and "pv" in payload:
        try:
            token_pv = int(payload["pv"])
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )
        if token_pv != password_version_ts(creds.password_changed_at):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )

    # Platform support-mode impersonation: JWT-only; DB row stays platform_admin.
    if payload.get("imp") is True:
        imp_org = payload.get("imp_org")
        if not imp_org or not str(imp_org).strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )
        if _user_role_value(user) != _PLATFORM_ADMIN_ROLE:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )
        org_row = db.get(Organization, str(imp_org).strip())
        if org_row is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )
        db.expunge(user)
        user.organization_id = str(org_row.id)
        user.role = UserRole.admin
        request.state.impersonation_active = True
        request.state.imp_original_role = _PLATFORM_ADMIN_ROLE
        request.state.imp_target_org_name = org_row.name or ""

    _oid = getattr(user, "organization_id", None)
    if _oid is not None and str(_oid).strip():
        _s = str(_oid).strip()
        set_request_organization_id(_s)
        apply_pg_organization_context(db, _s)
    else:
        set_request_organization_id(None)

    request.state.user_id = str(user.id)
    _oid = getattr(user, "organization_id", None)
    request.state.organization_id = str(_oid).strip() if _oid else None

    return user


def get_current_organization(current_user: User = Depends(get_current_user)) -> str:
    """
    Organization id for the authenticated user only.
    No database fallback and no default organization helper.
    """
    oid = getattr(current_user, "organization_id", None)
    if oid is None or str(oid).strip() == "":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization context missing",
        )
    s = str(oid).strip()
    set_request_organization_id(s)
    return s


def require_roles(*roles: str):
    """
    Dependency: require current user's role to be one of the given roles (by value).

    Customer-org roles (admin, manager, landlord, tenant, support) are checked here.
    The platform_admin role string is separate: it does not satisfy org-admin routes unless
    it is explicitly included in ``roles`` (for rare mixed endpoints).
    Platform-only APIs should use require_platform_admin() instead.
    """

    def dependency(user: User = Depends(get_current_user)) -> User:
        role_val = _user_role_value(user)
        if role_val == _PLATFORM_ADMIN_ROLE:
            if role_val not in roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not enough permissions",
                )
        elif role_val not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions",
            )
        return user

    return dependency


def require_role(role: str):
    """Dependency: require current user to have the given role."""
    return require_roles(role)


def require_platform_admin(user: User = Depends(get_current_user)) -> User:
    """
    Vantio platform operators only. Not satisfied by customer org admin/manager roles.

    RLS note: get_current_user still sets the request org GUC from the user's row
    (often the platform shell org). Platform org list/create are intentionally
    cross-tenant; if RLS is later tightened on ``organization`` or related tables,
    these paths may need explicit platform-safe session handling (not bypass here).
    """
    if _user_role_value(user) != _PLATFORM_ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    return user


def get_current_tenant(
    user: User = Depends(require_role("tenant")),
    db: Session = Depends(get_db_session),
) -> Tuple[User, Tenant]:
    """
    Require role=tenant and resolve the Tenant record by direct FK: tenant.user_id = user.id.
    Safe: one-to-one enforced by UNIQUE on tenant.user_id; no email matching.
    """
    tenant = db.exec(
        select(Tenant).where(Tenant.user_id == str(user.id))
    ).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenant record linked to this account. Please contact support.",
        )
    return user, tenant


def get_current_landlord(
    user: User = Depends(require_role("landlord")),
    db: Session = Depends(get_db_session),
) -> Tuple[User, Landlord]:
    """
    Require role=landlord and resolve the Landlord record by user_id.
    Returns 401 if unauthenticated (from get_current_user), 403 if wrong role or no landlord record.
    """
    landlord = db.exec(
        select(Landlord).where(Landlord.user_id == str(user.id))
    ).first()
    if not landlord:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No landlord record linked to this account. Please contact support.",
        )
    if str(getattr(landlord, "organization_id", "")) != str(getattr(user, "organization_id", "")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No landlord record linked to this account. Please contact support.",
        )
    return user, landlord

