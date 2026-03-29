from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, desc, String
from conn_db import get_db
from integrity.vendor_bank_service import verify_vendor_bank_account
from models.invoice import Invoice
from models.vendor import Vendor
from models.analysis_result import AnalysisResult
from datetime import datetime, timedelta
from dependencies import get_current_user
from models.user import User
from services.iban_registry_service import verify_iban_external

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    # Total invoices
    total_invoices = (
        db.query(func.count(Invoice.invoice_id))
        .filter(Invoice.user_id == user.id)
        .scalar()
        or 0
    )

    # This week invoices
    this_week = (
        db.query(func.count(Invoice.invoice_id))
        .filter(
            Invoice.user_id == user.id,
            Invoice.created_at >= week_ago
        )
        .scalar()
        or 0
    )

    # Last week invoices
    last_week = (
        db.query(func.count(Invoice.invoice_id))
        .filter(
            Invoice.user_id == user.id,
            Invoice.created_at >= two_weeks_ago,
            Invoice.created_at < week_ago,
        )
        .scalar()
        or 0
    )

    week_trend = this_week - last_week

    # High risk
    high_risk = (
        db.query(func.count(AnalysisResult.id))
        .join(Invoice, Invoice.invoice_id == AnalysisResult.invoice_id)
        .filter(
            Invoice.user_id == user.id,
            AnalysisResult.confidence >= 0.7)
        .scalar()
        or 0
    )

    # Avg confidence
    avg_confidence = (
        db.query(func.avg(AnalysisResult.confidence))
        .join(Invoice, Invoice.invoice_id == AnalysisResult.invoice_id)
        .filter(Invoice.user_id == user.id)
        .scalar()
        or 0
    )

    # Trusted % (confidence < 0.4)
    total_analyses = (
        db.query(func.count(AnalysisResult.id))
        .join(Invoice, Invoice.invoice_id == AnalysisResult.invoice_id)
        .filter(Invoice.user_id == user.id)
        .scalar()
        or 1
    )

    trusted_count = (
        db.query(func.count(AnalysisResult.id))
        .join(Invoice, Invoice.invoice_id == AnalysisResult.invoice_id)
        .filter(
            Invoice.user_id == user.id,
            AnalysisResult.confidence < 0.4)
        .scalar()
        or 0
    )

    trusted_percent = round((trusted_count / total_analyses) * 100)

    return {
        "total_invoices": total_invoices,
        "this_week": this_week,
        "week_trend": week_trend,
        "high_risk": high_risk,
        "trusted_percent": trusted_percent,
        "avg_confidence": round(avg_confidence, 2),
    }


@router.get("/recent")
def get_recent_invoices(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    subquery = (
        db.query(
            AnalysisResult.invoice_id,
            func.max(AnalysisResult.created_at).label("latest_analysis"),
        )
        .group_by(AnalysisResult.invoice_id)
        .subquery()
    )

    results = (
        db.query(Invoice, AnalysisResult, Vendor)
        .outerjoin(Vendor, Invoice.vendor_id == Vendor.vendor_id)
        .join(subquery, Invoice.invoice_id == subquery.c.invoice_id)
        .join(
            AnalysisResult,
            (AnalysisResult.invoice_id == subquery.c.invoice_id)
            & (AnalysisResult.created_at == subquery.c.latest_analysis),
        )
        .filter(Invoice.user_id == user.id)   # 🔥 THIS IS KEY
        .order_by(desc(Invoice.created_at))
        .limit(10)
        .all()
    )

    return [
        {
            "invoice_id": invoice.invoice_id,
            "issuer": vendor.vendor_name if vendor else None,
            "status": invoice.status,
            "confidence": analysis.confidence,
            "created_at": invoice.created_at,
        }
        for invoice, analysis, vendor in results
    ]


@router.get("/invoices")
def get_all_invoices(
    page: int = 1,
    limit: int = 20,
    search: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    offset = (page - 1) * limit

    # 🔥 Base query (ONLY current user)
    subquery = (
        db.query(
            AnalysisResult.invoice_id,
            func.max(AnalysisResult.created_at).label("latest_analysis"),
        )
        .group_by(AnalysisResult.invoice_id)
        .subquery()
    )

    query = (
        db.query(Invoice, AnalysisResult, Vendor)
        .outerjoin(Vendor, Invoice.vendor_id == Vendor.vendor_id)
        .join(subquery, Invoice.invoice_id == subquery.c.invoice_id)
        .join(
            AnalysisResult,
            (AnalysisResult.invoice_id == subquery.c.invoice_id)
            & (AnalysisResult.created_at == subquery.c.latest_analysis),
        )
        .filter(Invoice.user_id == user.id)
    )
    
    # 🔍 SEARCH (invoice_id OR vendor_name)
    if search:
        query = query.filter(
            (func.cast(Invoice.invoice_id, String).ilike(f"%{search}%")) |
            (Vendor.vendor_name.ilike(f"%{search}%"))
        )

    # 📦 Pagination + ordering
    results = (
        query.order_by(desc(Invoice.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    # 🧾 Format response
    data = []
    for invoice, analysis, vendor in results:
        data.append({
            "invoice_id": invoice.invoice_id,
            "issuer": vendor.vendor_name if vendor else "Unknown Vendor",
            "confidence": analysis.confidence,
            "created_at": invoice.created_at,
        })

    return data


@router.get("/invoice/{invoice_id}")
def get_invoice_analysis(invoice_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):

    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.user_id == user.id
    ).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    analysis = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.invoice_id == invoice_id)
        .order_by(AnalysisResult.created_at.desc())
        .first()
    )

    if not analysis:
        return {"detail": "No analysis found for this invoice"}

    semantic = analysis.semantic_json if isinstance(analysis.semantic_json, dict) else {}

    bank_account = semantic.get("bank_account")
    country = semantic.get("country")
    account_type = semantic.get("account_type")

    vendor_bank = (
        verify_vendor_bank_account(
            db=db,
            vendor_name=semantic.get("vendor_name"),
            bank_account=bank_account,
            country=country,
            account_type=account_type,
        )
        if semantic
        else None
    )

    external_verification = None
    if bank_account and account_type == "iban" and country == "OTHER":
        external_verification = verify_iban_external(bank_account)

    return {
        "invoice_id": invoice.invoice_id,
        "file_type": "pdf",  # or infer if needed
        "crypto": analysis.crypto_json,
        "vendor_bank": vendor_bank,
        "ai": analysis.ai_json,
        "rules": analysis.rules_json,
        "external_verification": external_verification,
        "semantic": semantic,
        "confidence": analysis.confidence,
        "prediction": analysis.prediction,
        "created_at": analysis.created_at,
    }
