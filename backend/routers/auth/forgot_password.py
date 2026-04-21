from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from conn_db import get_db
from models.user import User
from schemas.auth.forgot_password import (
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from utils.security import verify_password, hash_password
from limiter import limiter
from services.audit_service import log_event

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/forgot-password")
@limiter.limit("3/hour")
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.security_question:
        raise HTTPException(
            status_code=400, detail="No security question set for this account"
        )

    return {"security_question": user.security_question}


@router.post("/reset-password")
@limiter.limit("3/hour")
def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(
        payload.security_answer.lower().strip(),
        user.security_answer_hash,
    ):
        raise HTTPException(status_code=400, detail="Incorrect answer")

    user.hashed_password = hash_password(payload.new_password)
    db.add(user)
    log_event(db, action="password_reset", user_id=user.id,
              resource_type="user", resource_id=str(user.id), request=request)
    db.commit()

    return {"message": "Password reset successful"}