"""
One-off admin seed script for production.
Creates User (role=admin) + UserCredentials for test@feelathomenow.com if not present.
Idempotent — safe to run multiple times.

Usage (from backend directory, with DATABASE_URL set):
  python -m scripts.seed_production_admin

Requires: DATABASE_URL in environment (e.g. postgresql+psycopg2://...).
Does not modify any app code.
"""

import os
import sys

# Ensure backend root is on path so db, auth resolve
_backend_root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)

from sqlmodel import select

from db.database import get_session
from db.models import User, UserCredentials, UserRole
from auth.security import hash_password

ADMIN_EMAIL = "test@feelathomenow.com"
ADMIN_PASSWORD = "test123"
ADMIN_FULL_NAME = "Production Admin (seed)"


def main() -> None:
    # DATABASE_URL is read by db.database (from os.environ / .env)
    session = get_session()
    try:
        existing = session.exec(select(User).where(User.email == ADMIN_EMAIL)).first()
        if existing:
            print("--- Idempotent: no change ---")
            print(f"User already exists: {ADMIN_EMAIL}")
            print(f"User id: {existing.id}")
            role_val = getattr(existing.role, "value", existing.role) if hasattr(existing.role, "value") else str(existing.role)
            print(f"Role: {role_val}")
            return

        user = User(
            email=ADMIN_EMAIL,
            full_name=ADMIN_FULL_NAME,
            role=UserRole.admin,
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        creds = UserCredentials(
            user_id=user.id,
            password_hash=hash_password(ADMIN_PASSWORD),
            password_algo="bcrypt",
        )
        session.add(creds)
        session.commit()

        print("--- Created ---")
        print(f"User: {ADMIN_EMAIL}")
        print(f"User id: {user.id}")
        print("Role: admin")
        print("Password: test123 (stored hashed)")
    finally:
        session.close()


if __name__ == "__main__":
    main()
