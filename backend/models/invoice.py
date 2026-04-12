from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
from conn_db import Base


class Invoice(Base):
    __tablename__ = "invoices"

    invoice_id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user = relationship("User", back_populates="invoices")

    vendor_id = Column(
        Integer,
        ForeignKey("vendors.vendor_id"),
        index=True,
        nullable=True,
    )
    original_filename = Column(String, nullable=True)
    file_path = Column(String, nullable=False)
    file_hash = Column(String, nullable=False, unique=True)

    is_signed = Column(Boolean, nullable=False, default=False)
    crypto_valid = Column(Boolean, nullable=True)
    signer_fingerprint = Column(String, nullable=True)
    crypto_json = Column(JSONB, nullable=True)     # cached from upload — avoids re-running sig verify

    status = Column(String, default="uploaded", nullable=False)
    analysis_error = Column(String, nullable=True)  # set when status = "analysis_failed"

    extracted_text = Column(Text, nullable=True)    # cached during upload — reused by analysis

    created_at = Column(DateTime, default=datetime.utcnow)

    # relationship
    vendor = relationship("Vendor")