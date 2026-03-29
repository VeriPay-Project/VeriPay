from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from cryptography import x509
from cryptography.hazmat.backends import default_backend
import hashlib
import os
from cryptography.hazmat.primitives import serialization
from services.iban_registry_service import verify_iban_external
from services.plaid_service import (
    PlaidServiceError,
    create_link_token,
    exchange_public_token,
    get_account_data,
)

from services.bank_validation_service import validate_account
from services.bank_utils import (
    detect_account_type,
    get_test_invoice_from_binding,
    hash_account,
    mask_account,
    normalize_account_by_country,
)

from models.vendor import Vendor
from models.vendor_bank_binding import VendorBankBinding
from dependencies import get_db, get_current_user
from models.user import User
from schemas.vendor import PlaidLinkTokenResponse, PlaidPublicTokenExchangeRequest

router = APIRouter(
    prefix="/vendors",
    tags=["Vendors"]
)

DEV_MODE_OVERRIDE_BANK = os.getenv("DEV_MODE_OVERRIDE_BANK", "false").lower() == "true"


def _clean_text(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None

    cleaned = value.strip()
    return cleaned or None


def _normalize_country(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    return cleaned.upper() if cleaned else None


def _normalize_account_type(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    return cleaned.lower() if cleaned else None


def _build_validation_payload(
    country: str,
    normalized_account: str,
) -> dict:
    if country == "US":
        routing = normalized_account.split("-", 1)[0]
        return {"routing": routing, "iban": None}

    if country == "OTHER":
        return {"routing": None, "iban": normalized_account}

    return {"routing": None, "iban": None}


def _get_vendor_or_404(db: Session, vendor_id: int) -> Vendor:
    vendor = db.query(Vendor).filter(
        Vendor.vendor_id == vendor_id
    ).first()

    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    return vendor


def _build_plaid_account_identifier(
    account_data: dict,
) -> tuple[str, str | None, str, str]:
    country = _normalize_country(account_data.get("country"))

    if country == "CA":
        institution = _clean_text(account_data.get("institution_number"))
        transit = _clean_text(account_data.get("transit_number"))
        account_number = _clean_text(account_data.get("account_number"))
        routing_number = f"{institution}-{transit}" if institution and transit else None
        if routing_number and account_number:
            return country, routing_number, account_number, f"{routing_number}-{account_number}"

    if country == "US":
        routing_number = _clean_text(account_data.get("routing_number"))
        account_number = _clean_text(account_data.get("account_number"))
        if routing_number and account_number:
            return country, routing_number, account_number, f"{routing_number}-{account_number}"

    iban = _clean_text(account_data.get("iban"))
    if iban:
        return "OTHER", None, iban, iban

    raise PlaidServiceError("Plaid account data did not include a supported identifier")


# =========================
# REGISTER VENDOR
# =========================
@router.post("/", status_code=status.HTTP_201_CREATED)
async def register_vendor(
    user: User = Depends(get_current_user),
    vendor_name: str = Form(...),
    certificate: UploadFile | None = File(None),
    db: Session = Depends(get_db)
):
    fingerprint = None

    if certificate is not None:
        cert_bytes = await certificate.read()
        if not cert_bytes:
            raise HTTPException(
                status_code=400,
                detail="Certificate file is empty"
            )

        try:
            cert = x509.load_pem_x509_certificate(cert_bytes, default_backend())
        except ValueError:
            try:
                cert = x509.load_der_x509_certificate(cert_bytes, default_backend())
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid certificate file"
                )

        fingerprint = hashlib.sha256(
            cert.public_bytes(serialization.Encoding.DER)
        ).hexdigest()

        existing = db.query(Vendor).filter(
            Vendor.public_key_fingerprint == fingerprint
        ).first()

        if existing:
            raise HTTPException(
                status_code=400,
                detail="Vendor with this certificate already exists"
            )

    vendor = Vendor(
        vendor_name=vendor_name,
        public_key_fingerprint=fingerprint,
        status="active"
    )

    db.add(vendor)
    db.commit()
    db.refresh(vendor)

    return {
        "vendor_id": vendor.vendor_id,
        "vendor_name": vendor.vendor_name,
        "status": vendor.status
    }


# =========================
# REGISTER BANK BINDING
# =========================
@router.post("/{vendor_id}/bank-binding")
def register_vendor_bank_binding(
    vendor_id: int,
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vendor = _get_vendor_or_404(db, vendor_id)

    account_identifier = payload.get("account_identifier")
    requested_country = _normalize_country(payload.get("country"))
    requested_account_type = _normalize_account_type(payload.get("account_type"))

    if not account_identifier:
        raise HTTPException(
            status_code=400,
            detail="account_identifier is required"
        )

    detected_account_type, detected_country = detect_account_type(account_identifier)
    country = requested_country or detected_country
    account_type = requested_account_type or detected_account_type

    if not country:
        raise HTTPException(status_code=400, detail="country is required")

    if not account_type:
        raise HTTPException(status_code=400, detail="account_type is required")

    if detected_country and requested_country and detected_country != requested_country:
        raise HTTPException(
            status_code=400,
            detail="Account identifier does not match the provided country"
        )

    if detected_account_type and requested_account_type and detected_account_type != requested_account_type:
        raise HTTPException(
            status_code=400,
            detail="Account identifier does not match the provided account type"
        )

    normalized_account = normalize_account_by_country(country, account_identifier)
    if not normalized_account:
        raise HTTPException(
            status_code=400,
            detail="Invalid account identifier format"
        )

    account_hash = hash_account(normalized_account)
    masked_account = mask_account(normalized_account)

    validation = validate_account(
        country,
        _build_validation_payload(country, normalized_account)
    )

    if not validation["valid"]:
        raise HTTPException(
            status_code=400,
            detail=validation["reason"]
        )

    external_verification = None

    if country == "OTHER":
        external_verification = verify_iban_external(normalized_account)

        if not external_verification["success"]:
            raise HTTPException(
                status_code=400,
                detail=external_verification["reason"]
            )

    existing = db.query(VendorBankBinding).filter(
        VendorBankBinding.vendor_id == vendor_id,
        VendorBankBinding.account_hash == account_hash,
        VendorBankBinding.country == country
    ).first()

    if existing:
        if not existing.account_normalized:
            existing.account_normalized = normalized_account
            existing.account_masked = masked_account
            db.commit()
            db.refresh(existing)
        return {
            "status": "already_registered",
            "external_verification": external_verification
        }

    bank_name = (
        external_verification.get("bank_name")
        if external_verification and external_verification.get("bank_name")
        else _clean_text(payload.get("bank_name"))
    )
    account_holder_name = _clean_text(payload.get("account_holder_name"))
    currency = _clean_text(payload.get("currency"))
    if currency:
        currency = currency.upper()

    binding = VendorBankBinding(
        vendor_id=vendor_id,
        account_normalized=normalized_account,
        account_hash=account_hash,
        account_masked=masked_account,
        bank_name=bank_name,
        account_type=account_type,
        currency=currency,
        country=country,
        account_holder_name=account_holder_name,
        verification_status="validated",
        verification_reference="iban_registry" if external_verification else "manual_entry",
        is_active=True
    )

    db.add(binding)
    db.commit()
    db.refresh(binding)

    return {
        "status": "registered",
        "vendor_id": vendor_id,
        "masked_account": masked_account,
        "external_verification": external_verification
    }


# =========================
# PLAID LINK TOKEN
# =========================
@router.post(
    "/{vendor_id}/plaid/link-token",
    status_code=status.HTTP_200_OK,
    response_model=PlaidLinkTokenResponse,
)
def create_vendor_plaid_link_token(
    vendor_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_vendor_or_404(db, vendor_id)

    try:
        link_token = create_link_token(f"vendor-{vendor_id}-user-{user.id}")
    except PlaidServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"link_token": link_token}


# =========================
# PLAID TOKEN EXCHANGE
# =========================
@router.post("/{vendor_id}/plaid/exchange", status_code=status.HTTP_200_OK)
def exchange_vendor_plaid_token(
    vendor_id: int,
    payload: PlaidPublicTokenExchangeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_vendor_or_404(db, vendor_id)

    try:
        exchange_result = exchange_public_token(payload.public_token)
        account_data = get_account_data(exchange_result["access_token"])
        country, routing_number, account_number, raw_identifier = _build_plaid_account_identifier(account_data)
    except PlaidServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Plaid sandbox uses fixed test accounts like:
    # routing: 021000021
    # account: 1111222233330000
    # You MUST use the same values in invoice testing
    if DEV_MODE_OVERRIDE_BANK and country in {"US", "CA"} and routing_number:
        print("⚠️ DEV MODE: Overriding Plaid account for testing")
        account_number = "000123456789"
        raw_identifier = f"{routing_number}-{account_number}"

    normalized_account = normalize_account_by_country(country, raw_identifier)
    if not normalized_account:
        raise HTTPException(status_code=400, detail="Unsupported Plaid account format")

    account_hash = hash_account(normalized_account)
    masked_account = mask_account(normalized_account)
    bank_name = _clean_text(account_data.get("bank_name"))
    print("🚀 PLAID STORED ACCOUNT:")
    print("Routing:", routing_number)
    print("Account:", account_number)
    print("Normalized:", normalized_account)

    existing = db.query(VendorBankBinding).filter(
        VendorBankBinding.vendor_id == vendor_id,
        VendorBankBinding.account_hash == account_hash,
        VendorBankBinding.country == country,
    ).first()

    if existing:
        # Refresh normalized storage on every Plaid re-link and backfill old rows.
        existing.account_normalized = normalized_account
        existing.account_hash = account_hash
        existing.account_masked = masked_account
        existing.bank_name = bank_name or existing.bank_name
        existing.country = country
        existing.account_type = "plaid_verified"
        existing.verification_status = "verified"
        existing.verification_reference = "plaid"
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        print("🧪 MATCHING INVOICE INPUT:", get_test_invoice_from_binding(existing))
        return {
            "status": "registered",
            "vendor_id": vendor_id,
            "masked_account": masked_account,
            "country": country,
            "account_type": "plaid_verified",
            "verification_reference": "plaid",
            "item_id": exchange_result["item_id"],
        }

    binding = VendorBankBinding(
        vendor_id=vendor_id,
        account_normalized=normalized_account,
        account_hash=account_hash,
        account_masked=masked_account,
        bank_name=bank_name,
        country=country,
        account_type="plaid_verified",
        verification_status="verified",
        verification_reference="plaid",
        is_active=True,
    )

    db.add(binding)
    db.commit()
    db.refresh(binding)
    print("🧪 MATCHING INVOICE INPUT:", get_test_invoice_from_binding(binding))

    return {
        "status": "registered",
        "vendor_id": vendor_id,
        "masked_account": masked_account,
        "country": country,
        "account_type": "plaid_verified",
        "verification_reference": "plaid",
        "item_id": exchange_result["item_id"],
    }
# =========================
# GET VENDOR
# =========================
@router.get("/{vendor_id}", status_code=status.HTTP_200_OK)
def get_vendor(
    vendor_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vendor = db.query(Vendor).filter(
        Vendor.vendor_id == vendor_id
    ).first()

    if not vendor:
        raise HTTPException(
            status_code=404,
            detail="Vendor not found"
        )

    return {
        "vendor_id": vendor.vendor_id,
        "vendor_name": vendor.vendor_name,
        "public_key_fingerprint": vendor.public_key_fingerprint,
        "status": vendor.status
    }


# =========================
# GET BANK BINDINGS
# =========================
@router.get("/{vendor_id}/bank-bindings", status_code=status.HTTP_200_OK)
def get_vendor_bank_bindings(
    vendor_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vendor = db.query(Vendor).filter(
        Vendor.vendor_id == vendor_id
    ).first()

    if not vendor:
        raise HTTPException(
            status_code=404,
            detail="Vendor not found"
        )

    bindings = db.query(VendorBankBinding).filter(
        VendorBankBinding.vendor_id == vendor_id
    ).all()

    return [
        {
            "id": b.id,
            "bank_name": b.bank_name,
            "account_holder_name": b.account_holder_name,
            "account_masked": b.account_masked,
            "account_type": b.account_type,
            "currency": b.currency,
            "country": b.country,
            "verification_status": b.verification_status,
            "verified_at": b.verified_at,
            "is_active": b.is_active,
            "created_at": b.created_at
        }
        for b in bindings
    ]


# =========================
# LIST VENDORS
# =========================
@router.get("/")
def list_vendors(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vendors = db.query(Vendor).all()

    return [
        {
            "vendor_id": v.vendor_id,
            "vendor_name": v.vendor_name,
            "status": v.status,
        }
        for v in vendors
    ]
