import os
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from db.database import engine
from db.rls import OrgContextMiddleware
from auth.routes import router as auth_router
from auth.security import validate_auth_config
from app.core.rate_limit import limiter
from app.core.request_logging import (
    RequestLoggingMiddleware,
    install_request_context_filter,
)
from app.core.security_headers_middleware import SecurityHeadersMiddleware
from app.api.v1.routes_health import router as health_router
from app.api.v1.routes_contact import router as contact_router
from app.api.v1.routes_apartments import router as apartments_router
from app.api.v1.routes_admin_listings import router as admin_listings_router
from app.api.v1.routes_admin_units import router as admin_units_router
from app.api.v1.routes_admin_rooms import router as admin_rooms_router
from app.api.v1.routes_admin_tenants import router as admin_tenants_router
from app.api.v1.routes_admin_tenancies import router as admin_tenancies_router
from app.api.v1.routes_admin_dashboard import router as admin_dashboard_router
from app.api.v1.routes_admin_landlords import router as admin_landlords_router
from app.api.v1.routes_admin_properties import router as admin_properties_router
from app.api.v1.routes_admin_users import router as admin_users_router
from app.api.v1.routes_invoices import router as invoices_router
from app.api.v1.routes_tenant import router as tenant_router
from app.api.v1.routes_landlord import router as landlord_router


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

_ENV = os.environ.get("ENVIRONMENT", "development")

# Optional Sentry (only if SENTRY_DSN is set)
_sentry_dsn = os.environ.get("SENTRY_DSN", "").strip()
if _sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    sentry_sdk.init(
        dsn=_sentry_dsn,
        integrations=[FastApiIntegration()],
        environment=os.environ.get("ENVIRONMENT", "development"),
        release=os.environ.get("RELEASE_VERSION"),
        traces_sample_rate=0.1,
    )

# ==================== Logging ====================

logging.basicConfig(
    level=logging.INFO,
    format=(
        "%(asctime)s - %(name)s - %(levelname)s - "
        "request_id=%(request_id)s org_id=%(org_id)s user_id=%(user_id)s - %(message)s"
    ),
)

install_request_context_filter()

logger = logging.getLogger(__name__)

# ==================== FastAPI App ====================

app = FastAPI(
    title="FeelAtHomeNow API",
    description="API for FeelAtHomeNow apartment rental platform",
    version="1.0.0",
    docs_url="/docs" if _ENV != "production" else None,
    redoc_url="/redoc" if _ENV != "production" else None,
    openapi_url="/openapi.json" if _ENV != "production" else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def custom_openapi():
    if app.openapi_schema is not None:
        return app.openapi_schema
    from fastapi.openapi.utils import get_openapi
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    # JWT Bearer: Swagger UI "Authorize" uses this (type http, scheme bearer, bearerFormat JWT)
    components = openapi_schema.setdefault("components", {})
    schemes = components.setdefault("securitySchemes", {})
    if "HTTPBearer" in schemes:
        schemes["HTTPBearer"]["bearerFormat"] = "JWT"
        schemes["HTTPBearer"].setdefault("description", "JWT from POST /auth/login")
    else:
        schemes["HTTPBearer"] = {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT access token from POST /auth/login",
        }
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi


# CORS: explicit origins (required when allow_credentials=True; "*" is invalid with credentials)
_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "https://feel-at-home-now-website-v2-fqd9e5due.vercel.app",
    "https://feel-at-home-now-website-v2.vercel.app",
]
_cors_origins_env = os.environ.get("CORS_ORIGINS", "").strip()
_frontend_url = os.environ.get("FRONTEND_URL", "").strip()
if _cors_origins_env:
    CORS_ORIGINS = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
else:
    CORS_ORIGINS = _DEV_ORIGINS.copy()
    if _frontend_url and _frontend_url not in CORS_ORIGINS:
        CORS_ORIGINS.append(_frontend_url)

# First registered = innermost: request_id + lifecycle logs wrap the app directly so
# org/user ContextVars are still set when the response returns (before OrgContext reset).
app.add_middleware(RequestLoggingMiddleware)

app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"^https://feel-at-home-now-website-v2-[a-z0-9]+\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Last registered = outermost: reset tenant ContextVar before each request (RLS session context).
app.add_middleware(OrgContextMiddleware)


app.include_router(auth_router)
app.include_router(invoices_router)
app.include_router(apartments_router)
app.include_router(admin_listings_router)
app.include_router(admin_units_router)
app.include_router(admin_rooms_router)
app.include_router(admin_tenants_router)
app.include_router(admin_tenancies_router)
app.include_router(admin_dashboard_router)
app.include_router(admin_landlords_router)
app.include_router(admin_properties_router)
app.include_router(admin_users_router)
app.include_router(tenant_router)
app.include_router(landlord_router)
app.include_router(health_router)
app.include_router(contact_router)


@app.on_event("startup")
async def startup_event():
    logger.info("Starting FeelAtHomeNow API...")
    validate_auth_config()  # Refuse to start if SECRET_KEY is not set
    # Production: schema is managed by Alembic only; skip create_db() to avoid "relation already exists"
    if engine is not None and os.environ.get("ENVIRONMENT") != "production":
        from db.database import create_db
        create_db()


if __name__ == "__main__":

    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
