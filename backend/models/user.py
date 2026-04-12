from sqlalchemy import Column, Integer, String, Date
from sqlalchemy.orm import relationship
from conn_db import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    date_of_birth = Column(Date, nullable=True)
    security_question = Column(String, nullable=True)
    security_answer_hash = Column(String, nullable=True)
    invoices = relationship("Invoice", back_populates="user", cascade="all, delete")
    vendors = relationship("Vendor", back_populates="owner", cascade="all, delete")