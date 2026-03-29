from integrity.signature_detection import detect_signature
from integrity.signature_verifier import verify_signature


async def evaluate_integrity(file_path: str, file_type: str) -> dict:

    if file_type != "pdf":
        return {
            "document_type": "image",
            "signature_present": False,
            "signature_integrity": "not_applicable",
            "certificate_trust": "none",
            "signer_fingerprint": None
        }

    detection = detect_signature(file_path)

    if not detection.get("present"):
        return {
            "document_type": "pdf",
            "signature_present": False,
            "signature_integrity": "not_applicable",
            "certificate_trust": "none",
            "signer_fingerprint": None
        }

    verification = await verify_signature(file_path)

    integrity = "valid" if verification.get("valid") else "invalid"
    trust = "public" if verification.get("trusted") else "private"

    return {
    "signature_present": True,
    "signature_integrity": integrity,
    "certificate_trust": trust,
    "signer_fingerprint": verification.get("fingerprint")
}