from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from schemas.auth import RegisterRequest
from conn_db import get_db
from services.auth.register_service import register_user
from limiter import limiter
from services.audit_service import log_event

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register")
@limiter.limit("5/hour")
def register(request: Request, data: RegisterRequest, db: Session = Depends(get_db)):
    user = register_user(db, data.email, data.password, data.full_name, data.date_of_birth,
                         data.security_question, data.security_answer)

    if not user:
        raise HTTPException(status_code=400, detail="User already exists")

    log_event(db, action="registration", user_id=user.id,
              resource_type="user", resource_id=str(user.id), request=request)
    db.commit()

    return {"message": "User registered"}
