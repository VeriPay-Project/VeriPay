from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from schemas.auth import RegisterRequest
from conn_db import get_db
from services.auth.register_service import register_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    user = register_user(db, data.email, data.password, data.full_name, data.date_of_birth,data.security_question,
    data.security_answer,)

    if not user:
        raise HTTPException(status_code=400, detail="User already exists")

    return {"message": "User registered"}
