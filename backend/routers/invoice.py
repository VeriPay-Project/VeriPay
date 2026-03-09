from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
import os
import re
import uuid

from sqlalchemy.orm import Session

from extraction.pdf_extractor import extract_pdf_content
from extraction.image_extractor import extract_image_content
from integrity.integrity_service import evaluate_integrity
from integrity.vendor_identity_service import verify_vendor_identity
from integrity.vendor_bank_service import verify_vendor_bank_account
from utils.hashing import compute_sha256
from models.invoice import Invoice
from models.analysis_result import AnalysisResult
from models.vendor import Vendor
from dependencies import get_db
from services.analysis_service import run_ai_analysis
from services.rules_service import run_rules_checks
from services.semantic_extraction_service import extract_invoice_semantic
from dependencies import get_current_user
from models.user import User


router = APIRouter(
    prefix="/invoices",
    tags=["Invoices"]
)

ALLOWED_MIME_TYPES = {
    "application/pdf": "pdf",
    "image/png": "image",
    "image/jpeg": "image",
    "image/jpg": "image"
}

INVOICE_DIR = "invoices"
os.makedirs(INVOICE_DIR, exist_ok=True)

ACCOUNT_PATTERNS = [
    r"IBAN[:\s]*([A-Z0-9]{15,34})",
    r"Account\s*Number[:\s]*([0-9\- ]{6,30})",
    r"Account\s*No\.?[:\s]*([0-9\- ]{6,30})",
    r"Account[:\s]*([0-9\- ]{6,30})",
    r"Acct[:\s]*([0-9\- ]{6,30})",
    r"A\/C[:\s]*([0-9\- ]{6,30})"
]


def normalize_account(account: str | None) -> str | None:
    if not account:
        return None
    normalized = re.sub(r"[^A-Za-z0-9]", "", account)
    return normalized or None


def _extract_invoice_fields_regex(text: str) -> dict:
    fields = {
        "vendor_name": None,
        "bank_name": None,
        "bank_account": None,
        "invoice_number": None,
        "total_amount": None,
    }

    if not text:
        return fields

    vendor_match = re.search(
        r"(?:vendor|supplier|seller|from)\s*[:\-]\s*([^\n\r]+)",
        text,
        flags=re.IGNORECASE
    )
    if vendor_match:
        fields["vendor_name"] = vendor_match.group(1).strip()

    bank_name_match = re.search(
        r"(?:bank\s*name|bank)\s*[:\-]\s*([^\n\r]+)",
        text,
        flags=re.IGNORECASE
    )
    if bank_name_match:
        fields["bank_name"] = bank_name_match.group(1).strip()

    invoice_no_match = re.search(
        r"(?:invoice\s*(?:number|no\.?|#)?\s*[:#-]\s*([A-Z0-9\-\/]+))",
        text,
        flags=re.IGNORECASE
    )
    if invoice_no_match:
        fields["invoice_number"] = invoice_no_match.group(1).strip()

    total_match = re.search(
        r"(?:invoice\s+total|amount\s+due|balance\s+due|total(?:\s+amount)?)\s*[:\-]?\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)",
        text,
        flags=re.IGNORECASE
    )
    if total_match:
        fields["total_amount"] = total_match.group(1).strip()

    bank_account = None
    for pattern in ACCOUNT_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            bank_account = match.group(1)
            bank_account = re.sub(r"\s+", "", bank_account)
            break

    fields["bank_account"] = bank_account

    return fields


def _merge_semantic_fallback(regex_fields: dict, semantic_fields: dict) -> dict:
    merged = dict(regex_fields)
    for key in merged.keys():
        if merged.get(key):
            continue

        candidate = semantic_fields.get(key) if semantic_fields else None
        if candidate is None:
            continue

        candidate_str = str(candidate).strip()
        if candidate_str:
            merged[key] = candidate_str

    return merged


