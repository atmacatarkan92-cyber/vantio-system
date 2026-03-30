"""
Create an initial admin user with hashed password (no secrets hardcoded).

Usage (from backend directory):
    python create_admin_user.py

Prompts for email and password via stdin; password is hashed with bcrypt
and stored in user_credentials (not in users). For the running API, set
SECRET_KEY in .env so JWT auth works; this script does not need SECRET_KEY.
"""

from getpass import getpass

from sqlmodel import select

from db.database import get_session
from db.models import User, UserCredentials, UserRole
from db.organization import get_or_create_default_organization
from db.rls import apply_pg_organization_context
from auth.security import hash_password


def main() -> None:
    session = get_session()

    try:
        email = input("Admin email: ").strip()
        if not email:
            print("Email is required.")
            return

        org = get_or_create_default_organization(session)
        org_id = str(org.id)
        apply_pg_organization_context(session, org_id)
        # Check if user already exists in this organization
        existing = session.exec(
            select(User).where(
                User.organization_id == org_id,
                User.email == email,
            )
        ).first()
        if existing:
            existing_creds = session.exec(
                select(UserCredentials).where(
                    UserCredentials.user_id == str(existing.id)
                )
            ).first()
            if existing_creds:
                print(
                    f"User with email '{email}' already exists and has login credentials "
                    f"(user id={existing.id}). Nothing to do."
                )
                return

            print(
                f"User with email '{email}' already exists but has no credentials "
                f"(user id={existing.id}). Enter a password to create them."
            )
            password = getpass("Admin password: ")
            password_confirm = getpass("Confirm password: ")

            if not password:
                print("Password is required.")
                return

            if password != password_confirm:
                print("Passwords do not match. Aborting.")
                return

            oid = str(existing.organization_id)
            apply_pg_organization_context(session, oid)
            creds = UserCredentials(
                user_id=str(existing.id),
                organization_id=oid,
                password_hash=hash_password(password),
                password_algo="bcrypt",
            )
            session.add(creds)
            session.commit()
            print(f"Created missing credentials for existing user id={existing.id}")
            return

        password = getpass("Admin password: ")
        password_confirm = getpass("Confirm password: ")

        if not password:
            print("Password is required.")
            return

        if password != password_confirm:
            print("Passwords do not match. Aborting.")
            return

        full_name_opt = input("Full name (optional, defaults to email): ").strip()
        full_name = full_name_opt if full_name_opt else email

        user = User(
            organization_id=org_id,
            email=email,
            full_name=full_name,
            role=UserRole.admin,
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        apply_pg_organization_context(session, org_id)
        creds = UserCredentials(
            user_id=user.id,
            organization_id=org_id,
            password_hash=hash_password(password),
            password_algo="bcrypt",
        )
        session.add(creds)
        session.commit()

        print(f"Created admin user with id={user.id}")
    finally:
        session.close()


if __name__ == "__main__":
    main()

