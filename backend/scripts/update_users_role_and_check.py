"""One-off: check users.role type, add enum value if needed, UPDATE role, report."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from db.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    r = conn.execute(text(
        "SELECT data_type, udt_name FROM information_schema.columns "
        "WHERE table_name = 'users' AND column_name = 'role'"
    ))
    row = r.fetchone()
    print("users.role data_type, udt_name:", row)

# If column is enum, add 'admin' (and other allowed) to the enum so UPDATE works
with engine.connect() as conn:
    for val in ["admin", "manager", "landlord", "tenant", "support"]:
        try:
            conn.execute(text(f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{val}'"))
            conn.commit()
        except Exception as e:
            print("Note:", e)
            conn.rollback()

with engine.connect() as conn:
    r = conn.execute(text("UPDATE users SET role = 'admin' WHERE role = 'platform_admin'"))
    conn.commit()
    updated = r.rowcount
print("Rows updated:", updated)

with engine.connect() as conn:
    r = conn.execute(text("SELECT DISTINCT role FROM users ORDER BY role"))
    roles = [row[0] for row in r]
print("SELECT DISTINCT role FROM users ORDER BY role:", roles)
