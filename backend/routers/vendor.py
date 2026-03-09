from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from cryptography import x509
from cryptography.hazmat.backends import default_backend
import hashlib
from cryptography.hazmat.primitives import serialization

from models.vendor import Vendor
from models.vendor_bank_binding import VendorBankBinding
from utils.bank_hashing import prepare_account_for_storage
from dependencies import get_db
from dependencies import get_current_user
from models.user import User

router = APIRouter(
    prefix="/vendors",
    tags=["Vendors"]
)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def register_vendor(
    user: User = Depends(get_current_user),
    vendor_name: str = Form(...),
    certificate: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    cert_bytes = await certificate.read()

    try:
        cert = x509.load_pem_x509_certificate(cert_bytes, default_backend())
    except ValueError:
        try:
            cert = x509.load_der_x509_certificate(cert_bytes, default_backend())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid certificate file")

    fingerprint = hashlib.sha256(
    cert.public_bytes(serialization.Encoding.DER)).hexdigest()

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


@router.post("/{vendor_id}/bank-binding")
def register_vendor_bank_binding(
    vendor_id: int,
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vendor = db.query(Vendor).filter(
        Vendor.vendor_id == vendor_id
    ).first()

    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    account_identifier = payload.get("account_identifier")
    if not account_identifier:
        raise HTTPException(status_code=400, detail="account_identifier is required")

    prepared = prepare_account_for_storage(account_identifier)
    if not prepared.get("hash"):
        raise HTTPException(status_code=400, detail="Invalid account identifier")

    existing = db.query(VendorBankBinding).filter(
        VendorBankBinding.vendor_id == vendor_id,
        VendorBankBinding.account_hash == prepared["hash"]
    ).first()

    if existing:
        return {"status": "already_registered"}

    binding = VendorBankBinding(
        vendor_id=vendor_id,
        account_hash=prepared["hash"],
        account_masked=prepared["masked"],
        bank_name=payload.get("bank_name"),
        account_type=payload.get("account_type"),
        currency=payload.get("currency"),
        country=payload.get("country"),
        account_holder_name=payload.get("account_holder_name"),
        verification_status="verified",
        is_active=True
    )

    db.add(binding)
    db.commit()
    db.refresh(binding)

    return {
        "status": "registered",
        "vendor_id": vendor_id,
        "masked_account": prepared["masked"]
    }
