from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from dependencies import get_db, get_current_user
from models.invoice import Invoice
from models.vendor import Vendor
from models.user import User

router = APIRouter(
    prefix="/stats",
    tags=["Stats"]
)

@router.get("/landing")
def landing_stats(db: Session = Depends(get_db)):
    total_invoices = db.query(Invoice).count()
    total_vendors = db.query(Vendor).count()

    fraud_signals = db.query(Invoice).filter(
        Invoice.crypto_valid == False
    ).count()

    return {
        "total_invoices": total_invoices,
        "total_vendors": total_vendors,
        "fraud_signals": fraud_signals,
    }