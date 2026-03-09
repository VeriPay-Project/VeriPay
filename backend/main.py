from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import os
import re
from conn_db import engine, Base, DATABASE_URL
from routers import vendor as vendor_router
from routers import invoice as invoice_router
from routers import auth as auth_router
from models.user import User  # noqa: F401
from models.vendor import Vendor  # noqa: F401
from models.invoice import Invoice  # noqa: F401
from models.analysis_result import AnalysisResult  # noqa: F401
from models.vendor_bank_binding import VendorBankBinding  # noqa: F401

import os

print("========== DB CONFIG ==========")
print("DB_HOST:", os.getenv("DB_HOST"))
print("DB_NAME:", os.getenv("DB_NAME"))
print("================================")

app = FastAPI(title="VeriPay API")

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "dev-secret-change-me"),
    same_site="lax",
    https_only=False,  # set True in production
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

safe_database_url = re.sub(r"(postgresql://[^:]+:)([^@]+)(@)", r"\1***\3", DATABASE_URL)
print(f"DATABASE_URL={safe_database_url}")
print(f"DB_HOST={os.getenv('DB_HOST')}")
print(f"DB_PORT={os.getenv('DB_PORT')}")

try:
    with engine.connect() as conn:
        print("Database connection successful")
except Exception as e:
    print("Database connection failed:", e)

Base.metadata.create_all(bind=engine)

# ✅ INCLUDE ALL ROUTERS
app.include_router(auth_router.router)
app.include_router(vendor_router.router)
app.include_router(invoice_router.router)

@app.get("/")
def root():
    return {"status": "VeriPay backend running"}
