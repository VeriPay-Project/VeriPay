from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from schemas.auth import RegisterRequest
from conn_db import get_db
from services.auth.register_service import register_user
from limiter import limiter
from services.audit_service import log_event
from datetime import date
import re

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register")
@limiter.limit("5/hour")
def register(
    request: Request,
    data: RegisterRequest,
    db: Session = Depends(get_db)
):
    # ─────────────────────────────
    # BACKEND VALIDATION
    # ─────────────────────────────

    # Email validation
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", data.email):
        raise HTTPException(status_code=400, detail="Invalid email format")

    # Full name validation
    if not data.full_name or len(data.full_name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Full name must be at least 2 characters")

    # Password validation (same as frontend)
    password = data.password
    if (
        len(password) < 8
        or not re.search(r"[A-Z]", password)
        or not re.search(r"[a-z]", password)
        or not re.search(r"[0-9]", password)
        or not re.search(r"[^A-Za-z0-9]", password)
    ):
        raise HTTPException(
            status_code=400,
            detail="Password must be 8+ chars with upper, lower, number, special character"
        )

    # Confirm DOB is valid and not future
    if data.date_of_birth >= date.today():
        raise HTTPException(
            status_code=400,
            detail="Date of birth cannot be in the future"
        )

    # Security question
    if not data.security_question:
        raise HTTPException(
            status_code=400,
            detail="Security question is required"
        )

    # Security answer
    if not data.security_answer or len(data.security_answer.strip()) < 2:
        raise HTTPException(
            status_code=400,
            detail="Security answer must be at least 2 characters"
        )

    # ─────────────────────────────
    # CREATE USER
    # ─────────────────────────────
    user = register_user(
        db,
        data.email,
        data.password,
        data.full_name,
        data.date_of_birth,
        data.security_question,
        data.security_answer,
    )

    if not user:
        raise HTTPException(status_code=400, detail="User already exists")

    log_event(
        db,
        action="registration",
        user_id=user.id,
        resource_type="user",
        resource_id=str(user.id),
        request=request
    )

    db.commit()

    return {"message": "User registered"}
