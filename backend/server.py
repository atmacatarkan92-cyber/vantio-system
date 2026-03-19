import os
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone, date

from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, Query, Depends, Header, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy import text
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from models import (
    Apartment,
    ApartmentCreate,
    ContactInquiry,
    ContactInquiryCreate,
    ContactResponse,
)

from email_service import send_contact_notification, EmailServiceError
from db.database import get_session, engine
from db.models import Inquiry, Listing, Unit
from auth.routes import router as auth_router
from auth.dependencies import get_current_organization, require_roles
from auth.security import validate_auth_config
from app.core.rate_limit import limiter
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
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

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


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        # Basic clickjacking / MIME sniffing / referrer / permissions protections
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=()"

        # Content Security Policy: restrict sources while allowing required integrations
        csp = (
            "default-src 'self'; "
            "img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "connect-src 'self' https://*.onrender.com https://*.vercel.app https://*.sentry.io https://sentry.io; "
            "font-src 'self' data: https://cdn.jsdelivr.net; "
            "frame-ancestors 'none';"
        )
        response.headers["Content-Security-Policy"] = csp

        # Only send HSTS in production (HTTPS termination in front of the app)
        if os.environ.get("ENVIRONMENT") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response

api_router = APIRouter(prefix="/api")

NOTIFICATION_EMAIL = os.environ.get("NOTIFICATION_EMAIL", "info@feelathomenow.ch")


# ==================== Health & Readiness ====================

@api_router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "feelathomenow-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@api_router.get("/ready")
async def readiness_check():
    """For orchestrators: 503 if PostgreSQL is configured but down."""
    checks = {}
    if engine:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            checks["postgres"] = True
        except Exception as e:
            logger.warning("PostgreSQL readiness failed: %s", e)
            checks["postgres"] = False
    all_ok = all(checks.values()) if checks else True
    status = 200 if all_ok else 503
    return JSONResponse(
        status_code=status,
        content={"ready": all_ok, "checks": checks},
    )


# ==================== Contact Form API ====================

@api_router.post("/contact", response_model=ContactResponse)
def submit_contact(
    inquiry: ContactInquiryCreate,
    background_tasks: BackgroundTasks,
):
    """
    Public contact intake (unauthenticated). Persists Inquiry rows without organization_id;
    not mixed into org-scoped admin listings. See GET /api/admin/inquiries for org filtering.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Service temporarily unavailable.")
    session = get_session()
    try:
        obj = Inquiry(
            name=inquiry.name,
            email=inquiry.email,
            message=inquiry.message,
            phone=inquiry.phone or None,
            company=inquiry.company or None,
            language=inquiry.language or "de",
            apartment_id=inquiry.apartment_id,
        )
        session.add(obj)
        session.commit()
        session.refresh(obj)
        inquiry_id = obj.id
        background_tasks.add_task(send_email_notification_sync, inquiry_id)
        return ContactResponse(
            success=True,
            message="Vielen Dank für Ihre Anfrage. Wir melden uns bald bei Ihnen.",
        )
    finally:
        session.close()


def send_email_notification_sync(inquiry_id: str):
    """Background task: send notification email and mark inquiry.email_sent in PostgreSQL."""
    if engine is None:
        return
    session = get_session()
    try:
        inquiry = session.get(Inquiry, inquiry_id)
        if not inquiry:
            return
        try:
            send_contact_notification(
                recipient_email=NOTIFICATION_EMAIL,
                contact_name=inquiry.name,
                contact_email=inquiry.email,
                contact_phone=inquiry.phone or "",
                contact_company=inquiry.company or "",
                contact_message=inquiry.message,
                language=inquiry.language or "de",
            )
            inquiry.email_sent = True
            session.add(inquiry)
            session.commit()
        except EmailServiceError as e:
            logger.error(str(e))
    finally:
        session.close()


# ==================== Admin API ====================

@api_router.get("/admin/inquiries", response_model=List[dict])
def get_inquiries(
    _: None = Depends(require_roles("admin", "manager")),
    org_id: str = Depends(get_current_organization),
):
    """
    Organization-scoped: only inquiries linked to a listing whose unit belongs to the
    current admin/manager organization (Inquiry.apartment_id -> Listing -> Unit).
    Rows with apartment_id NULL are omitted here (public intake only; not attributed to an org).
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="PostgreSQL is not configured.")
    session = get_session()
    try:
        from sqlmodel import select
        stmt = (
            select(Inquiry)
            .join(Listing, Inquiry.apartment_id == Listing.id)
            .join(Unit, Listing.unit_id == Unit.id)
            .where(Unit.organization_id == org_id)
            .order_by(Inquiry.created_at.desc())
            .limit(500)
        )
        rows = session.exec(stmt).all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "email": r.email,
                "message": r.message,
                "phone": r.phone,
                "company": r.company,
                "language": r.language,
                "apartment_id": r.apartment_id,
                "email_sent": r.email_sent,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    finally:
        session.close()


# ==================== App Setup ====================

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

app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"^https://feel-at-home-now-website-v2-[a-z0-9]+\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
app.include_router(api_router)


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