"""
Auth Phase 1 + 2: password hashing, JWT access tokens, refresh token generation/hashing.
SECRET_KEY required from env. Refresh tokens stored as hash in DB; plain token sent in HttpOnly cookie.
"""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext


# Bcrypt for new hashes; argon2 kept for verifying legacy hashes
pwd_context = CryptContext(schemes=["bcrypt", "argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash password with bcrypt. Never store plain passwords."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against stored hash (bcrypt or argon2)."""
    return pwd_context.verify(plain_password, hashed_password)


def _get_secret_key() -> str:
    """Read SECRET_KEY from environment. No fallback — app must refuse to start if unset."""
    key = os.getenv("SECRET_KEY")
    if not key or not str(key).strip():
        raise RuntimeError(
            "SECRET_KEY environment variable is not set. "
            "Set SECRET_KEY before starting the application (e.g. in .env)."
        )
    return key.strip()


def _get_access_token_expire_minutes() -> int:
    """Token expiry in minutes; default 30 if ACCESS_TOKEN_EXPIRE_MINUTES not set."""
    try:
        return int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    except ValueError:
        return 30


ALGORITHM = "HS256"


def create_access_token(
    data: dict,
    expires_minutes: int | None = None,
) -> str:
    """Create a signed JWT access token. Uses SECRET_KEY from env."""
    if expires_minutes is None:
        expires_minutes = _get_access_token_expire_minutes()
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, _get_secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and verify JWT; raises on invalid or expired token."""
    return jwt.decode(token, _get_secret_key(), algorithms=[ALGORITHM])


def validate_auth_config() -> None:
    """Call at startup; raises if SECRET_KEY is not set (application must not start)."""
    _get_secret_key()


# ---------------------------------------------------------------------------
# Refresh tokens (Auth Phase 2)
# ---------------------------------------------------------------------------

def get_refresh_token_expire_days() -> int:
    """Refresh token validity in days; default 7. Set REFRESH_TOKEN_EXPIRE_DAYS in env."""
    try:
        return int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    except ValueError:
        return 7


def hash_refresh_token(plain_token: str) -> str:
    """One-way hash of refresh token for storage. Use for lookup/verify only."""
    return hashlib.sha256(plain_token.encode("utf-8")).hexdigest()


def create_refresh_token_value():
    """
    Generate a new refresh token. Returns (plain_token, token_hash, expires_at).
    Store token_hash in DB; send plain_token in HttpOnly cookie only once.
    """
    plain = secrets.token_urlsafe(48)
    token_hash = hash_refresh_token(plain)
    days = get_refresh_token_expire_days()
    expires_at = datetime.now(timezone.utc) + timedelta(days=days)
    return plain, token_hash, expires_at


def get_refresh_cookie_name() -> str:
    """Cookie name for refresh token. Override with REFRESH_TOKEN_COOKIE_NAME."""
    return os.getenv("REFRESH_TOKEN_COOKIE_NAME", "fah_refresh_token")


def get_cookie_secure() -> bool:
    """Use Secure flag in production. Set COOKIE_SECURE=true for HTTPS-only cookies."""
    return os.getenv("COOKIE_SECURE", "").lower() in ("1", "true", "yes")


def get_cookie_samesite() -> str:
    """SameSite attribute. Lax is a safe default; use Strict for stricter CSRF."""
    v = os.getenv("COOKIE_SAMESITE", "lax").strip().lower()
    if v in ("lax", "strict", "none"):
        return v
    return "lax"
