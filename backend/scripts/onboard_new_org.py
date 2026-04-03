"""
Onboard a new organization (and optionally an org admin user).

Uses DATABASE_URL (application role, RLS-aware). Default is dry-run; pass --apply to write.

Run from backend directory:
  python -m scripts.onboard_new_org \\
    --organization-name "Acme GmbH" \\
    --organization-slug acme \\
    --create-admin \\
    --admin-email "admin@acme.com"

  python -m scripts.onboard_new_org ... --apply

Idempotency: by normalized --organization-slug when provided and the organization.slug column
exists; otherwise by exact --organization-name match (see README / migration 062).
"""
from __future__ import annotations

import argparse
import re
import sys
import uuid
from getpass import getpass
from typing import Optional

from sqlalchemy import func, inspect as sa_inspect
from sqlmodel import Session, select

import os

_backend_root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)

from auth.security import hash_password  # noqa: E402
from db.database import get_session  # noqa: E402
from db.models import Organization, User, UserCredentials, UserRole  # noqa: E402
from db.rls import apply_pg_organization_context  # noqa: E402


def normalize_slug(raw: str) -> str:
    s = raw.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def validate_slug(slug: str) -> None:
    if not slug:
        sys.stderr.write("ERROR: --organization-slug is empty after normalization.\n")
        raise SystemExit(2)
    if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", slug):
        sys.stderr.write(
            "ERROR: --organization-slug must contain only lowercase letters, digits, and single hyphens.\n"
        )
        raise SystemExit(2)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Onboard organization (+ optional admin). Default: dry-run (no writes). Use --apply to persist."
    )
    p.add_argument("--organization-name", default=None, help="Display name for the new organization")
    p.add_argument(
        "--organization-slug",
        default=None,
        help="Optional unique slug (e.g. acme). When set and organization.slug exists, used for idempotency.",
    )
    p.add_argument(
        "--organization-id",
        default=None,
        help="Existing organization UUID. Skips org creation; optional slug fill if column is NULL.",
    )
    p.add_argument("--create-admin", action="store_true", help="Create org-scoped admin user")
    p.add_argument("--admin-email", default=None, help="Admin email (required with --create-admin)")
    p.add_argument("--admin-password", default=None, help="Admin password (omit to prompt when --apply)")
    p.add_argument(
        "--apply",
        action="store_true",
        help="Perform database writes. Without this flag, only read checks and planned actions are printed.",
    )
    return p.parse_args()


def organization_slug_column_exists(session: Session) -> bool:
    try:
        return bool(sa_inspect(session.bind).has_column("organization", "slug"))
    except Exception:
        return False


def get_org_by_slug(session: Session, slug: str) -> Optional[Organization]:
    return session.exec(select(Organization).where(Organization.slug == slug)).first()


def get_orgs_by_exact_name(session: Session, name: str) -> list[Organization]:
    return list(session.exec(select(Organization).where(Organization.name == name)).all())


def get_or_create_organization(
    session: Session,
    *,
    apply: bool,
    organization_name: str,
    slug: Optional[str],
    use_slug: bool,
) -> tuple[Optional[Organization], str]:
    """Returns (org or None if dry-run new org, status line). use_slug requires slug non-empty."""
    if use_slug and slug:
        existing = get_org_by_slug(session, slug)
        if existing:
            return existing, "Organization already exists (same slug)."
        if not apply:
            return None, f"Would create organization: slug={slug!r} name={organization_name!r}"
        org = Organization(name=organization_name, slug=slug)
        session.add(org)
        session.commit()
        session.refresh(org)
        return org, f"Organization created (id={org.id})."

    rows = get_orgs_by_exact_name(session, organization_name)
    if len(rows) > 1:
        return None, (
            "ERROR: Multiple organizations share the exact same name "
            f"{organization_name!r}; resolve duplicates, pass --organization-slug, or use --organization-id."
        )
    if len(rows) == 1:
        return rows[0], "Organization already exists (same name)."
    if not apply:
        return None, f"Would create organization: name={organization_name!r}"
    org = Organization(name=organization_name)
    session.add(org)
    session.commit()
    session.refresh(org)
    return org, f"Organization created (id={org.id})."


