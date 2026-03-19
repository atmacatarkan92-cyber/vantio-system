from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlmodel import select

from db.models import User, UserCredentials, RefreshToken
from auth.schemas import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    LoginRequest,
    Token,
    UserMe,
)
from auth.security import (
    verify_password,
    hash_password,
    create_access_token,
    create_refresh_token_value,
    hash_refresh_token,
    get_refresh_cookie_name,
    get_refresh_token_expire_days,
    get_cookie_secure,
    get_cookie_samesite,
    new_password_is_acceptable,
    password_version_ts,
)
from auth.dependencies import get_current_user, get_db_session
from app.core.rate_limit import limiter


router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_PATH = "/"
COOKIE_HTTPONLY = True


def _set_refresh_cookie(response: JSONResponse, refresh_token_plain: str) -> None:
    """Set HttpOnly refresh token cookie on the response."""
    name = get_refresh_cookie_name()
    secure = get_cookie_secure()
    samesite = get_cookie_samesite()
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
    statement = select(User, UserCredentials).join(
        UserCredentials, User.id == UserCredentials.user_id
    ).where(
        User.email == data.email,
        User.is_active == True,  # noqa: E712
    )
    result = session.exec(statement).first()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user, credentials = result

    if not verify_password(data.password, credentials.password_hash):
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
            "pv": password_version_ts(credentials.password_changed_at),
        }
    )

    plain_refresh, token_hash, expires_at = create_refresh_token_value()
    rt = RefreshToken(
        user_id=str(user.id),
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

    row = session.exec(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .where(RefreshToken.revoked_at.is_(None))
        .where(RefreshToken.expires_at > now)
    ).first()

    if not row:
        response = JSONResponse(
            content={"detail": "Invalid or expired refresh token"},
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
        _clear_refresh_cookie(response)
        return response

    user = session.get(User, row.user_id)
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
        row = session.exec(select(RefreshToken).where(RefreshToken.token_hash == token_hash)).first()
        if row and row.revoked_at is None:
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
    )

