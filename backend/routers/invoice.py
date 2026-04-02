# ──────────────────────────────────────────────
# IMPORTS
# ──────────────────────────────────────────────
from difflib import SequenceMatcher
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request
import os
import re
import uuid

from pydantic import ValidationError
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
from models.vendor_bank_binding import VendorBankBinding
from dependencies import get_db
from services.analysis_service import run_ai_analysis
from services.rules_service import run_rules_checks
from services.semantic_extraction_service import extract_invoice_semantic
from dependencies import get_current_user
from models.user import User
from schemas.invoice import InvoiceVendorMatchRequest, InvoiceVendorMatchResponse
from services.iban_registry_service import verify_iban_external
from services.bank_utils import (
    detect_account_type,
    hash_account,
    mask_account,
    normalize_account_by_country,
)
from services.forensics_service import run_forensics_analysis
from services.highlight_service import build_highlights
from services.image_service import render_invoice_preview
from services.ai_artifact_service import run_ai_artifact_detection


# ──────────────────────────────────────────────
# ROUTER CONFIG
# ──────────────────────────────────────────────
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

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INVOICE_DIR = os.path.join(BASE_DIR, "invoices")
os.makedirs(INVOICE_DIR, exist_ok=True)


# ──────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────

ACCOUNT_PATTERNS = [
    r"IBAN[:\s]*([A-Z0-9]{15,34})",
    r"Account\s*Number[:\s]*([0-9\- ]{6,30})",
    r"Account\s*No\.?[:\s]*([0-9\- ]{6,30})",
    r"Account[:\s]*([0-9\- ]{6,30})",
    r"Acct[:\s]*([0-9\- ]{6,30})",
    r"A\/C[:\s]*([0-9\- ]{6,30})"
]


def _infer_file_type(file_path: str) -> str:
    extension = os.path.splitext(file_path)[1].lower()
    if extension == ".pdf":
        return "pdf"
    if extension in {".png", ".jpg", ".jpeg"}:
        return "image"
    return "image"


def _extract_invoice_fields_regex(text: str) -> dict:
    """
    Regex fallback extraction.
    Only used if semantic misses fields.
    """
    fields = {
        "vendor_name":       None,
        "bank_name":         None,
        "bank_account":      None,
        "institution_number": None,   # Canadian institution code (3 digits)
        # Canadian transit/branch number (5 digits)
        "transit_number":    None,
        "routing_number":    None,    # US routing number (9 digits)
        "account_number":    None,    # Raw account number
        "invoice_number":    None,
        "total_amount":      None,
        "customer_name":     None,
        "invoice_date":      None,
        "subtotal":          None,
        "tax":               None,
        "currency":          None,
    }

    if not text:
        return fields

    vendor_match = re.search(
        r"(?:vendor|supplier|from)\s*[:\-]\s*([^\n\r]+)", text, re.IGNORECASE)
    if vendor_match:
        fields["vendor_name"] = vendor_match.group(1).strip()

    bank_match = re.search(
        r"(?:bank\s*name|bank)\s*[:\-]\s*([^\n\r]+)", text, re.IGNORECASE)
    if bank_match:
        fields["bank_name"] = bank_match.group(1).strip()

    invoice_match = re.search(
        r"(?:invoice\s*(?:no|number)?\s*[:#-]\s*([A-Z0-9\-\/]+))", text, re.IGNORECASE)
    if invoice_match:
        fields["invoice_number"] = invoice_match.group(1).strip()

    total_match = re.search(
        r"(?:total|amount due)\s*[:\-]?\s*\$?\s*([0-9,]+\.\d{2})", text, re.IGNORECASE)
    if total_match:
        fields["total_amount"] = total_match.group(1)

    # Canadian institution number — 3 digits
    institution_match = re.search(
        r"institution\s*(?:no\.?|number|code)?[:\s]+(\d{3})\b",
        text,
        re.IGNORECASE,
    )
    fields["institution_number"] = institution_match.group(
        1) if institution_match else None

    # Canadian transit number — 5 digits
    transit_match = re.search(
        r"transit\s*(?:no\.?|number)?[:\s]+(\d{5})\b",
        text,
        re.IGNORECASE,
    )
    fields["transit_number"] = transit_match.group(
        1) if transit_match else None

    # US routing number — 9 digits
    routing_match = re.search(
        r"routing\s*(?:number|no\.?)?[:\s]+(\d{9})\b",
        text,
        re.IGNORECASE,
    )
    fields["routing_number"] = routing_match.group(
        1) if routing_match else None

    # Raw account number
    account_match = re.search(
        r"account\s*(?:number|no\.?)?[:\s]+(\d{6,20})\b",
        text,
        re.IGNORECASE,
    )
    fields["account_number"] = account_match.group(
        1) if account_match else None

    for pattern in ACCOUNT_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            fields["bank_account"] = re.sub(r"\s+", "", match.group(1))
            break

    return fields


