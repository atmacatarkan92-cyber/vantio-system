"""
Shared organization onboarding for the CLI script and platform-admin API.

Single source of truth for slug normalization, idempotency, org creation,
and optional first org admin (no credential overwrite).

RLS note: create_initial_org_admin applies org GUC for the new org. Platform API
create uses one transaction (org + admin + credentials) so partial writes roll back
together. If RLS policies on ``users`` / ``organization`` tighten, keep this path
consistent with apply_pg_organization_context usage.
"""

from __future__ import annotations

import re
import uuid as uuid_mod
from dataclasses import dataclass
from getpass import getpass
from typing import Optional

from sqlalchemy import func
from sqlalchemy import inspect as sa_inspect
from sqlmodel import Session, select

from auth.security import hash_password, password_meets_policy_for_new_account
from db.models import Organization, User, UserCredentials, UserRole
from db.rls import apply_pg_organization_context


class OrganizationDuplicateError(Exception):
    """Strict create: an organization already matches slug or unique name."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class OrganizationNameAmbiguousError(Exception):
    """More than one organization shares the same display name (data issue)."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


@dataclass
class PlatformCreateOrganizationResult:
    organization: Organization
    organization_created: bool
    admin_created: bool
    message: str


def normalize_slug(raw: str) -> str:
    s = raw.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def validate_slug_format(slug: str) -> None:
    """Raise ValueError if slug is empty or invalid (lowercase letters, digits, hyphens)."""
    if not slug:
        raise ValueError("Organization slug is empty after normalization.")
    if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", slug):
        raise ValueError(
            "Organization slug must contain only lowercase letters, digits, and single hyphens."
        )


def organization_slug_column_exists(session: Session) -> bool:
    try:
        return bool(sa_inspect(session.bind).has_column("organization", "slug"))
    except Exception:
        return False


def get_org_by_slug(session: Session, slug: str) -> Organization | None:
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
    commit_after_organization: bool = True,
    reject_duplicate: bool = False,
) -> tuple[Optional[Organization], str, bool]:
    """
    Find or create an organization.

    Third return value is True iff a new organization row was inserted in this call.

    When reject_duplicate is True (platform API), an existing match raises OrganizationDuplicateError
    instead of returning the existing row.

    Script mode uses reject_duplicate=False and commit_after_organization=True after each write.
    """
    if use_slug and slug:
        existing = get_org_by_slug(session, slug)
        if existing:
            if reject_duplicate:
                raise OrganizationDuplicateError(
                    "Organization already exists (same slug)."
                )
            return existing, "Organization already exists (same slug).", False
        if not apply:
            return (
                None,
                f"Would create organization: slug={slug!r} name={organization_name!r}",
                False,
            )
        org = Organization(name=organization_name, slug=slug)
        session.add(org)
        session.flush()
        session.refresh(org)
        if commit_after_organization:
            session.commit()
            session.refresh(org)
        return org, f"Organization created (id={org.id}).", True

    rows = get_orgs_by_exact_name(session, organization_name)
    if len(rows) > 1:
        msg = (
            "ERROR: Multiple organizations share the exact same name "
            f"{organization_name!r}; resolve duplicates, pass --organization-slug, or use --organization-id."
        )
        raise OrganizationNameAmbiguousError(msg)
    if len(rows) == 1:
        if reject_duplicate:
            raise OrganizationDuplicateError(
                "Organization already exists (same name)."
            )
        return rows[0], "Organization already exists (same name).", False
    if not apply:
        return None, f"Would create organization: name={organization_name!r}", False
    org = Organization(name=organization_name)
    session.add(org)
    session.flush()
    session.refresh(org)
    if commit_after_organization:
        session.commit()
        session.refresh(org)
    return org, f"Organization created (id={org.id}).", True


