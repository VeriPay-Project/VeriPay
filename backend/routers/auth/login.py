import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from schemas.auth import LoginRequest
from services.auth.login_service import authenticate_user
from conn_db import get_db
from dependencies import get_current_user
from models.user import User
from models.invoice import Invoice
from models.analysis_result import AnalysisResult
from models.vendor import Vendor
from models.vendor_bank_binding import VendorBankBinding
from models.audit_log import AuditLog
from schemas.auth.profile import UpdateMeRequest, MeResponse, ChangePasswordRequest
from utils.security import verify_password, hash_password
from limiter import limiter
from services.audit_service import log_event

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/login")
@limiter.limit("5/minute")
def login(
    request: Request,
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    user = authenticate_user(db, data.email, data.password)
    if not user:
        log_event(db, action="login_failure", details={"email": data.email}, request=request)
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # 🔐 FORCE SESSION CREATION
    request.session.clear()
    request.session["user_id"] = user.id

    log_event(db, action="login_success", user_id=user.id,
              resource_type="user", resource_id=str(user.id), request=request)
    db.commit()

    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
        },
    }


@router.post("/logout")
def logout(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    log_event(db, action="logout", user_id=user.id,
              resource_type="user", resource_id=str(user.id), request=request)
    db.commit()
    request.session.clear()
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=MeResponse)
def update_me(
    payload: UpdateMeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()

    if payload.email is not None and payload.email != user.email:
        existing = db.query(User).filter(User.email == payload.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = payload.email

    if payload.date_of_birth is not None:
        user.date_of_birth = payload.date_of_birth

    db.add(user)
    db.commit()
    return user


@router.patch("/change-password")
def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify current password
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(
            status_code=400, detail="Current password is incorrect")

    # Prevent reusing same password
    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(
            status_code=400, detail="New password must be different")

    # Hash new password
    user.hashed_password = hash_password(payload.new_password)

    db.add(user)
    log_event(db, action="password_change", user_id=user.id,
              resource_type="user", resource_id=str(user.id), request=request)
    db.commit()

    return {"message": "Password updated successfully"}

@router.get("/check-email")
def check_email(email: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    existing = db.query(User).filter(User.email == email).first()

    if existing and existing.id != user.id:
        return {"exists": True}

    return {"exists": False}

@router.delete("/delete-account")
def delete_account(
    request: Request,
    security_answer: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # verify security answer
    normalized_answer = security_answer.strip().lower()
    if not verify_password(normalized_answer, user.security_answer_hash):
        raise HTTPException(status_code=400, detail="Incorrect security answer")

    owned_invoices = db.query(Invoice).filter(Invoice.user_id == user.id).all()
    invoice_ids = [invoice.invoice_id for invoice in owned_invoices]
    invoice_paths = [invoice.file_path for invoice in owned_invoices if invoice.file_path]

    if invoice_ids:
        db.query(AnalysisResult).filter(
            AnalysisResult.invoice_id.in_(invoice_ids)
        ).delete(synchronize_session=False)

    vendor_ids = [
        vendor_id
        for (vendor_id,) in db.query(Vendor.vendor_id).filter(Vendor.user_id == user.id).all()
    ]
    if vendor_ids:
        db.query(VendorBankBinding).filter(
            VendorBankBinding.vendor_id.in_(vendor_ids)
        ).delete(synchronize_session=False)

    user_id = user.id
    log_event(db, action="account_deleted", user_id=user_id,
              resource_type="user", resource_id=str(user_id), request=request)
    db.flush()
    db.query(AuditLog).filter(AuditLog.user_id == user_id).update(
        {AuditLog.user_id: None},
        synchronize_session=False,
    )
    db.delete(user)
    db.commit()

    for file_path in invoice_paths:
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as exc:
                logger.warning("Failed to remove invoice file %s: %s", file_path, exc)

    return {"message": "Account deleted successfully"}
