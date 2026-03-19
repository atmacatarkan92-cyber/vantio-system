"""
One-off script: create or ensure landlord test user and linked landlord record.

Usage (from backend directory):
  set LANDLORD_TEST_PASSWORD=YourTempPassword
  python -m scripts.create_landlord_test_user

If LANDLORD_TEST_PASSWORD is not set, script prompts for password via stdin.
Does not create duplicates. Does not modify application code or create migrations.
"""

import os
import sys
from getpass import getpass

# Ensure backend root is on path so db, auth resolve
_backend_root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)

from sqlmodel import select

from db.database import get_session
from db.models import User, UserCredentials, UserRole, Landlord
from db.organization import get_or_create_default_organization
from auth.security import hash_password

TEST_EMAIL = "landlord-test@feelathomenow-test.com"
TEST_FULL_NAME = "Landlord Test Account"


def main() -> None:
    password = os.environ.get("LANDLORD_TEST_PASSWORD", "").strip()
    if not password:
        password = getpass("Password for landlord test user: ")
        if not password:
            print("Password is required. Set LANDLORD_TEST_PASSWORD or enter when prompted.")
            return

    session = get_session()
    try:
        org = get_or_create_default_organization(session)
        org_id = str(org.id)
        existing_user = session.exec(
            select(User).where(
                User.organization_id == org_id,
                User.email == TEST_EMAIL,
            )
        ).first()
        if existing_user:
            user = existing_user
            role_val = getattr(user.role, "value", user.role) if hasattr(user, "role") else str(user.role)
            if role_val != "landlord":
                print("--- Stopped ---")
                print(f"User already exists with email: {TEST_EMAIL}")
                print(f"User id: {user.id}")
                print(f"Current role: {role_val}")
                print("Required role: landlord. Refusing to change role; stop.")
                return
            # Ensure credentials exist
            existing_creds = session.exec(
                select(UserCredentials).where(UserCredentials.user_id == user.id)
            ).first()
            if not existing_creds:
                creds = UserCredentials(
                    user_id=user.id,
                    password_hash=hash_password(password),
                    password_algo="bcrypt",
                )
                session.add(creds)
                session.commit()
            # Ensure landlord row exists
            landlord = session.exec(select(Landlord).where(Landlord.user_id == str(user.id))).first()
            if not landlord:
                landlord = Landlord(
                    organization_id=org_id,
                    user_id=user.id,
                    contact_name=TEST_FULL_NAME,
                    email=TEST_EMAIL,
                    status="active",
                )
                session.add(landlord)
                session.commit()
                session.refresh(landlord)
        else:
            user = User(
                organization_id=org_id,
                email=TEST_EMAIL,
                full_name=TEST_FULL_NAME,
                role=UserRole.landlord,
                is_active=True,
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            creds = UserCredentials(
                user_id=user.id,
                password_hash=hash_password(password),
                password_algo="bcrypt",
            )
            session.add(creds)
            session.commit()
            landlord = Landlord(
                organization_id=org_id,
                user_id=user.id,
                contact_name=TEST_FULL_NAME,
                email=TEST_EMAIL,
                status="active",
            )
            session.add(landlord)
            session.commit()
            session.refresh(landlord)

        linked_ok = str(landlord.user_id) == str(user.id)
        print("--- Landlord test account ---")
        print(f"User email:              {TEST_EMAIL}")
        print(f"User id:                 {user.id}")
        print(f"Landlord id:             {landlord.id}")
        print(f"landlords.user_id link:  {linked_ok}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
