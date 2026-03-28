import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlmodel import select

from db.models import User, UserCredentials, RefreshToken, PasswordResetToken
from auth.schemas import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    ForgotPasswordRequest,
    GenericSuccessResponse,
    LoginRequest,
    Token,
    ResetPasswordRequest,
    UserMe,
)
from auth.security import (
    verify_password,
    hash_password,
    create_access_token,
    create_refresh_token_value,
    hash_refresh_token,
    hash_password_reset_token,
    get_refresh_cookie_name,
    get_refresh_token_expire_days,
    get_cookie_secure,
    get_cookie_samesite,
    new_password_is_acceptable,
    password_version_ts,
    password_meets_policy_for_new_account,
)
from auth.dependencies import get_current_user, get_db_session
from db.rls import (
    apply_pg_auth_unscoped_user_lookup,
    apply_pg_organization_context,
    apply_pg_refresh_token_hash_lookup,
    apply_pg_user_context,
)
from app.core.rate_limit import limiter
from email_service import send_password_reset_email, EmailServiceError


router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_PATH = "/"
COOKIE_HTTPONLY = True


def _set_refresh_cookie(response: JSONResponse, refresh_token_plain: str) -> None:
    """Set HttpOnly refresh token cookie on the response."""
    name = get_refresh_cookie_name()
    secure = get_cookie_secure()
    samesite = get_cookie_samesite()
    # Browsers require Secure=true when SameSite=None; cross-site refresh breaks without it.
    if samesite == "none":
        secure = True
    days = get_refresh_token_expire_days()
    max_age = 60 * 60 * 24 * days
    response.set_cookie(
        key=name,
        value=refresh_token_plain,
        max_age=max_age,
        path=COOKIE_PATH,
        httponly=COOKIE_HTTPONLY,
        secure=secure,
        samesite=samesite,
    )


