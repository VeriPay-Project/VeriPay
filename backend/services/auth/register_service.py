from sqlalchemy.orm import Session
from models.user import User
from utils.security import hash_password
from datetime import date
from utils.password_validator import validate_password_strength


def register_user(
    db: Session,
    email: str,
    password: str,
    full_name: str,
    date_of_birth: date,
    security_question: str,
    security_answer: str,
):
    # ✅ NEW: Validate password strength
    validate_password_strength(password)

    # Check if user already exists
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return None

    # Normalize security answer before hashing
    normalized_answer = security_answer.lower().strip()

    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
        date_of_birth=date_of_birth,
        security_question=security_question,
        security_answer_hash=hash_password(normalized_answer),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user