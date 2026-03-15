import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from db.database import engine
from sqlalchemy import text
for t in ["tenancies", "invoices"]:
    with engine.connect() as c:
        r = c.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name = :t ORDER BY ordinal_position"),
            {"t": t},
        )
        names = [row[0] for row in r]
    print(t + " columns:", names)
