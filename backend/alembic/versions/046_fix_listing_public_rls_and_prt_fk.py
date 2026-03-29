"""Fix public read for published listings under RLS; CASCADE delete for password_reset_tokens.

Revision ID: 046_fix_listing_public_rls_and_prt_fk
Revises: 045_rls_listings_ext

1) listings / listing_images / listing_amenities: The published branch previously used
   EXISTS(... unit ...) which is evaluated under unit RLS, so without org GUC the unit
   subquery returned no rows. Published path now uses listings.is_published only (listings
   policy) or a listings-only EXISTS (children), avoiding unit in the public branch.

2) password_reset_tokens.user_id: ON DELETE CASCADE so user removal does not fail when
   tokens remain (FK lifecycle matches user ownership).

Downgrade restores 045 policy text and non-CASCADE FK.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "046_fix_listing_public_rls_and_prt_fk"
down_revision: Union[str, None] = "045_rls_listings_ext"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # --- listings: public read without unit subquery (unit RLS hid rows) ---
    conn.execute(text("DROP POLICY IF EXISTS listings_org_or_published ON listings"))
    conn.execute(
        text(
            """
            CREATE POLICY listings_org_or_published ON listings FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM unit u
                    WHERE u.id = listings.unit_id
                    AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
                OR (listings.is_published = true)
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM unit u
                    WHERE u.id = listings.unit_id
                    AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
            )
            """
        )
    )

    # --- listing_images ---
    conn.execute(text("DROP POLICY IF EXISTS listing_images_org_or_published ON listing_images"))
    conn.execute(
        text(
            """
            CREATE POLICY listing_images_org_or_published ON listing_images FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM listings l
                    INNER JOIN unit u ON u.id = l.unit_id
                    WHERE l.id = listing_images.listing_id
                    AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
                OR EXISTS (
                    SELECT 1 FROM listings l
                    WHERE l.id = listing_images.listing_id
                    AND l.is_published = true
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM listings l
                    INNER JOIN unit u ON u.id = l.unit_id
                    WHERE l.id = listing_images.listing_id
                    AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
            )
            """
        )
    )

    # --- listing_amenities ---
    conn.execute(text("DROP POLICY IF EXISTS listing_amenities_org_or_published ON listing_amenities"))
    conn.execute(
        text(
            """
            CREATE POLICY listing_amenities_org_or_published ON listing_amenities FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM listings l
                    INNER JOIN unit u ON u.id = l.unit_id
                    WHERE l.id = listing_amenities.listing_id
                    AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
                OR EXISTS (
                    SELECT 1 FROM listings l
                    WHERE l.id = listing_amenities.listing_id
                    AND l.is_published = true
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM listings l
                    INNER JOIN unit u ON u.id = l.unit_id
                    WHERE l.id = listing_amenities.listing_id
                    AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
            )
            """
        )
    )

    # --- FK: delete tokens when user row is deleted ---
    conn.execute(
        text(
            """
            ALTER TABLE password_reset_tokens
            DROP CONSTRAINT IF EXISTS password_reset_tokens_user_id_fkey
            """
        )
    )
    conn.execute(
        text(
            """
            ALTER TABLE password_reset_tokens
            ADD CONSTRAINT password_reset_tokens_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(
        text(
            """
            ALTER TABLE password_reset_tokens
            DROP CONSTRAINT IF EXISTS password_reset_tokens_user_id_fkey
            """
        )
    )
    conn.execute(
        text(
            """
            ALTER TABLE password_reset_tokens
            ADD CONSTRAINT password_reset_tokens_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id)
            """
        )
    )

    conn.execute(text("DROP POLICY IF EXISTS listing_amenities_org_or_published ON listing_amenities"))
    conn.execute(
        text(
            """
            CREATE POLICY listing_amenities_org_or_published ON listing_amenities FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM listings l
                    INNER JOIN unit u ON u.id = l.unit_id
                    WHERE l.id = listing_amenities.listing_id
                    AND (
                        u.organization_id::text = current_setting('app.current_organization_id', true)
                        OR (l.is_published = true)
                    )
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM listings l
                    INNER JOIN unit u ON u.id = l.unit_id
                    WHERE l.id = listing_amenities.listing_id
                    AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
            )
            """
        )
    )

    conn.execute(text("DROP POLICY IF EXISTS listing_images_org_or_published ON listing_images"))
    conn.execute(
        text(
            """
            CREATE POLICY listing_images_org_or_published ON listing_images FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM listings l
                    INNER JOIN unit u ON u.id = l.unit_id
                    WHERE l.id = listing_images.listing_id
                    AND (
                        u.organization_id::text = current_setting('app.current_organization_id', true)
                        OR (l.is_published = true)
                    )
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM listings l
                    INNER JOIN unit u ON u.id = l.unit_id
                    WHERE l.id = listing_images.listing_id
                    AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
            )
            """
        )
    )

    conn.execute(text("DROP POLICY IF EXISTS listings_org_or_published ON listings"))
    conn.execute(
        text(
            """
            CREATE POLICY listings_org_or_published ON listings FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM unit u
                    WHERE u.id = listings.unit_id
                    AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
                OR (
                    listings.is_published = true
                    AND EXISTS (SELECT 1 FROM unit u WHERE u.id = listings.unit_id)
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM unit u
                    WHERE u.id = listings.unit_id
                    AND u.organization_id::text = current_setting('app.current_organization_id', true)
                )
            )
            """
        )
    )
