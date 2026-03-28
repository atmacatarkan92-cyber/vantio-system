# FeelAtHomeNow — Testing

Minimal test foundation for backend (pytest + FastAPI TestClient) and frontend (Jest + React Testing Library). No production secrets required; critical paths covered first.

---

## Backend tests

### Setup

- **pytest** with `backend/pytest.ini` (testpaths: `tests`, addopts: `-v --tb=short`).
- **conftest.py** sets `SECRET_KEY` for the test run so the app starts without a real `.env`. No `DATABASE_URL` is set so the app runs with no DB; tests that need landlord/tenant data use **dependency overrides** and a **mock session** (no test database required).

### Run

From project root:

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

Run only critical-path tests:

```bash
pytest tests/test_critical_paths.py -v
```

### What is covered

1. **Health** — `GET /api/health` returns 200 and `status: "healthy"`.
2. **Auth / role protection** — Unauthenticated request to `/api/landlord/properties` returns 401. With dependency override, an authenticated landlord gets 200 and a scoped list. Non-landlord role (simulated via override) gets 403.
3. **Landlord scoping** — `GET /api/landlord/properties` returns only properties whose `landlord_id` matches the authenticated landlord (fixture + mock session).
4. **Tenant / landlord boundary** — Tenant user (via override) cannot access landlord endpoint (403). Landlord user (via override) cannot access tenant-only endpoint (403).

### Assumptions

- **No test database.** Landlord and tenant success paths use `app.dependency_overrides` for `get_current_landlord` / `get_current_user` and a small **MockSession** that returns fixture data for `session.exec(...).all()`.
- **SECRET_KEY** must be set (conftest sets a test value so no production secrets are needed).
- Existing **test_apartments_contacts.py** still uses `requests` and a live server (`REACT_APP_API_URL`); it is unchanged and can be run separately against a running API.

---

## Frontend tests

### Setup

- **Jest** (via CRA/craco) with **React Testing Library** and **@testing-library/jest-dom**.
- **setupTests.js** in `frontend/src` imports `@testing-library/jest-dom` for DOM matchers.
- DevDependencies: `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`.

### Run

From project root:

```bash
cd frontend
npm ci
npm test -- --watchAll=false
```

Run only landlord-related tests:

```bash
npm test -- --watchAll=false --testPathPattern="landlord"
```

### What is covered

1. **Protected landlord routes** — Unauthenticated visit to `/landlord/properties` redirects to `/landlord/login` (LandlordLayout + mock `useAuth`).
2. **Landlord login role guard** — When `getMe()` resolves with a non-landlord role, the page shows an error and does not navigate to `/landlord` (mock `api/auth`).
3. **Landlord overview page** — Renders loading state; renders summary (profile + counts) when API succeeds; renders error state when API fails (mock `landlordApi`).
4. **Landlord properties page** — Renders empty state when API returns `[]`; renders property rows when data exists (mock `landlordApi`).

### Assumptions

- **API and auth are mocked.** No real backend or auth server is required. `jest.mock("../../../api/landlordApi")` and `jest.mock("../../../api/auth")` / `jest.mock("../../../contexts/AuthContext")` are used as needed.
- Tests are **behavior-focused** (redirects, visible text, loading/error/success states); no broad snapshot tests.

---

## CI

- **Backend:** `pytest tests/test_critical_paths.py -v` runs after the import check (with `SECRET_KEY` set).
- **Frontend:** `npm test -- --watchAll=false --testPathPattern="landlord"` runs before the build.

See `.github/workflows/ci.yml`.

---

## What to add next

- **Backend:** Integration tests against a test database (e.g. PostgreSQL in CI) for full auth and scoping; more endpoints (tenant, admin) as needed.
- **Frontend:** Tests for tenant portal (protected routes, login role guard, overview/invoices); admin flows if needed; optional E2E with Playwright/Cypress later.
