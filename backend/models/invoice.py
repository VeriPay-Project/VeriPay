from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from conn_db import Base


class Invoice(Base):
    __tablename__ = "invoices"

    invoice_id = Column(Integer, primary_key=True, index=True)

    # 🔥 ADD THIS
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

    status = Column(String, default="uploaded", nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    # 🔥 relationship
    vendor = relationship("Vendor")