"""
Create a minimal tenant test account for manual verification (no secrets hardcoded).

Usage (from backend directory):
  set TENANT_TEST_PASSWORD=YourTempPassword
  python create_tenant_test_user.py

If TENANT_TEST_PASSWORD is not set, script prompts for password via stdin.
Does not create new tenancies; may reassign one existing tenancy from an orphan tenant (user_id IS NULL) to the test tenant if found. Does not modify or delete existing users, tenants, or invoices.
"""

import os
from getpass import getpass

from sqlmodel import select

from db.database import get_session
from db.models import (
    User,
    UserCredentials,
    UserRole,
    Tenant,
    Tenancy,
    Invoice,
    Room,
)
from auth.security import hash_password

TEST_EMAIL = "tenant-test@feelathomenow-test.com"
TEST_FULL_NAME = "Tenant Test Account"


def main() -> None:
    password = os.environ.get("TENANT_TEST_PASSWORD", "").strip()
    if not password:
        password = getpass("Temporary password for test tenant: ")
        if not password:
            print("Password is required. Set TENANT_TEST_PASSWORD or enter when prompted.")
            return

    session = get_session()
    try:
        # 1. Resolve or create user (do not overwrite existing)
        existing_user = session.exec(select(User).where(User.email == TEST_EMAIL)).first()
        if existing_user:
            user = existing_user
            # Ensure credentials exist so password can be used (do not overwrite)
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
        else:
            user = User(
                email=TEST_EMAIL,
                full_name=TEST_FULL_NAME,
                role=UserRole.tenant,
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

        # 2. Resolve or create tenant linked to user (do not overwrite existing tenant)
        tenant = session.exec(select(Tenant).where(Tenant.user_id == user.id)).first()
        if not tenant:
            # Some DBs have NOT NULL on tenant.room_id; use first room when required
            first_room = session.exec(select(Room).limit(1)).first()
            if not first_room:
                print("--- Tenant test account (partial) ---")
                print(f"User email:        {TEST_EMAIL}")
                print(f"User id:           {user.id}")
                print("Tenant:            not created (no room in DB; tenant.room_id may be NOT NULL).")
                print("No tenancy or invoice data.")
                return
            tenant = Tenant(
                user_id=user.id,
                name=TEST_FULL_NAME,
                email=TEST_EMAIL,
                room_id=first_room.id,
            )
            session.add(tenant)
            session.commit()
            session.refresh(tenant)

        # 5. Optional: link exactly one existing tenancy only if safe (do not create new tenancy)
        # Safe = tenancy whose current tenant has user_id IS NULL (orphan, no portal user)
        tenancy_linked = False
        orphan_tenancy = session.exec(
            select(Tenancy)
            .join(Tenant, Tenancy.tenant_id == Tenant.id)
            .where(Tenant.user_id.is_(None))
            .limit(1)
        ).first()
        if orphan_tenancy:
            orphan_tenancy.tenant_id = tenant.id
            session.add(orphan_tenancy)
            session.commit()
            tenancy_linked = True

        # 6. Check invoices reachable via this tenant
        invoice_count = session.exec(
            select(Invoice).where(Invoice.tenant_id == tenant.id)
        ).all()
        invoices_reachable = len(invoice_count)

        # Report (do not echo password)
        print("--- Tenant test account created ---")
        print(f"User email:        {TEST_EMAIL}")
        print("Temporary password: (use TENANT_TEST_PASSWORD env value or the value you entered at prompt)")
        print(f"User id:           {user.id}")
        print(f"Tenant id:         {tenant.id}")
        print(f"tenant.user_id linked: True")
        print(f"Tenancy linked:    {tenancy_linked}")
        print(f"Invoices reachable for this tenant: {invoices_reachable}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
