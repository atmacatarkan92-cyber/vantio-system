import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from db.database import engine

router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "feelathomenow-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/ready")
async def readiness_check():
    """For orchestrators: 503 if PostgreSQL is configured but down."""
    checks = {}
    if engine:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            checks["postgres"] = True
        except Exception as e:
            logger.error("PostgreSQL readiness failed: %s", e, exc_info=True)
            checks["postgres"] = False
    all_ok = all(checks.values()) if checks else True
    status = 200 if all_ok else 503
    return JSONResponse(
        status_code=status,
        content={"ready": all_ok, "checks": checks},
    )
