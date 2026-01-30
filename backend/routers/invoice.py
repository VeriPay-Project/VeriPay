from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
import os
import uuid

from sqlalchemy.orm import Session

from extraction.pdf_extractor import extract_pdf_content
from extraction.image_extractor import extract_image_content
from integrity.integrity_service import evaluate_integrity
from integrity.vendor_identity_service import verify_vendor_identity
from utils.hashing import compute_sha256
from models.invoice import Invoice
from models.analysis_result import AnalysisResult
from models.vendor import Vendor
from dependencies import get_db

from services.invoice_analysis_service import analyze_invoice as run_full_analysis

router = APIRouter(prefix="/invoices", tags=["Invoices"])

ALLOWED_MIME_TYPES = {
    "application/pdf": "pdf",
    "image/png": "image",
    "image/jpeg": "image",
    "image/jpg": "image",
}

INVOICE_DIR = "invoices"
os.makedirs(INVOICE_DIR, exist_ok=True)


@router.get("/")
def list_invoices(db: Session = Depends(get_db)):
    invoices = db.query(Invoice).order_by(Invoice.invoice_id.desc()).all()
    return [
        {
            "invoice_id": i.invoice_id,
            "status": i.status,
            "file_hash": i.file_hash,
            "is_signed": i.is_signed,
            "crypto_valid": i.crypto_valid,
            "signer_fingerprint": i.signer_fingerprint,
            "created_at": i.created_at,
        }
        for i in invoices
    ]


@router.post("/upload")
async def upload_invoice(
    file: UploadFile = File(...),
    force_recheck: bool = False,
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File must have a name")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    file_type = ALLOWED_MIME_TYPES[file.content_type]
    extension = os.path.splitext(file.filename)[1].lower()

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    file_hash = compute_sha256(contents)

    # 🔍 Check duplicate
    existing_invoice = (
        db.query(Invoice).filter(Invoice.file_hash == file_hash).first()
    )

    # ✅ DUPLICATE + NO FORCE → return existing
    if existing_invoice and not force_recheck:
        previous = (
            db.query(AnalysisResult)
            .filter(AnalysisResult.invoice_id == existing_invoice.invoice_id)
            .first()
        )

        return {
            "status": "duplicate",
            "invoice_id": existing_invoice.invoice_id,
            "file_hash": existing_invoice.file_hash,
            "previous_result": {
                "crypto": previous.crypto_json if previous else None,
                "semantic": previous.semantic_json if previous else None,
                "rules": previous.rules_json if previous else None,
                "ai": previous.ai_json if previous else None,
            } if previous else None,
        }

    # ✅ DUPLICATE + FORCE → reuse invoice
    if existing_invoice:
        invoice = existing_invoice
        file_path = invoice.file_path
    else:
        # 🆕 New invoice
        safe_filename = f"{uuid.uuid4()}{extension}"
        file_path = os.path.join(INVOICE_DIR, safe_filename)

        with open(file_path, "wb") as f:
            f.write(contents)

        if file_type == "pdf":
            extract_pdf_content(file_path)
        else:
            extract_image_content(file_path)

        crypto_raw = await evaluate_integrity(file_path, file_type)

        fingerprint = crypto_raw.get("signer_fingerprint")
        vendor = (
            db.query(Vendor)
            .filter(Vendor.public_key_fingerprint == fingerprint)
            .first()
            if fingerprint
            else None
        )

        crypto = {
            **crypto_raw,
            **verify_vendor_identity(
                crypto_raw["signature_integrity"],
                crypto_raw["certificate_trust"],
                fingerprint,
                vendor,
            ),
        }

        invoice = Invoice(
            file_path=file_path,
            file_hash=file_hash,
            is_signed=crypto["signature_present"],
            crypto_valid=(crypto["signature_integrity"] == "valid"),
            signer_fingerprint=fingerprint,
            status="uploaded",
        )

        db.add(invoice)
        db.commit()
        db.refresh(invoice)

    return {
        "status": "stored",
        "invoice_id": invoice.invoice_id,
        "file_hash": invoice.file_hash,
    }


@router.post("/{invoice_id}/analyze")
async def analyze_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter_by(invoice_id=invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    file_path = invoice.file_path
    file_type = "pdf" if file_path.endswith(".pdf") else "image"

    crypto_raw = await evaluate_integrity(file_path, file_type)

    fingerprint = crypto_raw.get("signer_fingerprint")
    vendor = (
        db.query(Vendor)
        .filter(Vendor.public_key_fingerprint == fingerprint)
        .first()
        if fingerprint
        else None
    )

    crypto = {
        **crypto_raw,
        **verify_vendor_identity(
            crypto_raw["signature_integrity"],
            crypto_raw["certificate_trust"],
            fingerprint,
            vendor,
        ),
    }

    analysis_payload = (
        run_full_analysis(file_path)
        if file_type == "pdf"
        else {
            "semantic_fields": None,
            "rule_based_checks": {"status": "not_supported"},
            "ai_anomaly_analysis": {"status": "not_supported"},
        }
    )

    ai = analysis_payload.get("ai_anomaly_analysis", {})
    prediction = -1
    confidence = 0.0

    if ai.get("status") == "ok":
        prediction = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}.get(ai["risk_level"], -1)
        confidence = float(ai.get("anomaly_score", 0.0))

    # 🔁 OVERWRITE OR INSERT analysis
    existing_analysis = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.invoice_id == invoice.invoice_id)
        .first()
    )

    if existing_analysis:
        existing_analysis.crypto_json = crypto
        existing_analysis.semantic_json = analysis_payload.get("semantic_fields")
        existing_analysis.rules_json = analysis_payload.get("rule_based_checks")
        existing_analysis.ai_json = ai
        existing_analysis.prediction = prediction
        existing_analysis.confidence = confidence
    else:
        db.add(
            AnalysisResult(
                invoice_id=invoice.invoice_id,
                crypto_json=crypto,
                semantic_json=analysis_payload.get("semantic_fields"),
                rules_json=analysis_payload.get("rule_based_checks"),
                ai_json=ai,
                prediction=prediction,
                confidence=confidence,
                model_version="semantic+rules+ai",
            )
        )

    db.commit()

    return {
        "invoice_id": invoice.invoice_id,
        "crypto": crypto,
        "semantic": analysis_payload.get("semantic_fields"),
        "rules": analysis_payload.get("rule_based_checks"),
        "ai": ai,
    }
