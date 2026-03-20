from typing import Tuple

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import select

from db.database import get_session
from db.models import User, Tenant, Landlord, UserCredentials
from app.core.request_logging import set_log_user_id
from db.rls import apply_pg_organization_context, set_request_organization_id
from auth.security import decode_access_token, password_version_ts


# HTTPBearer makes Swagger UI show "Authorize" with a Bearer token field
http_bearer = HTTPBearer(auto_error=True)


def get_db_session():
    """Yield a DB session for auth; closed after request."""
    session = get_session()
    try:
        yield session
    finally:
        session.close()


def _user_role_value(user: User) -> str:
    """Role as string for comparison (handles Enum or str)."""
    r = getattr(user, "role", None)
    if r is None:
        return ""
    return getattr(r, "value", r) if not isinstance(r, str) else r


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
    session=Depends(get_db_session),
) -> User:
    """Resolve current user from Bearer JWT. 401 if invalid or inactive."""
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

    statement = select(User).where(User.id == user_id)
    user = session.exec(statement).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive or unknown user",
        )

    set_log_user_id(str(user.id))

    # Invalidate access tokens issued before last password change (`pv` claim).
    creds = session.exec(
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

    _oid = getattr(user, "organization_id", None)
    if _oid is not None and str(_oid).strip():
        _s = str(_oid).strip()
        set_request_organization_id(_s)
        apply_pg_organization_context(session, _s)
    else:
        set_request_organization_id(None)

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
    """Dependency: require current user's role to be one of the given roles (by value)."""

    def dependency(user: User = Depends(get_current_user)) -> User:
        role_val = _user_role_value(user)
        if role_val not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions",
            )
        return user

    return dependency


def require_role(role: str):
    """Dependency: require current user to have the given role."""
    return require_roles(role)


def get_current_tenant(
    user: User = Depends(require_role("tenant")),
    session=Depends(get_db_session),
) -> Tuple[User, Tenant]:
    """
    Require role=tenant and resolve the Tenant record by direct FK: tenant.user_id = user.id.
    Safe: one-to-one enforced by UNIQUE on tenant.user_id; no email matching.
    """
    tenant = session.exec(
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
    session=Depends(get_db_session),
) -> Tuple[User, Landlord]:
    """
    Require role=landlord and resolve the Landlord record by user_id.
    Returns 401 if unauthenticated (from get_current_user), 403 if wrong role or no landlord record.
    """
    landlord = session.exec(
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

