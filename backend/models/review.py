from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from conn_db import Base


class InvoiceReview(Base):
    __tablename__ = "invoice_reviews"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(
        Integer,
        ForeignKey("invoices.invoice_id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=False,
    )
    decision = Column(String, nullable=False)
    confidence = Column(String, nullable=True)
    description = Column(Text, nullable=False)
    reviewed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    invoice = relationship("Invoice", backref="review", uselist=False)
    reviewer = relationship("User", backref="reviews")