def _clear_refresh_cookie(response: JSONResponse) -> None:
    """Clear the refresh token cookie."""
    name = get_refresh_cookie_name()
    response.delete_cookie(key=name, path=COOKIE_PATH)


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, data: LoginRequest, session=Depends(get_db_session)):
    """Verify credentials, issue access token (body) and refresh token (HttpOnly cookie)."""
    apply_pg_auth_unscoped_user_lookup(session)
    statement = select(User, UserCredentials).join(
        UserCredentials, User.id == UserCredentials.user_id
    ).where(
        User.email == data.email,
        User.is_active == True,  # noqa: E712
    )
    if data.organization_id:
        statement = statement.where(User.organization_id == data.organization_id)

    matches = session.exec(statement).all()
    if len(matches) != 1:
        session.info.pop("rls_auth_unscoped", None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user, credentials = matches[0]

    if not verify_password(data.password, credentials.password_hash):
        session.info.pop("rls_auth_unscoped", None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Capture ids before commit() — commit expires ORM instances; touching user.id after
    # commit can lazy-load under wrong/missing RLS context and raise ObjectDeletedError.
    user_id = str(user.id)
    organization_id = str(user.organization_id)

    session.info.pop("rls_auth_unscoped", None)
    session.commit()

    apply_pg_user_context(session, user_id)
    apply_pg_organization_context(session, organization_id)
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    creds_for_token = session.exec(
        select(UserCredentials).where(UserCredentials.user_id == str(user.id))
    ).first()
    if not creds_for_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user.last_login_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()

    role_str = getattr(user.role, "value", user.role) if getattr(user, "role", None) is not None else ""
    access_token = create_access_token(
        {
            "sub": str(user.id),
            "role": role_str,
            "pv": password_version_ts(creds_for_token.password_changed_at),
        }
    )

    plain_refresh, token_hash, expires_at = create_refresh_token_value()
    rt = RefreshToken(
        user_id=str(user.id),
        organization_id=user.organization_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(rt)
    session.commit()

    response = JSONResponse(
        content=Token(access_token=access_token).model_dump(),
        status_code=status.HTTP_200_OK,
    )
    _set_refresh_cookie(response, plain_refresh)
    return response


@router.post("/refresh")
def refresh(request: Request, session=Depends(get_db_session)):
    """
    Read refresh token from HttpOnly cookie; validate and rotate.
    Returns new access token; sets new refresh cookie.
    """
    cookie_name = get_refresh_cookie_name()
    plain = request.cookies.get(cookie_name)
    if not plain or not plain.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )

    token_hash = hash_refresh_token(plain)
    now = datetime.now(timezone.utc)

    apply_pg_refresh_token_hash_lookup(session, token_hash)
    row = session.exec(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .where(RefreshToken.revoked_at.is_(None))
        .where(RefreshToken.expires_at > now)
    ).first()
    apply_pg_refresh_token_hash_lookup(session, None)

    if not row:
        response = JSONResponse(
            content={"detail": "Invalid or expired refresh token"},
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
        _clear_refresh_cookie(response)
        return response

    apply_pg_user_context(session, str(row.user_id))
    user = session.get(User, row.user_id)
    oid = getattr(row, "organization_id", None)
    if user and getattr(user, "organization_id", None):
        oid = user.organization_id
    if oid:
        apply_pg_organization_context(session, str(oid))

    if not user or not user.is_active:
        row.revoked_at = now
        session.add(row)
        session.commit()
        response = JSONResponse(
            content={"detail": "User inactive or not found"},
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
        _clear_refresh_cookie(response)
        return response

    row.revoked_at = now
    session.add(row)
    plain_new, hash_new, expires_new = create_refresh_token_value()
    rt_new = RefreshToken(
        user_id=row.user_id,
        organization_id=user.organization_id,
        token_hash=hash_new,
        expires_at=expires_new,
    )
    session.add(rt_new)
    session.flush()
    row.replaced_by_token_id = str(rt_new.id)
    session.add(row)
    session.commit()

    role_str = getattr(user.role, "value", user.role) if getattr(user, "role", None) is not None else ""
    creds_refresh = session.exec(
        select(UserCredentials).where(UserCredentials.user_id == str(user.id))
    ).first()
    token_payload: dict = {"sub": str(user.id), "role": role_str}
    if creds_refresh is not None:
        token_payload["pv"] = password_version_ts(creds_refresh.password_changed_at)
    access_token = create_access_token(token_payload)
    response = JSONResponse(
        content=Token(access_token=access_token).model_dump(),
        status_code=status.HTTP_200_OK,
    )
    _set_refresh_cookie(response, plain_new)
    return response


@router.post("/change-password", response_model=ChangePasswordResponse)
@limiter.limit("5/minute")
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session=Depends(get_db_session),
):
    """
    Authenticated password change. Same generic error for wrong current password as /auth/login.
    Revokes all refresh sessions; access tokens with `pv` claim are invalidated via dependency.
    """
    creds = session.exec(
        select(UserCredentials).where(UserCredentials.user_id == str(current_user.id))
    ).first()
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request",
        )

    if not verify_password(body.current_password, creds.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not new_password_is_acceptable(body.new_password, body.current_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password does not meet requirements",
        )

    creds.password_hash = hash_password(body.new_password)
    creds.password_changed_at = datetime.now(timezone.utc)
    session.add(creds)

    now = datetime.now(timezone.utc)
    refresh_rows = session.exec(
        select(RefreshToken).where(
            RefreshToken.user_id == str(current_user.id),
            RefreshToken.revoked_at.is_(None),
        )
    ).all()
    for row in refresh_rows:
        row.revoked_at = now
        session.add(row)

    session.commit()
    return ChangePasswordResponse()


@router.post(
    "/forgot-password",
    response_model=GenericSuccessResponse,
)
@limiter.limit("10/minute")
def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    session=Depends(get_db_session),
):
    """
    Forgot password (secure reset link flow).

    Security requirements:
    - Always returns a generic success message (no account enumeration).
    - Stores only a HASH of the reset token in DB.
    - Generates expiring, single-use tokens.
    - If multiple users share the same email across organizations, a token + email is
      issued for all matched users (no guessing).
    """
    generic_detail = "If the account exists, a password reset link has been sent."

    apply_pg_auth_unscoped_user_lookup(session)
    users = session.exec(
        select(User).where(
            User.email == body.email,
            User.is_active == True,  # noqa: E712
        )
    ).all()
    session.info.pop("rls_auth_unscoped", None)
    session.commit()

    if not users:
        return GenericSuccessResponse(detail=generic_detail)

    ttl_minutes = int(os.environ.get("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "60"))
    if ttl_minutes <= 0:
        ttl_minutes = 60

    now = datetime.now(timezone.utc)
    frontend_url = os.environ.get("FRONTEND_URL", "").strip()
    if not frontend_url:
        frontend_url = "http://localhost:3000"

    tokens_to_send: list[tuple[User, str]] = []
    for u in users:
        raw_token = secrets.token_urlsafe(48)
        token_hash = hash_password_reset_token(raw_token)
        session.add(
            PasswordResetToken(
                user_id=str(u.id),
                token_hash=token_hash,
                expires_at=now + timedelta(minutes=ttl_minutes),
                used_at=None,
            )
        )
        tokens_to_send.append((u, raw_token))

    session.commit()

    # Email delivery: never fail the endpoint response (generic message always),
    # but do log and continue if sending fails for a recipient.
    base = frontend_url.rstrip("/")
    for u, raw_token in tokens_to_send:
        reset_link = f"{base}/reset-password?token={raw_token}"
        try:
            send_password_reset_email(u.email, reset_link)
        except EmailServiceError:
            # Intentionally do not leak details to the client.
            continue

    return GenericSuccessResponse(detail=generic_detail)


@router.post(
    "/reset-password",
    response_model=GenericSuccessResponse,
)
@limiter.limit("10/minute")
def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    session=Depends(get_db_session),
):
    """
    Reset password using a single-use reset token.

    - Token lookup uses token_hash only (raw token never stored in DB).
    - Enforces: exists + not expired + unused.
    - Updates password hash + password_changed_at
    - Marks token used_at and revokes refresh sessions.
    - Old access tokens are invalidated via existing `pv` / password_changed_at check.
    """
    now = datetime.now(timezone.utc)

    token_hash = hash_password_reset_token(body.token)
    token_row = session.exec(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    ).first()

    if not token_row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token",
        )

    if not password_meets_policy_for_new_account(body.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password does not meet requirements",
        )

    apply_pg_user_context(session, str(token_row.user_id))
    user = session.get(User, token_row.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token",
        )
    apply_pg_organization_context(session, str(user.organization_id))

    creds = session.exec(
        select(UserCredentials).where(UserCredentials.user_id == token_row.user_id)
    ).first()
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token",
        )

    creds.password_hash = hash_password(body.new_password)
    creds.password_changed_at = now
    session.add(creds)

    token_row.used_at = now
    session.add(token_row)

    # Revoke all active refresh sessions for this user.
    refresh_rows = session.exec(
        select(RefreshToken).where(
            RefreshToken.user_id == token_row.user_id,
            RefreshToken.revoked_at.is_(None),
        )
    ).all()
    for row in refresh_rows:
        row.revoked_at = now
        session.add(row)

    session.commit()
    return GenericSuccessResponse(detail="Password updated")


@router.post("/logout")
def logout(request: Request, session=Depends(get_db_session)):
    """Revoke current refresh token (from cookie) and clear cookie."""
    cookie_name = get_refresh_cookie_name()
    plain = request.cookies.get(cookie_name)
    response = JSONResponse(content={"detail": "Logged out"}, status_code=status.HTTP_200_OK)
    _clear_refresh_cookie(response)
    if plain and plain.strip():
        token_hash = hash_refresh_token(plain)
        now = datetime.now(timezone.utc)
        apply_pg_refresh_token_hash_lookup(session, token_hash)
        row = session.exec(select(RefreshToken).where(RefreshToken.token_hash == token_hash)).first()
        apply_pg_refresh_token_hash_lookup(session, None)
        if row and row.revoked_at is None:
            if getattr(row, "organization_id", None):
                apply_pg_organization_context(session, str(row.organization_id))
            row.revoked_at = now
            session.add(row)
            session.commit()
    return response


@router.get("/me", response_model=UserMe)
def read_me(current_user: User = Depends(get_current_user)) -> UserMe:
    role_str = (
        getattr(current_user.role, "value", current_user.role)
        if getattr(current_user, "role", None) is not None
        else ""
    )
    return UserMe(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=role_str,
        is_active=current_user.is_active,
        last_login_at=current_user.last_login_at,
        organization_id=str(current_user.organization_id),
    )

