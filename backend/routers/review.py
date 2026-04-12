from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from conn_db import get_db
from dependencies import get_current_user
from models.invoice import Invoice
from models.review import InvoiceReview
from models.user import User
from services.audit_service import log_event

router = APIRouter(prefix="/invoices", tags=["Reviews"])

ALLOWED_DECISIONS = {"approved", "rejected", "flagged_for_investigation", "escalated"}
ALLOWED_CONFIDENCE = {"certain", "likely", "uncertain"}


class ReviewRequest(BaseModel):
    decision: str
    confidence: str | None = None
    description: str

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ALLOWED_DECISIONS:
            raise ValueError(f"decision must be one of: {', '.join(sorted(ALLOWED_DECISIONS))}")
        return v

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip().lower()
        if v not in ALLOWED_CONFIDENCE:
            raise ValueError(f"confidence must be one of: {', '.join(sorted(ALLOWED_CONFIDENCE))}")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("description must be at least 10 characters")
        return v


class ReviewResponse(BaseModel):
    id: int
    invoice_id: int
    user_id: int
    reviewer_name: str | None = None
    decision: str
    confidence: str | None
    description: str
    reviewed_at: datetime
    updated_at: datetime


@router.post("/{invoice_id}/review")
def create_or_update_review(
    invoice_id: int,
    body: ReviewRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.user_id == user.id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    review = db.query(InvoiceReview).filter(
        InvoiceReview.invoice_id == invoice_id,
    ).first()

    if review:
        review.decision = body.decision
        review.confidence = body.confidence
        review.description = body.description
        review.user_id = user.id
        review.updated_at = datetime.utcnow()
    else:
        review = InvoiceReview(
            invoice_id=invoice_id,
            user_id=user.id,
            decision=body.decision,
            confidence=body.confidence,
            description=body.description,
        )
        db.add(review)

    invoice.status = "reviewed"

    log_event(
        db, action="review_invoice", user_id=user.id,
        resource_type="invoice", resource_id=str(invoice_id),
        details={"decision": body.decision, "description": body.description},
    )

    db.commit()
    db.refresh(review)

    return ReviewResponse(
        id=review.id,
        invoice_id=review.invoice_id,
        user_id=review.user_id,
        reviewer_name=user.full_name,
        decision=review.decision,
        confidence=review.confidence,
        description=review.description,
        reviewed_at=review.reviewed_at,
        updated_at=review.updated_at,
    )


@router.get("/{invoice_id}/review")
def get_review(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.user_id == user.id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    review = db.query(InvoiceReview).filter(
        InvoiceReview.invoice_id == invoice_id,
    ).first()
    if not review:
        raise HTTPException(status_code=404, detail="No review found for this invoice")

    reviewer = db.query(User).filter(User.id == review.user_id).first()

    return ReviewResponse(
        id=review.id,
        invoice_id=review.invoice_id,
        user_id=review.user_id,
        reviewer_name=reviewer.full_name if reviewer else None,
        decision=review.decision,
        confidence=review.confidence,
        description=review.description,
        reviewed_at=review.reviewed_at,
        updated_at=review.updated_at,
    )
