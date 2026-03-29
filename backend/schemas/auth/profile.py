from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import date

class UpdateMeRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    date_of_birth: date | None = None

class MeResponse(BaseModel):
    id: int
    email: str
    full_name: str
    date_of_birth: date | None = None
    security_question: str | None = None

    class Config:
        from_attributes = True  # For SQLAlchemy ORM support

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=6)
    new_password: str = Field(min_length=6)