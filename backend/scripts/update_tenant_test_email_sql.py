"""
One-off: run SQL to update tenant test email from .local to .com.
Shows exact SQL and rows affected. No migration.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")
from sqlalchemy import create_engine, text

OLD_EMAIL = "tenant-test@feelathomenow.local"
NEW_EMAIL = "tenant-test@feelathomenow-test.com"

url = os.environ.get("DATABASE_URL", "postgresql+psycopg2://postgres:postgres1905@localhost:5432/feelathomenow")
engine = create_engine(url)

statements = [
    ("users", "UPDATE users SET email = :new_email WHERE email = :old_email"),
    ("tenant", "UPDATE tenant SET email = :new_email WHERE email = :old_email"),
]

params = {"old_email": OLD_EMAIL, "new_email": NEW_EMAIL}

print("--- Exact SQL UPDATE statements ---")
for name, sql in statements:
    print(f"-- {name}")
    print(sql.replace(":new_email", repr(NEW_EMAIL)).replace(":old_email", repr(OLD_EMAIL)))
    print()

print("--- Execution and rows affected ---")
with engine.connect() as conn:
    for name, sql in statements:
        result = conn.execute(text(sql), params)
        conn.commit()
        rows = result.rowcount
        print(f"{name}: {rows} row(s) affected")
