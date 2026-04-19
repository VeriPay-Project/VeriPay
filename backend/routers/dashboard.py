from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, desc, String, case
from conn_db import get_db
from integrity.vendor_bank_service import verify_vendor_bank_account
from models.invoice import Invoice
from models.vendor import Vendor
from models.analysis_result import AnalysisResult
from models.review import InvoiceReview
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

    # ── Single query: invoice counts via conditional aggregation ──
    inv_stats = (
        db.query(
            func.count(Invoice.invoice_id).label("total"),
            func.count(case(
                (Invoice.created_at >= week_ago, Invoice.invoice_id),
            )).label("this_week"),
            func.count(case(
                ((Invoice.created_at >= two_weeks_ago) & (Invoice.created_at < week_ago), Invoice.invoice_id),
            )).label("last_week"),
        )
        .filter(Invoice.user_id == user.id)
        .one()
    )

    total_invoices = inv_stats.total or 0
    this_week = inv_stats.this_week or 0
    last_week = inv_stats.last_week or 0
    week_trend = this_week - last_week

    # ── Single query: analysis aggregates via conditional aggregation ──
    analysis_stats = (
        db.query(
            func.count(AnalysisResult.id).label("total_analyses"),
            func.count(case(
                (AnalysisResult.confidence >= 0.7, AnalysisResult.id),
            )).label("high_risk"),
            func.count(case(
                (AnalysisResult.confidence < 0.4, AnalysisResult.id),
            )).label("trusted"),
            func.avg(AnalysisResult.confidence).label("avg_conf"),
        )
        .join(Invoice, Invoice.invoice_id == AnalysisResult.invoice_id)
        .filter(Invoice.user_id == user.id)
        .one()
    )

    high_risk = analysis_stats.high_risk or 0
    avg_confidence = analysis_stats.avg_conf or 0
    total_analyses = analysis_stats.total_analyses or 1
    trusted_count = analysis_stats.trusted or 0
    trusted_percent = round((trusted_count / total_analyses) * 100)

    # ── Review stats via conditional aggregation ──
    review_stats = (
        db.query(
            func.count(InvoiceReview.id).label("total_reviewed"),
            func.count(case(
                (InvoiceReview.decision == "approved", InvoiceReview.id),
            )).label("total_approved"),
            func.count(case(
                (InvoiceReview.decision == "rejected", InvoiceReview.id),
            )).label("total_rejected"),
        )
        .join(Invoice, Invoice.invoice_id == InvoiceReview.invoice_id)
        .filter(Invoice.user_id == user.id)
        .one()
    )

    total_reviewed = review_stats.total_reviewed or 0
    total_pending_review = total_invoices - total_reviewed

    return {
        "total_invoices": total_invoices,
        "this_week": this_week,
        "week_trend": week_trend,
        "high_risk": high_risk,
        "trusted_percent": trusted_percent,
        "avg_confidence": round(avg_confidence, 2),
        "total_reviewed": total_reviewed,
        "total_pending_review": total_pending_review,
        "total_approved": review_stats.total_approved or 0,
        "total_rejected": review_stats.total_rejected or 0,
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
        db.query(Invoice, AnalysisResult, Vendor, InvoiceReview)
        .outerjoin(Vendor, Invoice.vendor_id == Vendor.vendor_id)
        .join(subquery, Invoice.invoice_id == subquery.c.invoice_id)
        .join(
            AnalysisResult,
            (AnalysisResult.invoice_id == subquery.c.invoice_id)
            & (AnalysisResult.created_at == subquery.c.latest_analysis),
        )
        .outerjoin(InvoiceReview, InvoiceReview.invoice_id == Invoice.invoice_id)
        .filter(Invoice.user_id == user.id)
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
            "review_status": review.decision if review else ("pending_review" if invoice.status == "analyzed" else None),
            "fraud_score": analysis.fraud_score,
            "risk_level": analysis.risk_level,
        }
        for invoice, analysis, vendor, review in results
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
        db.query(Invoice, AnalysisResult, Vendor, InvoiceReview)
        .outerjoin(Vendor, Invoice.vendor_id == Vendor.vendor_id)
        .join(subquery, Invoice.invoice_id == subquery.c.invoice_id)
        .join(
            AnalysisResult,
            (AnalysisResult.invoice_id == subquery.c.invoice_id)
            & (AnalysisResult.created_at == subquery.c.latest_analysis),
        )
        .outerjoin(InvoiceReview, InvoiceReview.invoice_id == Invoice.invoice_id)
        .filter(Invoice.user_id == user.id)
    )

    if search:
        query = query.filter(
            (func.cast(Invoice.invoice_id, String).ilike(f"%{search}%")) |
            (Vendor.vendor_name.ilike(f"%{search}%"))
        )

    results = (
        query.order_by(desc(Invoice.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    data = []
    for invoice, analysis, vendor, review in results:
        data.append({
            "invoice_id": invoice.invoice_id,
            "issuer": vendor.vendor_name if vendor else "Unknown Vendor",
            "confidence": analysis.confidence,
            "created_at": invoice.created_at,
            "review_status": review.decision if review else ("pending_review" if invoice.status == "analyzed" else None),
            "fraud_score": analysis.fraud_score,
            "risk_level": analysis.risk_level,
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

    review = db.query(InvoiceReview).filter(
        InvoiceReview.invoice_id == invoice_id,
    ).first()

    review_data = None
    if review:
        reviewer = db.query(User).filter(User.id == review.user_id).first()
        review_data = {
            "id": review.id,
            "decision": review.decision,
            "confidence": review.confidence,
            "description": review.description,
            "reviewer_name": reviewer.full_name if reviewer else None,
            "reviewed_at": review.reviewed_at,
            "updated_at": review.updated_at,
        }

    return {
        "invoice_id": invoice.invoice_id,
        "file_type": "pdf",
        "crypto": analysis.crypto_json,
        "vendor_bank": vendor_bank,
        "ai": analysis.ai_json,
        "rules": analysis.rules_json,
        "external_verification": external_verification,
        "semantic": semantic,
        "confidence": analysis.confidence,
        "prediction": analysis.prediction,
        "created_at": analysis.created_at,
        "fraud_score": analysis.fraud_score,
        "risk_level": analysis.risk_level,
        "review": review_data,
    }
