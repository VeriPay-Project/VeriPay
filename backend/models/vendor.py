from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from conn_db import Base


class Vendor(Base):
    __tablename__ = "vendors"

    vendor_id = Column(Integer, primary_key=True, index=True)
    vendor_name = Column(String, nullable=False)
    public_key_fingerprint = Column(String, unique=True, nullable=True)
    status = Column(String, default="active", nullable=False)