@router.get("/")
def list_invoices(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    invoices = db.query(Invoice).order_by(Invoice.invoice_id.desc()).all()
    return [
        {
            "invoice_id": invoice.invoice_id,
            "status": invoice.status,
            "file_hash": invoice.file_hash,
            "is_signed": invoice.is_signed,
            "crypto_valid": invoice.crypto_valid,
            "signer_fingerprint": invoice.signer_fingerprint,
            "created_at": invoice.created_at,
        }
        for invoice in invoices
    ]


@router.post("/upload")
async def upload_invoice(
    user: User = Depends(get_current_user),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 1️⃣ Basic sanity check
    if not file.filename:
        raise HTTPException(status_code=400, detail="File must have a name")

    # 2️⃣ MIME validation
    content_type = file.content_type
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    file_category = ALLOWED_MIME_TYPES[content_type]

    # 3️⃣ Extension check
    extension = os.path.splitext(file.filename)[1].lower()
    if file_category == "pdf" and extension != ".pdf":
        raise HTTPException(status_code=400, detail="Expected PDF")

    if file_category == "image" and extension not in [".png", ".jpg", ".jpeg"]:
        raise HTTPException(status_code=400, detail="Expected image")

    # 4️⃣ Read file bytes
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    # 🔐 STEP 1 — Compute SHA-256 (duplicate detection)
    file_hash = compute_sha256(contents)

    existing = db.query(Invoice).filter(
        Invoice.file_hash == file_hash
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Duplicate invoice detected"
        )

    # 5️⃣ Persist file
    safe_filename = f"{uuid.uuid4()}{extension}"
    file_path = os.path.join(INVOICE_DIR, safe_filename)

    with open(file_path, "wb") as f:
        f.write(contents)

    # 6️⃣ Extract content (used later by AI, not crypto)
    if file_category == "pdf":
        _ = extract_pdf_content(file_path)
    else:
        _ = extract_image_content(file_path)

    # 🔐 STEP 2 — Cryptographic integrity evaluation
    crypto_raw = await evaluate_integrity(
        file_path=file_path,
        file_type=file_category
    )

    # 🔐 STEP 3 — Vendor cryptographic identity binding (fingerprint-based)
    vendor = None
    fingerprint = crypto_raw.get("signer_fingerprint")

    if fingerprint:
        vendor = db.query(Vendor).filter(
            Vendor.public_key_fingerprint == fingerprint
        ).first()

    vendor_result = verify_vendor_identity(
        signature_integrity=crypto_raw["signature_integrity"],
        certificate_trust=crypto_raw["certificate_trust"],
        signer_fingerprint=fingerprint,
        vendor=vendor
    )

    crypto = {
        **crypto_raw,
        **vendor_result
    }

    # 8️⃣ Persist invoice record
    invoice = Invoice(
        file_path=file_path,
        file_hash=file_hash,
        is_signed=crypto["signature_present"],
        crypto_valid=(crypto["signature_integrity"] == "valid"),
        signer_fingerprint=fingerprint,
        status="uploaded"
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    # 9️⃣ Final response (clean, minimal, AI-ready)
    return {
        "status": "stored",
        "invoice_id": invoice.invoice_id,
        "file_hash": file_hash,
        "file_type": file_category,
        "crypto": crypto
    }


@router.post("/{invoice_id}/analyze")
async def analyze_invoice(
    invoice_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    file_path = invoice.file_path
    extension = os.path.splitext(file_path)[1].lower()
    file_type = "pdf" if extension == ".pdf" else "image"
    extracted_text = ""

    try:
        if file_type == "pdf":
            extracted_data = extract_pdf_content(file_path)
        else:
            extracted_data = extract_image_content(file_path)

        if isinstance(extracted_data, dict):
            extracted_text = extracted_data.get("text", "") or ""
    except Exception:
        extracted_text = ""

    crypto_raw = await evaluate_integrity(
        file_path=file_path,
        file_type=file_type
    )

    vendor = None
    fingerprint = crypto_raw.get("signer_fingerprint")

    if fingerprint:
        vendor = db.query(Vendor).filter(
            Vendor.public_key_fingerprint == fingerprint
        ).first()

    vendor_result = verify_vendor_identity(
        signature_integrity=crypto_raw["signature_integrity"],
        certificate_trust=crypto_raw["certificate_trust"],
        signer_fingerprint=fingerprint,
        vendor=vendor
    )

    regex_fields = _extract_invoice_fields_regex(extracted_text)
    semantic_fields = {}
    if any(value is None for value in regex_fields.values()):
        semantic_fields = extract_invoice_semantic(extracted_text)

    merged_fields = _merge_semantic_fallback(regex_fields, semantic_fields)

    print("========== DEBUG EXTRACTION ==========")
    print("Regex fields:", regex_fields)
    print("Semantic fields:", semantic_fields)
    print("======================================")

    merged_bank_account = normalize_account(merged_fields.get("bank_account"))
    merged_fields["bank_account"] = merged_bank_account

    bank_result = verify_vendor_bank_account(
        db=db,
        vendor_name=merged_fields.get("vendor_name"),
        bank_account=merged_bank_account
    )

    vendor_identity_status = bank_result.get("vendor_identity_status")
    if vendor_identity_status:
        vendor_result = {
            **vendor_result,
            "signer_identity": vendor_identity_status
        }

    fraud_flags = []
    verification_status = bank_result.get("verification_status")
    if verification_status == "bank_mismatch":
        fraud_flags.append({
            "rule_code": "VENDOR_BANK_MISMATCH",
            "severity": "high",
            "message": "Invoice bank account does not match the vendor's verified payment account."
        })
    elif verification_status == "verified":
        fraud_flags.append({
            "rule_code": "VENDOR_BANK_VERIFIED",
            "severity": "info",
            "message": "Invoice bank account matches the vendor's verified payment account."
        })
    elif verification_status == "vendor_unknown":
        fraud_flags.append({
            "rule_code": "VENDOR_UNKNOWN",
            "severity": "low",
            "message": "Vendor in invoice data could not be matched to a registered vendor."
        })

    crypto = {
        **crypto_raw,
        **vendor_result
    }

    ai_result = None
    if file_type == "pdf":
        ai_result = run_ai_analysis(file_path)
        rules_result = run_rules_checks(file_path)
    else:
        ai_result = {
            "status": "not_supported",
            "message": "AI analysis is only available for PDF invoices."
        }
        rules_result = {
            "status": "not_supported",
            "message": "Rules analysis is only available for PDF invoices."
        }

    prediction = -1
    confidence = 0.0
    model_version = "layoutlmv3-isolation-forest"

    if ai_result.get("status") == "ok":
        risk = ai_result.get("risk_level")
        if risk == "LOW":
            prediction = 0
        elif risk == "MEDIUM":
            prediction = 1
        elif risk == "HIGH":
            prediction = 2
        confidence = float(ai_result.get("anomaly_score") or confidence)

    analysis = AnalysisResult(
        invoice_id=invoice.invoice_id,
        prediction=prediction,
        confidence=confidence,
        model_version=model_version,
        crypto_json=crypto,
        ai_json=ai_result,
        rules_json=rules_result
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    return {
        "invoice_id": invoice.invoice_id,
        "file_type": file_type,
        "crypto": crypto,
        "vendor_identity_status": bank_result.get("vendor_identity_status"),
        "bank_account_detected": bank_result.get("bank_account_detected"),
        "verification_status": bank_result.get("verification_status"),
        "vendor_identity": {
            "status": bank_result.get("vendor_identity_status"),
            "vendor_name": merged_fields.get("vendor_name")
        },
        "vendor_bank": bank_result,
        "ai": ai_result,
        "rules": rules_result,
        "fraud_flags": fraud_flags,
        "semantic_vendor_name": merged_fields.get("vendor_name"),
        "semantic_bank_account": merged_fields.get("bank_account"),
        "semantic_bank_name": merged_fields.get("bank_name"),
        "semantic_invoice_number": merged_fields.get("invoice_number"),
        "semantic_total_amount": merged_fields.get("total_amount")
    }
