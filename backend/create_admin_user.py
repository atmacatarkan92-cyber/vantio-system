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
from auth.security import hash_password


def main() -> None:
    session = get_session()

    try:
        email = input("Admin email: ").strip()
        if not email:
            print("Email is required.")
            return

        # Check if user already exists
        existing = session.exec(select(User).where(User.email == email)).first()
        if existing:
            print(f"User with email '{email}' already exists (id={existing.id}). Aborting.")
            return

        password = getpass("Admin password: ")
        password_confirm = getpass("Confirm password: ")

        if not password:
            print("Password is required.")
            return

        if password != password_confirm:
            print("Passwords do not match. Aborting.")
            return

        user = User(
            email=email,
            full_name="Platform Admin",
            role=UserRole.admin,
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

        print(f"Created admin user with id={user.id}")
    finally:
        session.close()


if __name__ == "__main__":
    main()

