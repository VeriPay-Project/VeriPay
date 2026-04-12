from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from conn_db import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    timestamp     = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action        = Column(String, nullable=False, index=True)
    resource_type = Column(String, nullable=True)
    resource_id   = Column(String, nullable=True)
    details       = Column(JSONB, nullable=True)
    ip_address    = Column(String, nullable=True)
    user_agent    = Column(String, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
