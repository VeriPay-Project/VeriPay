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
def landing_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns aggregate counts scoped to the authenticated user.
    Requires a valid session — not publicly accessible.
    """
    total_invoices = db.query(Invoice).filter(Invoice.user_id == user.id).count()
    total_vendors = db.query(Vendor).filter(Vendor.user_id == user.id).count()

    return {
        "total_invoices": total_invoices,
        "total_vendors": total_vendors,
        "fraud_signals": 0  # temporary
    }