# GitHub Actions PostgreSQL backups

The scheduled backup workflow (`.github/workflows/backup.yml`) requires a GitHub Actions secret:

- **`BACKUP_DATABASE_URL`** — Connection string for a **dedicated** database role used only for backups.

That role must be able to dump all tables your disaster-recovery policy requires (often via `BYPASSRLS` or a superuser, per your security standards).

**Do not** use the normal application `DATABASE_URL` for backups if the app user is subject to row-level security: `pg_dump` would fail or produce incomplete dumps without changing RLS, policies, or tenant isolation.

**Do not** weaken RLS, remove `FORCE ROW LEVEL SECURITY`, or relax policies to “fix” backups—grant a separate backup-capable user instead.
