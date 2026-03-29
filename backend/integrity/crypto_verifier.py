from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature

def verify_pdf_signature(pdf_path: str) -> dict:
    with open(pdf_path, "rb") as f:
        reader = PdfFileReader(f)
        signatures = reader.embedded_signatures

        if not signatures:
            return {
                "is_signed": False,
                "crypto_valid": None,
                "signer_fingerprint": None
            }

        sig = signatures[0]
        status = validate_pdf_signature(sig)

        cert = status.signer_cert
        fingerprint = cert.fingerprint("sha256").hex() if cert else None

        return {
            "is_signed": True,
            "crypto_valid": status.valid,
            "signer_fingerprint": fingerprint
        }