def create_admin_user(
    session: Session,
    *,
    apply: bool,
    org_id: str,
    admin_email: str,
    admin_password: Optional[str],
) -> str:
    """Returns a single status line. Never overwrites existing credentials."""
    email_norm = admin_email.strip().lower()
    apply_pg_organization_context(session, org_id)
    existing_user = session.exec(
        select(User).where(
            User.organization_id == org_id,
            func.lower(User.email) == email_norm,
        )
    ).first()
    if existing_user:
        return "User already exists (same email in this organization). No password changes."
    if not apply:
        return f"Would create admin user: {email_norm!r} for organization_id={org_id}"
    pwd = admin_password
    if not pwd or not str(pwd).strip():
        pwd = getpass("Admin password: ")
        if not pwd:
            return "ERROR: Password is required for new admin user."
    user = User(
        organization_id=org_id,
        email=email_norm,
        full_name="Organization admin",
        role=UserRole.admin,
        is_active=True,
    )
    session.add(user)
    session.flush()
    session.refresh(user)
    creds = UserCredentials(
        user_id=user.id,
        organization_id=org_id,
        password_hash=hash_password(pwd),
        password_algo="bcrypt",
    )
    session.add(creds)
    session.commit()
    return f"Admin user created (id={user.id})."


def main() -> int:
    args = parse_args()
    org_id_arg = args.organization_id.strip() if args.organization_id else None
    name = args.organization_name.strip() if args.organization_name else None
    slug_raw = args.organization_slug.strip() if args.organization_slug else None

    if org_id_arg:
        if not name:
            name = ""
    else:
        if not name:
            sys.stderr.write(
                "ERROR: --organization-name is required unless --organization-id is set.\n"
            )
            return 2

    if args.create_admin and not args.admin_email:
        sys.stderr.write("ERROR: --create-admin requires --admin-email.\n")
        return 2

    apply = bool(args.apply)
    mode = "[APPLY]" if apply else "[DRY-RUN]"

    try:
        session = get_session()
    except RuntimeError as e:
        sys.stderr.write(f"ERROR: {e}\n")
        return 1

    try:
        print(mode)

        slug_col = organization_slug_column_exists(session)
        slug_norm: Optional[str] = None
        if slug_raw and slug_col:
            slug_norm = normalize_slug(slug_raw)
            validate_slug(slug_norm)
        elif slug_raw and not slug_col:
            sys.stderr.write(
                "WARNING: organization.slug column not found; ignoring --organization-slug "
                "(use exact --organization-name for idempotency).\n"
            )

        # --- Resolve organization ---
        org: Optional[Organization] = None

        if org_id_arg:
            try:
                uuid.UUID(org_id_arg)
            except ValueError:
                sys.stderr.write("ERROR: --organization-id must be a valid UUID.\n")
                return 1
            org = session.get(Organization, org_id_arg)
            if org is None:
                sys.stderr.write(f"ERROR: No organization with id={org_id_arg}.\n")
                return 1
            if slug_norm is not None:
                if org.slug and org.slug != slug_norm:
                    sys.stderr.write(
                        f"ERROR: Organization slug in DB ({org.slug!r}) does not match "
                        f"--organization-slug ({slug_norm!r}).\n"
                    )
                    return 1
                if apply and org.slug is None and slug_col:
                    org.slug = slug_norm
                    session.add(org)
                    session.commit()
                    session.refresh(org)
                    print(f"✔ Slug set on organization (id={org.id}).")
                else:
                    print(f"ℹ Using existing organization (id={org.id}).")
            else:
                print(f"ℹ Using existing organization (id={org.id}).")

        else:
            use_slug = bool(slug_norm) and slug_col
            org, org_msg = get_or_create_organization(
                session,
                apply=apply,
                organization_name=name,
                slug=slug_norm,
                use_slug=use_slug,
            )
            if org_msg.startswith("ERROR"):
                sys.stderr.write(org_msg + "\n")
                return 1
            if "already exists" in org_msg:
                print("ℹ", org_msg)
            elif org_msg.startswith("Would create"):
                print("✔", org_msg)
            else:
                print("✔", org_msg)

        org_id: Optional[str] = str(org.id) if org else None

        if not args.create_admin:
            return 0

        if org is None and not org_id_arg:
            _ae = args.admin_email.strip().lower() if args.admin_email else ""
            print(
                f"✔ Would create admin user: {_ae!r} "
                "(after organization is created; password via prompt or --admin-password with --apply)"
            )
            return 0

        assert org_id is not None
        admin_msg = create_admin_user(
            session,
            apply=apply,
            org_id=org_id,
            admin_email=args.admin_email,
            admin_password=args.admin_password,
        )
        if admin_msg.startswith("ERROR"):
            sys.stderr.write(admin_msg + "\n")
            return 1
        if "already exists" in admin_msg or "No password changes" in admin_msg:
            print("ℹ", admin_msg)
        elif admin_msg.startswith("Would create"):
            print("✔", admin_msg)
        else:
            print("✔", admin_msg)

        return 0
    except Exception as e:
        session.rollback()
        sys.stderr.write(f"ERROR: {e}\n")
        return 1
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
