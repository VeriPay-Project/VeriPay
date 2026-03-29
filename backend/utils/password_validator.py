import re
from fastapi import HTTPException


def validate_password_strength(password: str):
    errors = []

    if len(password) < 8:
        errors.append("Password must be at least 8 characters long")

    if not re.search(r"[A-Z]", password):
        errors.append("Password must include at least one uppercase letter")

    if not re.search(r"[a-z]", password):
        errors.append("Password must include at least one lowercase letter")

    if not re.search(r"[0-9]", password):
        errors.append("Password must include at least one number")

    if not re.search(r"[^A-Za-z0-9]", password):
        errors.append("Password must include at least one special character")

    if errors:
        raise HTTPException(status_code=400, detail=errors)