import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from db.database import engine
from sqlalchemy import text
with engine.connect() as c:
    r = c.execute(text(
        "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE conrelid = 'users'::regclass AND contype = 'c'"
    ))
    for row in r:
        print("Constraint:", row[0])
        print("Definition:", row[1])
