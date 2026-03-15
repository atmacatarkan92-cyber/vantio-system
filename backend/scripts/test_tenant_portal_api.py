"""
One-off script to test tenant portal API: obtain JWT for tenant test user, then call
GET /api/tenant/me, /api/tenant/tenancies, /api/tenant/invoices.
Uses FastAPI TestClient. If POST /auth/login works (email passes EmailStr), use it;
otherwise issue token directly for user 4ead0991-7730-44bd-81da-be609fe2d1bc (tenant role).
"""
import os
import sys
from getpass import getpass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.chdir(ROOT)
# Ensure SECRET_KEY for JWT (server loads .env which may not have it)
if not os.environ.get("SECRET_KEY"):
    os.environ["SECRET_KEY"] = "test-secret-for-tenant-portal-api-test-only"

# Tenant test user id (role=tenant)
TENANT_USER_ID = "4ead0991-7730-44bd-81da-be609fe2d1bc"

def main():
    from fastapi.testclient import TestClient
    from server import app
    from auth.security import create_access_token

    client = TestClient(app)
    headers = None

    # Try login first (may fail 422 if email is .local and EmailStr rejects it)
    password = os.environ.get("TENANT_TEST_PASSWORD", "").strip()
    if not password:
        password = getpass("Tenant test password (optional, press Enter to use direct JWT): ")
    if password:
        print("--- POST /auth/login ---")
        r = client.post(
            "/auth/login",
            json={"email": "tenant-test@feelathomenow-test.com", "password": password},
        )
        print("Status:", r.status_code)
        print("Response:", r.json())
        if r.status_code == 200 and r.json().get("access_token"):
            headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
            print("(Using token from login)")
    if not headers:
        print("(Login not used or failed; issuing JWT directly for tenant user id)")
        token = create_access_token({"sub": TENANT_USER_ID, "role": "tenant"})
        headers = {"Authorization": f"Bearer {token}"}

    # 2. GET /api/tenant/me
    print("\n--- GET /api/tenant/me ---")
    r = client.get("/api/tenant/me", headers=headers)
    print("Status:", r.status_code)
    print("Response:", r.json())

    # 3. GET /api/tenant/tenancies
    print("\n--- GET /api/tenant/tenancies ---")
    r = client.get("/api/tenant/tenancies", headers=headers)
    print("Status:", r.status_code)
    print("Response:", r.json())

    # 4. GET /api/tenant/invoices
    print("\n--- GET /api/tenant/invoices ---")
    r = client.get("/api/tenant/invoices", headers=headers)
    print("Status:", r.status_code)
    print("Response:", r.json())

if __name__ == "__main__":
    main()