def create_initial_org_admin(
    session: Session,
    *,
    apply: bool,
    org_id: str,
    admin_email: str,
    admin_password: Optional[str],
    commit: bool = True,
    prompt_for_password_if_missing: bool = True,
) -> str:
    """
    Create org-scoped admin user + credentials. Never overwrites existing users/credentials.
    Returns a single human-readable status line.
    """
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
        if prompt_for_password_if_missing:
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
    if commit:
        session.commit()
    else:
        session.flush()
    return f"Admin user created (id={user.id})."


def platform_create_organization_with_optional_admin(
    session: Session,
    *,
    organization_name: str,
    organization_slug: Optional[str],
    create_admin: bool,
    admin_email: Optional[str],
    admin_password: Optional[str],
) -> PlatformCreateOrganizationResult:
    """
    Platform API path: one logical transaction — new organization row plus optional org
    admin + credentials commit together, or nothing persists (duplicate org still raises
    before commit). Duplicate email in-org: no password overwrite (existing user path).

    The CLI script uses get_or_create_organization / create_initial_org_admin with its
    own commits for dry-run / idempotent UX; do not change script behavior from here.
    """
    name = organization_name.strip()
    if not name:
        raise ValueError("organization_name is required.")

    slug_col = organization_slug_column_exists(session)
    slug_norm: Optional[str] = None
    if organization_slug and organization_slug.strip():
        if not slug_col:
            raise ValueError(
                "organization.slug is not available in this database; omit organization_slug."
            )
        slug_norm = normalize_slug(organization_slug)
        validate_slug_format(slug_norm)

    if create_admin:
        if not admin_email or not str(admin_email).strip():
            raise ValueError("admin_email is required when create_admin is true.")
        pwd = admin_password if admin_password is not None else ""
        if not str(pwd).strip():
            raise ValueError("admin_password is required when create_admin is true.")
        if not password_meets_policy_for_new_account(str(pwd).strip()):
            raise ValueError("admin_password does not meet password policy.")

    use_slug = bool(slug_norm) and slug_col

    with session.begin():
        org, org_msg, organization_created = get_or_create_organization(
            session,
            apply=True,
            organization_name=name,
            slug=slug_norm,
            use_slug=use_slug,
            commit_after_organization=False,
            reject_duplicate=True,
        )

        admin_created = False
        admin_line = ""
        if create_admin:
            assert admin_email is not None
            admin_line = create_initial_org_admin(
                session,
                apply=True,
                org_id=str(org.id),
                admin_email=admin_email,
                admin_password=admin_password,
                commit=False,
                prompt_for_password_if_missing=False,
            )
            admin_created = admin_line.startswith("Admin user created")

    session.refresh(org)

    parts = [org_msg]
    if admin_line:
        parts.append(admin_line)
    return PlatformCreateOrganizationResult(
        organization=org,
        organization_created=organization_created,
        admin_created=admin_created,
        message=" ".join(parts),
    )


def resolve_existing_organization_by_id(
    session: Session,
    *,
    organization_id: str,
    slug_norm: Optional[str],
    slug_col: bool,
    apply: bool,
) -> tuple[Organization, list[str]]:
    """
    Used by CLI when --organization-id is set. Returns org and printed status lines.
    """
    try:
        uuid_mod.UUID(organization_id)
    except ValueError as e:
        raise ValueError("--organization-id must be a valid UUID.") from e
    org = session.get(Organization, organization_id)
    if org is None:
        raise ValueError(f"No organization with id={organization_id}.")
    lines: list[str] = []
    if slug_norm is not None:
        if org.slug and org.slug != slug_norm:
            raise ValueError(
                f"Organization slug in DB ({org.slug!r}) does not match "
                f"--organization-slug ({slug_norm!r})."
            )
        if apply and org.slug is None and slug_col:
            org.slug = slug_norm
            session.add(org)
            session.commit()
            session.refresh(org)
            lines.append(f"Slug set on organization (id={org.id}).")
        else:
            lines.append(f"Using existing organization (id={org.id}).")
    else:
        lines.append(f"Using existing organization (id={org.id}).")
    return org, lines
