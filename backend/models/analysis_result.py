from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB

from conn_db import Base


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.invoice_id"), nullable=False, index=True)

    prediction = Column(Integer, nullable=True)
    confidence = Column(Float, nullable=True)
    model_version = Column(String, nullable=True)

    file_type = Column(String, nullable=True)

    crypto_json = Column(JSONB, nullable=True)
    ai_json = Column(JSONB, nullable=True)
    rules_json = Column(JSONB, nullable=True)
    semantic_json = Column(JSONB, nullable=True)

    vendor_bank_json = Column(JSONB, nullable=True)
    external_verification_json = Column(JSONB, nullable=True)

    forensics_json = Column(JSONB, nullable=True)
    ai_artifact_json = Column(JSONB, nullable=True)
    preview_json = Column(JSONB, nullable=True)

    highlights_json = Column(JSONB, nullable=True)
    spatial_highlights_json = Column(JSONB, nullable=True)
    document_highlights_json = Column(JSONB, nullable=True)
    highlight_summary_json = Column(JSONB, nullable=True)

    scoring_json = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)