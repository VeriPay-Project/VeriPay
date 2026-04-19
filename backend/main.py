import asyncio
from contextlib import contextmanager
import logging
import os
import re
import sys
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from conn_db import engine, DATABASE_URL
from limiter import limiter

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# ──────────────────────────────────────────────
# IMPORT ROUTERS
# ──────────────────────────────────────────────
from routers import vendor as vendor_router
from routers import invoice as invoice_router
from routers import auth as auth_router
from routers import dashboard, stats, files as files_router, audit as audit_router
from routers import review as review_router
from routers import layoutlm_training as layoutlm_training_router
from routers.auth import forgot_password

# ──────────────────────────────────────────────
# IMPORT MODELS (FOR create_all / METADATA)
# ──────────────────────────────────────────────
from models.user import User  # noqa: F401
from models.vendor import Vendor  # noqa: F401
from models.invoice import Invoice  # noqa: F401
from models.analysis_result import AnalysisResult  # noqa: F401
from models.vendor_bank_binding import VendorBankBinding  # noqa: F401
from models.audit_log import AuditLog  # noqa: F401
from models.review import InvoiceReview  # noqa: F401


# ──────────────────────────────────────────────
# ENVIRONMENT & SECRETS VALIDATION  (Fix 3)
# ──────────────────────────────────────────────
VERIPAY_ENV = os.getenv("VERIPAY_ENV", "development").lower()
IS_PRODUCTION = VERIPAY_ENV == "production"

_DEV_DEFAULTS = {
    "SESSION_SECRET":   "dev-secret-change-me",
    "BANK_HASH_SECRET": "dev-bank-secret",
}

_REQUIRED_VARS = ["SESSION_SECRET", "BANK_HASH_SECRET", "DATABASE_URL"]


def _validate_secrets() -> None:
    """
    Enforce that all required secrets are set and not placeholder values.
    In production: abort startup on any violation.
    In development: log warnings but allow startup.
    """
    violations = []

    for var in _REQUIRED_VARS:
        value = os.getenv(var)
        if not value:
            violations.append(f"  {var} is not set.")
            continue
        default = _DEV_DEFAULTS.get(var)
        if default and value == default:
            violations.append(
                f"  {var} is still set to the dev default '{default}'. "
                "Set a strong random value."
            )

    if not violations:
        return

    msg = "SECRETS VALIDATION FAILED:\n" + "\n".join(violations)
    if IS_PRODUCTION:
        logger.critical(msg)
        logger.critical("Refusing to start in production mode with insecure secrets.")
        sys.exit(1)
    else:
        logger.warning(msg)
        logger.warning(
            "Running in development mode — startup allowed. "
            "Set VERIPAY_ENV=production to enforce strict secret validation."
        )


_validate_secrets()


# ──────────────────────────────────────────────
# SESSION CONFIG  (Fix 4)
# ──────────────────────────────────────────────
SESSION_SECRET = os.getenv("SESSION_SECRET")
if not SESSION_SECRET:
    raise RuntimeError("SESSION_SECRET environment variable is required")

SESSION_MAX_AGE = int(os.getenv("SESSION_MAX_AGE", "28800"))   # 8 hours default
SESSION_HTTPS_ONLY = IS_PRODUCTION                              # True in prod, False in dev
MODEL_WARMUP_ENABLED = os.getenv("MODEL_WARMUP_ENABLED", "1").strip().lower() not in {
    "0", "false", "no", "off",
}
WARMUP_LOCK_ID = 9025001

if not SESSION_HTTPS_ONLY and IS_PRODUCTION:
    logger.warning(
        "https_only=False but VERIPAY_ENV=production. "
        "Sessions will not be protected by Secure cookie flag."
    )


# ──────────────────────────────────────────────
# SECURITY HEADERS MIDDLEWARE  (Fix 5)
# ──────────────────────────────────────────────
CSP = os.getenv(
    "CONTENT_SECURITY_POLICY",
    (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self'; "
        "connect-src 'self' http://localhost:8000; "
        "frame-ancestors 'none'"
    )
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"]  = "nosniff"
        response.headers["X-Frame-Options"]          = "DENY"
        response.headers["X-XSS-Protection"]         = "1; mode=block"
        response.headers["Referrer-Policy"]           = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"]        = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"]   = CSP
        if SESSION_HTTPS_ONLY:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        return response


# ──────────────────────────────────────────────
# CREATE APP
# ──────────────────────────────────────────────
app = FastAPI(title="VeriPay API")

