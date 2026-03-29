from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

import os
import re

from conn_db import engine, Base, DATABASE_URL

# ──────────────────────────────────────────────
# IMPORT ROUTERS
# ──────────────────────────────────────────────
from routers import vendor as vendor_router
from routers import invoice as invoice_router
from routers import auth as auth_router
from routers import dashboard, stats
from routers.auth import forgot_password

# ──────────────────────────────────────────────
# IMPORT MODELS (FOR ALEMBIC / METADATA)
# ──────────────────────────────────────────────
from models.user import User  # noqa: F401
from models.vendor import Vendor  # noqa: F401
from models.invoice import Invoice  # noqa: F401
from models.analysis_result import AnalysisResult  # noqa: F401
from models.vendor_bank_binding import VendorBankBinding  # noqa: F401


# ──────────────────────────────────────────────
# DEBUG DB CONFIG
# ──────────────────────────────────────────────
print("========== DB CONFIG ==========")
print("DB_HOST:", os.getenv("DB_HOST"))
print("DB_NAME:", os.getenv("DB_NAME"))
print("================================")


# ──────────────────────────────────────────────
# CREATE APP
# ──────────────────────────────────────────────
app = FastAPI(title="VeriPay API")


# ──────────────────────────────────────────────
# STATIC FILE SERVING (🔥 CRITICAL FIX)
# ──────────────────────────────────────────────
# These MUST come AFTER app creation

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PREVIEW_CACHE_DIR = os.path.join(BASE_DIR, "preview_cache")
RENDERED_DIR = os.path.join(BASE_DIR, "uploads", "rendered")

os.makedirs(PREVIEW_CACHE_DIR, exist_ok=True)
os.makedirs(RENDERED_DIR, exist_ok=True)

app.mount("/preview_cache", StaticFiles(directory=PREVIEW_CACHE_DIR), name="preview_cache")
app.mount("/rendered", StaticFiles(directory=RENDERED_DIR), name="rendered")


# ──────────────────────────────────────────────
# MIDDLEWARE
# ──────────────────────────────────────────────
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "dev-secret-change-me"),
    same_site="lax",
    https_only=False,  # change to True in production
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# DB CONNECTION CHECK
# ──────────────────────────────────────────────
safe_database_url = re.sub(r"(postgresql://[^:]+:)([^@]+)(@)", r"\1***\3", DATABASE_URL)
print(f"DATABASE_URL={safe_database_url}")
print(f"DB_HOST={os.getenv('DB_HOST')}")
print(f"DB_PORT={os.getenv('DB_PORT')}")

try:
    with engine.connect() as conn:
        print("Database connection successful")
except Exception as e:
    print("Database connection failed:", e)


# ──────────────────────────────────────────────
# CREATE TABLES
# ──────────────────────────────────────────────
Base.metadata.create_all(bind=engine)


# ──────────────────────────────────────────────
# ROUTERS
# ──────────────────────────────────────────────
app.include_router(auth_router.router)
app.include_router(vendor_router.router)
app.include_router(invoice_router.router)
app.include_router(forgot_password.router)
app.include_router(dashboard.router)
app.include_router(stats.router)


# ──────────────────────────────────────────────
# ROOT
# ──────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "VeriPay backend running"}
