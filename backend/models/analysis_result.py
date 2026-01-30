from sqlalchemy import Column, Integer, DateTime, ForeignKey, JSON, String, Float
from datetime import datetime
from conn_db import Base


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.invoice_id"), index=True, nullable=False)
    prediction = Column(Integer, nullable=False)
    confidence = Column(Float, nullable=False)
    model_version = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    crypto_json = Column(JSON, nullable=False)
    ai_json = Column(JSON, nullable=False)
    rules_json = Column(JSON, nullable=False)
    semantic_json = Column(JSON, nullable=True)
