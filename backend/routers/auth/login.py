from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from schemas.auth import LoginRequest
from services.auth.login_service import authenticate_user
from conn_db import get_db
from dependencies import get_current_user
from models.user import User
from schemas.auth.profile import UpdateMeRequest, MeResponse, ChangePasswordRequest
from utils.security import verify_password, hash_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(
    request: Request,
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    user = authenticate_user(db, data.email, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # 🔐 FORCE SESSION CREATION
    request.session.clear()
    request.session["user_id"] = user.id

    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
        },
    }


@router.post("/logout")
def logout(request: Request):
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
    security_answer: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # verify security answer
    if not verify_password(security_answer, user.security_answer_hash):
        raise HTTPException(status_code=400, detail="Incorrect security answer")

    db.delete(user)
    db.commit()

    return {"message": "Account deleted successfully"}