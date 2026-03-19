"""
One-off script: seed production tenant and landlord portal users.
Creates or ensures both test accounts exist in the database used by DATABASE_URL,
and sets their passwords to known test values.

Usage (from repository root or backend directory):
  # Ensure DATABASE_URL points to the Render production DB
  python backend/scripts/seed_production_portal_users.py

Idempotent:
  - If a user already exists (by email), it is reused.
  - Credentials are created if missing.
  - Password hashes are always updated to the expected test passwords.
  - Tenant / Landlord domain records are created only if missing.
"""

import os
import sys

from sqlmodel import select

# Ensure backend root is on path so db, auth, and models import correctly
_backend_root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)

from db.database import get_session  # noqa: E402
from db.models import (  # noqa: E402
    User,
    UserCredentials,
    UserRole,
    Tenant,
    Landlord,
    Room,
)
from db.organization import get_or_create_default_organization  # noqa: E402
from auth.security import hash_password  # noqa: E402


TENANT_EMAIL = "tenant-test@feelathomenow-test.com"
TENANT_PASSWORD = "TenantTest2026"
TENANT_FULL_NAME = "Tenant Test Account"

LANDLORD_EMAIL = "landlord-test@feelathomenow-test.com"
LANDLORD_PASSWORD = "LandlordTest2026"
LANDLORD_FULL_NAME = "Landlord Test Account"


def ensure_tenant(session):
    """Ensure tenant portal user + Tenant record + credentials exist, and password is set."""
    created_user = False
    created_tenant = False
    created_creds = False
    updated_password = False

    org = get_or_create_default_organization(session)
    org_id = str(org.id)

    user = session.exec(
        select(User).where(
            User.organization_id == org_id,
            User.email == TENANT_EMAIL,
        )
    ).first()
    if user is None:
        user = User(
            organization_id=org_id,
            email=TENANT_EMAIL,
            full_name=TENANT_FULL_NAME,
            role=UserRole.tenant,
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        created_user = True

    creds = session.exec(select(UserCredentials).where(UserCredentials.user_id == user.id)).first()
    new_hash = hash_password(TENANT_PASSWORD)
    if creds is None:
        creds = UserCredentials(
            user_id=user.id,
            password_hash=new_hash,
            password_algo="bcrypt",
        )
        session.add(creds)
        created_creds = True
        updated_password = True
    else:
        creds.password_hash = new_hash
        updated_password = True
    session.commit()

    tenant = session.exec(select(Tenant).where(Tenant.user_id == user.id)).first()
    if tenant is None:
        # Some deployments may require a non-null room_id; use first room if available.
        first_room = session.exec(select(Room).limit(1)).first()
        room_id = first_room.id if first_room is not None else None
        tenant = Tenant(
            organization_id=org_id,
            user_id=user.id,
            name=TENANT_FULL_NAME,
            email=TENANT_EMAIL,
            room_id=room_id,
        )
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        created_tenant = True

    return {
        "user": user,
        "tenant": tenant,
        "created_user": created_user,
        "created_creds": created_creds,
        "created_tenant": created_tenant,
        "updated_password": updated_password,
    }


def ensure_landlord(session):
    """Ensure landlord portal user + Landlord record + credentials exist, and password is set."""
    created_user = False
    created_landlord = False
    created_creds = False
    updated_password = False

    org = get_or_create_default_organization(session)
    org_id = str(org.id)

    user = session.exec(
        select(User).where(
            User.organization_id == org_id,
            User.email == LANDLORD_EMAIL,
        )
    ).first()
    if user is None:
        user = User(
            organization_id=org_id,
            email=LANDLORD_EMAIL,
            full_name=LANDLORD_FULL_NAME,
            role=UserRole.landlord,
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        created_user = True

    creds = session.exec(select(UserCredentials).where(UserCredentials.user_id == user.id)).first()
    new_hash = hash_password(LANDLORD_PASSWORD)
    if creds is None:
        creds = UserCredentials(
            user_id=user.id,
            password_hash=new_hash,
            password_algo="bcrypt",
        )
        session.add(creds)
        created_creds = True
        updated_password = True
    else:
        creds.password_hash = new_hash
        updated_password = True
    session.commit()

    landlord = session.exec(select(Landlord).where(Landlord.user_id == str(user.id))).first()
    if landlord is None:
        landlord = Landlord(
            organization_id=str(user.organization_id),
            user_id=user.id,
            contact_name=LANDLORD_FULL_NAME,
            email=LANDLORD_EMAIL,
            status="active",
        )
        session.add(landlord)
        session.commit()
        session.refresh(landlord)
        created_landlord = True

    return {
        "user": user,
        "landlord": landlord,
        "created_user": created_user,
        "created_creds": created_creds,
        "created_landlord": created_landlord,
        "updated_password": updated_password,
    }


def main() -> None:
    db_url = os.environ.get("DATABASE_URL", "").strip()
    if not db_url:
        print("ERROR: DATABASE_URL is not set. Point it at the Render production database and rerun.")
        return

    session = get_session()
    try:
        print("Seeding production portal users (tenant + landlord) ...")

        tenant_result = ensure_tenant(session)
        landlord_result = ensure_landlord(session)

        print("\n--- Tenant portal user ---")
        if tenant_result["created_user"]:
            print("Tenant user created.")
        else:
            print("Tenant user already existed.")
        if tenant_result["created_creds"]:
            print("Tenant credentials created.")
        else:
            print("Tenant credentials already existed.")
        if tenant_result["updated_password"]:
            print("Tenant password updated to test value.")
        if tenant_result["created_tenant"]:
            print("Tenant record created and linked to user.")
        else:
            print("Tenant record already linked to user.")
        print(f"Tenant email: {TENANT_EMAIL}")
        print(f"Tenant user id: {tenant_result['user'].id}")
        print(f"Tenant id: {tenant_result['tenant'].id}")

        print("\n--- Landlord portal user ---")
        if landlord_result["created_user"]:
            print("Landlord user created.")
        else:
            print("Landlord user already existed.")
        if landlord_result["created_creds"]:
            print("Landlord credentials created.")
        else:
            print("Landlord credentials already existed.")
        if landlord_result["updated_password"]:
            print("Landlord password updated to test value.")
        if landlord_result["created_landlord"]:
            print("Landlord record created and linked to user.")
        else:
            print("Landlord record already linked to user.")
        print(f"Landlord email: {LANDLORD_EMAIL}")
        print(f"Landlord user id: {landlord_result['user'].id}")
        print(f"Landlord id: {landlord_result['landlord'].id}")

        print("\nDone. Script is idempotent; re-running will not create duplicates.")
    finally:
        session.close()


if __name__ == "__main__":
    main()

