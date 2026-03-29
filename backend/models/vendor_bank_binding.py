from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from conn_db import Base


class VendorBankBinding(Base):
    __tablename__ = "vendor_bank_bindings"

    id = Column(Integer, primary_key=True, index=True)

    # Vendor reference
    vendor_id = Column(Integer, ForeignKey("vendors.vendor_id"), index=True)

    # Bank account identity
    account_normalized = Column(String, nullable=True)
    account_hash = Column(String, nullable=False, index=True)
    account_masked = Column(String, nullable=False)

    # Bank metadata
    bank_name = Column(String, nullable=True)
    account_type = Column(String, nullable=True)  # "iban" or "local"
    currency = Column(String, nullable=True)
    country = Column(String, nullable=True)

    # Ownership metadata
    account_holder_name = Column(String, nullable=True)

    # Verification status
    verification_status = Column(String, default="pending")
    verification_reference = Column(String, nullable=True)
    verified_at = Column(DateTime, nullable=True)

    # Lifecycle
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vendor = relationship("Vendor")
