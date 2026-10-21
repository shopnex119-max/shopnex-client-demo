from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.accounting import router as accounting_router
from app.api.admin import router as admin_router
from app.api.admin_users import router as admin_users_router
from app.api.auth import router as auth_router
from app.api.modules import router as modules_router
from app.api.operations import router as operations_router
from app.api.purchasing import router as purchasing_router
from app.api.shifts import router as shifts_router
from app.api.zatca import router as zatca_router
from app.api.zatca_qr import router as zatca_qr_router
from app.core.config import settings
from app.db.session import SessionLocal

app = FastAPI(
    title="SHOPNEX Local API",
    version="0.6.0",
    description="Local-first business API with local users and role-based permissions.",
    docs_url="/docs",
    redoc_url="/redoc",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Company-ID"],
)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(admin_router, prefix=settings.api_prefix)
app.include_router(admin_users_router, prefix=settings.api_prefix)
app.include_router(accounting_router, prefix=settings.api_prefix)
app.include_router(modules_router, prefix=settings.api_prefix)
app.include_router(operations_router, prefix=settings.api_prefix)
app.include_router(purchasing_router, prefix=settings.api_prefix)
app.include_router(shifts_router, prefix=settings.api_prefix)
app.include_router(zatca_router, prefix=settings.api_prefix)
app.include_router(zatca_qr_router, prefix=settings.api_prefix)


@app.get("/api/health", tags=["System"])
def health():
    database = "disconnected"
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        database = "connected"
    except Exception:
        pass
    return {"status": "ok", "database": database, "integration_mode": settings.integration_mode}
