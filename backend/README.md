# Vantio backend (FeelAtHomeNow)

Python FastAPI application. Dependencies are listed in `requirements.txt`.

## Development tooling

### Ruff (lint + format)

Configuration lives in `pyproject.toml`. Pyflakes (`F`) and isort (`I`) are enforced; Alembic migrations are excluded. From this directory:

```bash
pip install -r requirements.txt
ruff check .
ruff format .
```

Optional: run `ruff check --fix` on paths you are editing. A full-tree fix is not required for day-to-day work.

### Dev setup (pre-commit)

```bash
pip install pre-commit
pre-commit install
```

- Ruff runs automatically on **commit**, on **staged/changed files only** (not the whole repo).
- The hook uses `--fix` for safe auto-fixes (e.g. import sorting) and `ruff-format` for formatting of those files.
- There is **no** enforced global “format the entire codebase” step; legacy issues elsewhere do not block commits on unrelated changes.

To run hooks manually on all files (e.g. before a release):

```bash
pre-commit run --all-files
```

See `scripts/README.md` for database scripts and operational notes.
