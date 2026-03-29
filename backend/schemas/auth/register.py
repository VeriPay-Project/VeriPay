from pydantic import BaseModel
from datetime import date

class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    date_of_birth: date
    security_question: str
    security_answer: str