# Attach limiter to app state so SlowAPIMiddleware can find it  (Fix 1)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ──────────────────────────────────────────────
# DIRECTORIES
# ──────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(BASE_DIR, "preview_cache"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "uploads", "rendered"), exist_ok=True)


# ──────────────────────────────────────────────
# MIDDLEWARE  (order matters: outermost first)
# ──────────────────────────────────────────────
app.add_middleware(SecurityHeadersMiddleware)       # Fix 5 — security headers

app.add_middleware(SlowAPIMiddleware)               # Fix 1 — rate limiting

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,                     # Fix 3 — no fallback default
    same_site="lax",
    https_only=SESSION_HTTPS_ONLY,                 # Fix 4 — env-driven
    max_age=SESSION_MAX_AGE,                       # Fix 4 — 8-hour expiry
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# DB CONNECTION CHECK
# ──────────────────────────────────────────────
safe_url = re.sub(r"(postgresql://[^:]+:)([^@]+)(@)", r"\1***\3", DATABASE_URL)
logger.info("Connecting to database: %s", safe_url)

try:
    with engine.connect() as conn:
        logger.info("Database connection successful.")
except Exception as e:
    logger.error("Database connection failed: %s", e)


# ──────────────────────────────────────────────
# DATABASE MIGRATIONS (Alembic)
# ──────────────────────────────────────────────
from alembic.config import Config as AlembicConfig
from alembic import command as alembic_command

def _run_migrations() -> None:
    """Apply any pending Alembic migrations on startup."""
    alembic_cfg = AlembicConfig(
        os.path.join(os.path.dirname(__file__), "alembic.ini")
    )
    alembic_cfg.set_main_option(
        "script_location",
        os.path.join(os.path.dirname(__file__), "alembic"),
    )
    alembic_command.upgrade(alembic_cfg, "head")
    logger.info("Alembic migrations applied (upgrade to head).")

_run_migrations()


@contextmanager
def _try_advisory_lock(lock_id: int, label: str):
    """
    Best-effort PostgreSQL advisory lock.
    Lets only one worker run heavy startup work.
    """
    connection = engine.connect()
    acquired = False
    try:
        acquired = bool(
            connection.execute(
                text("SELECT pg_try_advisory_lock(:lock_id)"),
                {"lock_id": lock_id},
            ).scalar()
        )
        if not acquired:
            logger.info("%s skipped in this worker; another worker owns the lock.", label)
            yield False
            return
        yield True
    finally:
        if acquired:
            connection.execute(
                text("SELECT pg_advisory_unlock(:lock_id)"),
                {"lock_id": lock_id},
            )
        connection.close()


# ──────────────────────────────────────────────
# ROUTERS
# ──────────────────────────────────────────────
app.include_router(auth_router.router)
app.include_router(vendor_router.router)
app.include_router(invoice_router.router)
app.include_router(forgot_password.router)
app.include_router(dashboard.router)
app.include_router(stats.router)
app.include_router(files_router.router)   # authenticated file serving (Fix 6)
app.include_router(audit_router.router)   # audit trail read endpoint (Fix 7)
app.include_router(review_router.router)  # human review/decision system
app.include_router(layoutlm_training_router.router)  # supervised LayoutLMv3 training


# ──────────────────────────────────────────────
# MODEL WARM-UP ON STARTUP  (Fix 8)
# ──────────────────────────────────────────────
@app.on_event("startup")
async def warm_up_models():
    """Pre-load heavy models so the first real request isn't slow."""
    if not MODEL_WARMUP_ENABLED:
        logger.info("Model warm-up disabled by MODEL_WARMUP_ENABLED.")
        return

    with _try_advisory_lock(WARMUP_LOCK_ID, "Model warm-up") as acquired:
        if not acquired:
            return

        total_start = time.perf_counter()

        try:
            t0 = time.perf_counter()
            from ai_pipeline.advanced.layoutlm_features import processor, model  # noqa: F401
            logger.info("LayoutLMv3 warm-up complete (%.2fs)", time.perf_counter() - t0)
        except Exception as exc:
            logger.warning("LayoutLMv3 warm-up failed (non-fatal): %s", exc)

        # Donut warm-up removed — using Ollama for extraction now.

        try:
            t0 = time.perf_counter()
            from services.analysis_service import _load_detector
            _load_detector()
            logger.info("IsolationForest warm-up complete (%.2fs)", time.perf_counter() - t0)
        except Exception as exc:
            logger.warning("IsolationForest warm-up failed (non-fatal): %s", exc)

        logger.info("All model warm-ups finished (%.2fs total)", time.perf_counter() - total_start)


# ──────────────────────────────────────────────
# ROOT
# ──────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "VeriPay backend running"}
