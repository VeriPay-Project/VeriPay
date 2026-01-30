import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))
    
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from conn_db import engine, Base
from routers import vendor as vendor_router
from routers import invoice as invoice_router
from routers import auth as auth_router


app = FastAPI(title="VeriPay API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

# ✅ INCLUDE ALL ROUTERS
app.include_router(auth_router.router)
app.include_router(vendor_router.router)
app.include_router(invoice_router.router)

@app.get("/")
def root():
    return {"status": "VeriPay backend running"}