def _merge_semantic_first(semantic: dict, regex: dict) -> dict:
    """
    Semantic-first merge.
    Regex fills only missing fields.
    """
    merged = dict(semantic or {})

    for key, value in (regex or {}).items():
        if not merged.get(key) and value:
            merged[key] = str(value).strip()

    return merged


def _compact_match_text(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None

    cleaned = re.sub(r"[^a-z0-9]+", "", value.casefold())
    return cleaned or None


def _compact_masked_account(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None

    cleaned = re.sub(r"[^A-Z0-9*]+", "", value.strip().upper())
    return cleaned or None


def _vendor_name_rank(search_value: str, candidate_value: str | None) -> int:
    search_clean = _compact_match_text(search_value)
    candidate_clean = _compact_match_text(candidate_value)

    if not search_clean or not candidate_clean:
        return 0
    if candidate_clean == search_clean:
        return 3
    if candidate_clean.startswith(search_clean):
        return 2
    if search_clean in candidate_clean:
        return 1
    return 0


def _resolve_verification_source(reference: str | None) -> str:
    if reference == "plaid":
        return "plaid"
    return "manual_entry"


def _bank_name_matches(
    invoice_bank_name: str | None,
    binding_bank_name: str | None,
    *,
    strict: bool,
) -> bool:
    invoice_clean = _compact_match_text(invoice_bank_name)
    binding_clean = _compact_match_text(binding_bank_name)

    if not invoice_clean or not binding_clean:
        return False
    if strict:
        return invoice_clean == binding_clean
    if invoice_clean == binding_clean:
        return True
    if invoice_clean in binding_clean or binding_clean in invoice_clean:
        return True
    return SequenceMatcher(None, invoice_clean, binding_clean).ratio() >= 0.85


def _account_matches(
    invoice_account_number: str,
    invoice_country: str,
    binding: VendorBankBinding,
) -> bool:
    normalized_account = normalize_account_by_country(
        invoice_country,
        invoice_account_number,
    )
    hashed_account = hash_account(
        normalized_account) if normalized_account else None
    masked_normalized_account = mask_account(
        normalized_account) if normalized_account else None

    binding_masked = _compact_masked_account(binding.account_masked)
    invoice_masked_input = _compact_masked_account(invoice_account_number)
    normalized_masked_input = _compact_masked_account(
        masked_normalized_account)

    return any(
        (
            hashed_account and binding.account_hash == hashed_account,
            normalized_account and binding.account_normalized == normalized_account,
            normalized_masked_input and binding_masked == normalized_masked_input,
            invoice_masked_input and binding_masked == invoice_masked_input,
        )
    )


def _score_binding_match(
    verification_source: str,
    account_matched: bool,
    country_matched: bool,
    bank_name_matched: bool,
    *,
    bank_name_available: bool,
) -> int:
    if verification_source == "plaid":
        if account_matched and country_matched and bank_name_matched:
            return 100
        if account_matched and country_matched:
            return 85
        if country_matched:
            return 40
        return 0

    comparable_fields = 2 + int(bank_name_available)
    matched_fields = int(account_matched) + int(country_matched)
    if bank_name_available:
        matched_fields += int(bank_name_matched)

    if matched_fields == 0:
        return 0
    if matched_fields == comparable_fields:
        return 90
    if matched_fields >= 2:
        return 70
    if comparable_fields >= 2:
        return 40
    return 0


def _build_vendor_match_response(
    *,
    status: str,
    vendor_id: int | None,
    binding: VendorBankBinding | None,
    confidence_score: int,
    details: dict,
) -> dict:
    binding_source = _resolve_verification_source(
        binding.verification_reference if binding else None
    )
    return {
        "status": status,
        "vendor_id": vendor_id,
        "binding_id": binding.id if binding and confidence_score > 0 else None,
        "confidence_score": confidence_score,
        "matched_binding": (
            {
                "account_masked": binding.account_masked,
                "country": binding.country,
                "bank_name": binding.bank_name,
                "verification_source": binding_source,
                "is_active": binding.is_active,
            }
            if binding and confidence_score > 0
            else None
        ),
        "details": details,
    }


# ──────────────────────────────────────────────
# MATCH VENDOR AGAINST STORED BINDINGS
# ──────────────────────────────────────────────
@router.post("/match-vendor", response_model=InvoiceVendorMatchResponse)
async def match_invoice_vendor(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail="Invalid JSON payload") from exc

    try:
        match_request = InvoiceVendorMatchRequest.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors()) from exc

    vendor_name_query = match_request.vendor_name
    invoice_account_number = match_request.account_number
    invoice_bank_name = match_request.bank_name
    invoice_country = match_request.country.upper()
    invoice_currency = match_request.currency.upper()
    _ = invoice_currency

    try:
        vendor_candidates = (
            db.query(Vendor)
            .filter(Vendor.vendor_name.ilike(f"%{vendor_name_query}%"))
            .all()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to query vendor records",
        ) from exc

    if not vendor_candidates:
        return _build_vendor_match_response(
            status="vendor_not_found",
            vendor_id=None,
            binding=None,
            confidence_score=0,
            details={
                "vendor_name_matched": False,
                "account_matched": False,
                "country_matched": False,
                "bank_name_matched": False,
            },
        )

    best_vendor = max(
        vendor_candidates,
        key=lambda vendor: _vendor_name_rank(
            vendor_name_query, vendor.vendor_name),
    )

    try:
        bindings = (
            db.query(VendorBankBinding)
            .join(Vendor, Vendor.vendor_id == VendorBankBinding.vendor_id)
            .filter(
                VendorBankBinding.vendor_id.in_(
                    [vendor.vendor_id for vendor in vendor_candidates]
                ),
                VendorBankBinding.is_active == True,
            )
            .all()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to query vendor bank bindings",
        ) from exc

    if not bindings:
        return _build_vendor_match_response(
            status="no_match",
            vendor_id=best_vendor.vendor_id,
            binding=None,
            confidence_score=0,
            details={
                "vendor_name_matched": True,
                "account_matched": False,
                "country_matched": False,
                "bank_name_matched": False,
            },
        )

    best_candidate = None
    for binding in bindings:
        verification_source = _resolve_verification_source(
            binding.verification_reference
        )
        account_matched = _account_matches(
            invoice_account_number,
            invoice_country,
            binding,
        )
        country_matched = (
            isinstance(binding.country, str)
            and binding.country.upper() == invoice_country
        )
        bank_name_matched = _bank_name_matches(
            invoice_bank_name,
            binding.bank_name,
            strict=(verification_source == "plaid"),
        )
        confidence_score = _score_binding_match(
            verification_source,
            account_matched,
            country_matched,
            bank_name_matched,
            bank_name_available=bool(invoice_bank_name and binding.bank_name),
        )

        candidate = {
            "vendor_id": binding.vendor_id,
            "binding": binding,
            "confidence_score": confidence_score,
            "vendor_rank": _vendor_name_rank(
                vendor_name_query,
                binding.vendor.vendor_name if binding.vendor else None,
            ),
            "details": {
                "vendor_name_matched": True,
                "account_matched": account_matched,
                "country_matched": country_matched,
                "bank_name_matched": bank_name_matched,
            },
        }

        if best_candidate is None:
            best_candidate = candidate
            continue

        current_key = (
            candidate["confidence_score"],
            candidate["vendor_rank"],
            int(candidate["details"]["account_matched"]),
            int(candidate["details"]["country_matched"]),
            int(candidate["details"]["bank_name_matched"]),
        )
        best_key = (
            best_candidate["confidence_score"],
            best_candidate["vendor_rank"],
            int(best_candidate["details"]["account_matched"]),
            int(best_candidate["details"]["country_matched"]),
            int(best_candidate["details"]["bank_name_matched"]),
        )
        if current_key > best_key:
            best_candidate = candidate

    confidence_score = best_candidate["confidence_score"] if best_candidate else 0
    if confidence_score >= 85:
        status = "matched"
    elif confidence_score > 0:
        status = "partial_match"
    else:
        status = "no_match"

    return _build_vendor_match_response(
        status=status,
        vendor_id=best_candidate["vendor_id"] if best_candidate else best_vendor.vendor_id,
        binding=best_candidate["binding"] if best_candidate and confidence_score > 0 else None,
        confidence_score=confidence_score,
        details=(
            best_candidate["details"]
            if best_candidate
            else {
                "vendor_name_matched": True,
                "account_matched": False,
                "country_matched": False,
                "bank_name_matched": False,
            }
        ),
    )


# ──────────────────────────────────────────────
# LIST INVOICES
# ──────────────────────────────────────────────
@router.get("/")
def list_invoices(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    invoices = (
        db.query(Invoice)
        .filter(Invoice.user_id == user.id)
        .order_by(Invoice.invoice_id.desc())
        .all()
    )

    return [
        {
            "invoice_id": i.invoice_id,
            "status": i.status,
            "file_hash": i.file_hash,
            "file_name": i.original_filename,
            "is_signed": i.is_signed,
            "crypto_valid": i.crypto_valid,
            "signer_fingerprint": i.signer_fingerprint,
            "created_at": i.created_at,
        }
        for i in invoices
    ]


# ──────────────────────────────────────────────
# UPLOAD INVOICE
# ──────────────────────────────────────────────
@router.post("/upload")
async def upload_invoice(
    user: User = Depends(get_current_user),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
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

    if db.query(Invoice).filter(Invoice.file_hash == file_hash).first():
        raise HTTPException(
            status_code=409, detail="Duplicate invoice detected")

    file_path = os.path.join(INVOICE_DIR, f"{uuid.uuid4()}{extension}")
    with open(file_path, "wb") as f:
        f.write(contents)

    # extract once for cache/warmup
    if file_type == "pdf":
        extract_pdf_content(file_path)
    else:
        extract_image_content(file_path)

    crypto_raw = await evaluate_integrity(file_path=file_path, file_type=file_type)

    vendor = None
    if crypto_raw.get("signer_fingerprint"):
        vendor = db.query(Vendor).filter(
            Vendor.public_key_fingerprint == crypto_raw["signer_fingerprint"]
        ).first()

    vendor_result = verify_vendor_identity(
        crypto_raw["signature_integrity"],
        crypto_raw["certificate_trust"],
        crypto_raw.get("signer_fingerprint"),
        vendor
    )

    crypto = {**crypto_raw, **vendor_result}

    invoice = Invoice(
        user_id=user.id,
        file_path=file_path,
        file_hash=file_hash,
        original_filename=file.filename,
        is_signed=crypto["signature_present"],
        crypto_valid=(crypto["signature_integrity"] == "valid"),
        signer_fingerprint=crypto_raw.get("signer_fingerprint"),
        status="uploaded"
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    return {
        "status": "stored",
        "invoice_id": invoice.invoice_id,
        "file_hash": file_hash,
        "file_type": file_type,
        "crypto": crypto
    }


# ──────────────────────────────────────────────
# ANALYZE INVOICE (CORE PIPELINE)
# ──────────────────────────────────────────────
@router.post("/{invoice_id}/analyze")
async def analyze_invoice(
    invoice_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.user_id == user.id
    ).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    file_path = invoice.file_path
    file_type = _infer_file_type(file_path)

    # ── TEXT EXTRACTION ──
    extracted_text = ""
    try:
        data = (
            extract_pdf_content(file_path)
            if file_type == "pdf"
            else extract_image_content(file_path)
        )
        extracted_text = data.get("text", "") if isinstance(data, dict) else ""
    except Exception:
        pass

    # ── CRYPTO ──
    crypto_raw = await evaluate_integrity(file_path=file_path, file_type=file_type)

    vendor = None
    if crypto_raw.get("signer_fingerprint"):
        vendor = db.query(Vendor).filter(
            Vendor.public_key_fingerprint == crypto_raw["signer_fingerprint"]
        ).first()

    vendor_result = verify_vendor_identity(
        crypto_raw["signature_integrity"],
        crypto_raw["certificate_trust"],
        crypto_raw.get("signer_fingerprint"),
        vendor
    )

    # ── FIELD EXTRACTION ──
    semantic_fields = extract_invoice_semantic(extracted_text)
    regex_fields = _extract_invoice_fields_regex(extracted_text)
    merged_fields = _merge_semantic_first(semantic_fields, regex_fields)

    # ── BANK ACCOUNT ASSEMBLY ──
    # Priority: Canadian three-part > Canadian two-part > US two-part > LLM direct
    routing = merged_fields.get("routing_number")
    account = merged_fields.get("account_number")
    institution = merged_fields.get("institution_number")
    transit = merged_fields.get("transit_number")

    if institution and transit and account:
        # Full Canadian three-part: institution-transit-account
        raw_bank_account = f"{institution}-{transit}-{account}"
    elif institution and routing and account:
        # Canadian with institution + routing used as transit
        raw_bank_account = f"{institution}-{routing}-{account}"
    elif routing and account:
        # US two-part: routing-account
        raw_bank_account = f"{routing}-{account}"
    else:
        # Fall back to whatever LLM or IBAN regex extracted directly
        raw_bank_account = merged_fields.get("bank_account")

    print("RAW ROUTING:", routing)
    print("RAW ACCOUNT:", account)
    print("RAW INSTITUTION:", institution)
    print("RAW TRANSIT:", transit)
    print("MERGED ACCOUNT:", raw_bank_account)

    account_type, country = detect_account_type(raw_bank_account)

    if raw_bank_account:
        value = raw_bank_account.strip()
        valid = False

        if country == "US":
            valid = re.match(r"^\d{9}-\d{6,20}$", value)
        elif country == "CA":
            valid = re.match(r"^\d{3}-\d{5}-\d{6,20}$", value)
        elif country == "OTHER":
            valid = re.match(r"^[A-Z]{2}[0-9A-Z]{13,32}$", value.upper())

        if not valid:
            print("⚠️ Invalid bank format before normalization:", raw_bank_account)

    account_type, country = detect_account_type(raw_bank_account)
    normalized_bank_account = normalize_account_by_country(
        country, raw_bank_account)

    merged_fields["bank_account"] = normalized_bank_account or raw_bank_account
    merged_fields["account_type"] = account_type
    merged_fields["country"] = country

    external_verification = None
    if (
        merged_fields.get("bank_account")
        and account_type == "iban"
        and country == "OTHER"
    ):
        external_verification = verify_iban_external(
            merged_fields["bank_account"])

    # ── BANK VERIFICATION ──
    bank_result = verify_vendor_bank_account(
        db=db,
        vendor_name=merged_fields.get("vendor_name"),
        bank_account=merged_fields.get("bank_account"),
        country=merged_fields.get("country"),
        account_type=merged_fields.get("account_type")
    )

    crypto = {**crypto_raw, **vendor_result}

    # ── PREVIEW (shared image passed to forensics to avoid double render) ──
    prepared_preview = render_invoice_preview(
        file_path=file_path,
        file_type=file_type,
    )
    preview = {
        k: v for k, v in (prepared_preview or {}).items()
        if k != "image_bgr"
    } if prepared_preview else None
    shared_image = prepared_preview.get(
        "image_bgr") if prepared_preview else None

    # ── FORENSICS ──
    forensics_result = run_forensics_analysis(
        file_path=file_path,
        file_type=file_type,
        image=shared_image,
    )

    # ── AI + RULES ──
    if file_type == "pdf":
        ai_result = run_ai_analysis(file_path)
    else:
        ai_result = {
            "status": "skipped",
            "message": "AI anomaly analysis is currently limited to PDF uploads.",
        }

    try:
        rules_result = run_rules_checks(file_path, file_type)
    except Exception as exc:
        rules_result = {
            "status": "error",
            "message": f"Rules analysis failed: {exc}",
        }

    # ── AI ARTIFACT ──
    ai_artifact_result = run_ai_artifact_detection(extracted_text)

    # ── HIGHLIGHTS ──
    highlights_bundle = build_highlights(
        forensics_result=forensics_result,
        rules_result=rules_result,
        ai_result=ai_result,
    )

    # ── PREDICTION ──
    prediction = -1
    confidence = 0.0

    if ai_result.get("status") == "ok":
        risk = str(ai_result.get("risk_level")).upper()
        prediction = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}.get(risk, -1)
        confidence = float(ai_result.get("anomaly_score") or 0.0)

    # ── STORE ──
    analysis = AnalysisResult(
        invoice_id=invoice.invoice_id,
        prediction=prediction,
        confidence=confidence,
        model_version="layoutlmv3-isolation-forest",
        file_type=file_type,

        crypto_json=crypto,
        ai_json=ai_result,
        rules_json=rules_result,
        semantic_json=merged_fields,

        vendor_bank_json=bank_result,
        external_verification_json=external_verification,

        forensics_json=forensics_result,
        ai_artifact_json=ai_artifact_result,
        preview_json=preview,

        highlights_json=highlights_bundle["all"],
        spatial_highlights_json=highlights_bundle["spatial"],
        document_highlights_json=highlights_bundle["document"],
        highlight_summary_json=highlights_bundle["summary"],

        scoring_json=None,  # replace with real scoring object if/when you compute it
    )

    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    # ── RESPONSE ──
    return {
        "invoice_id": invoice.invoice_id,
        "file_type": file_type,
        "crypto": crypto,
        "vendor_bank": bank_result,
        "ai": ai_result,
        "rules": rules_result,
        "external_verification": external_verification,
        "semantic": merged_fields,
        "semantic_vendor_name": merged_fields.get("vendor_name"),
        "semantic_bank_account": merged_fields.get("bank_account"),
        "semantic_bank_name": merged_fields.get("bank_name"),
        "semantic_invoice_number": merged_fields.get("invoice_number"),
        "semantic_total_amount": merged_fields.get("total_amount"),
        "semantic_customer_name": merged_fields.get("customer_name"),
        "semantic_invoice_date": merged_fields.get("invoice_date"),
        "semantic_subtotal": merged_fields.get("subtotal"),
        "semantic_tax": merged_fields.get("tax"),
        "semantic_currency": merged_fields.get("currency"),
        "forensics": forensics_result,
        "highlights": highlights_bundle["all"],
        "spatial_highlights": highlights_bundle["spatial"],
        "document_highlights": highlights_bundle["document"],
        "highlight_summary": highlights_bundle["summary"],
        "preview": preview,
        "ai_artifact": ai_artifact_result,
    }


@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.user_id == user.id
    ).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    db.delete(invoice)
    db.commit()

    return {"message": "Invoice deleted"}
