"""One-off: print tenancies and invoices column names from live DB."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")
from sqlalchemy import create_engine, text

url = os.environ.get("DATABASE_URL", "postgresql+psycopg2://postgres:postgres1905@localhost:5432/feelathomenow")
engine = create_engine(url)
with engine.connect() as c:
    r = c.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'tenancies' ORDER BY ordinal_position"))
    print("tenancies columns:", [row[0] for row in r])
    r2 = c.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'invoices' ORDER BY ordinal_position"))
    print("invoices columns:", [row[0] for row in r2])
