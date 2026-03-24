# DEPRECATED: Uses legacy tenancy columns (start_date, end_date, monthly_rent). Safe to remove after later legacy cleanup.
"""
DEPRECATED — Do not use.

This script inserts tenancies with the old schema (start_date, end_date, monthly_rent,
billing_cycle). The current Tenancy model uses move_in_date, move_out_date, monthly_rent, status.
Running this against the current database will fail or corrupt data.

Use the admin API to create tenancies and POST /api/admin/invoices/generate for invoices.
"""
from sqlalchemy import text
from db.database import get_session


def seed_billing_data():
    session = get_session()

    try:
        # optional: alte Testdaten löschen
        session.execute(text("""
            DELETE FROM tenancies
            WHERE status = 'active'
              AND billing_cycle = 'monthly'
              AND monthly_rent IN (900, 1200, 1500)
        """))

        # neue Test-Tenancies einfügen
        session.execute(text("""
            INSERT INTO tenancies (start_date, end_date, monthly_rent, billing_cycle, status)
            VALUES
                ('2026-02-01', NULL, 900, 'monthly', 'active'),
                ('2026-01-15', NULL, 1200, 'monthly', 'active'),
                ('2026-03-01', NULL, 1500, 'monthly', 'active')
        """))

        session.commit()
        print("Test-Tenancies wurden erfolgreich erstellt.")

    except Exception as e:
        session.rollback()
        print("Fehler beim Einfügen der Testdaten:")
        print(e)

    finally:
        session.close()


if __name__ == "__main__":
    seed_billing_data()