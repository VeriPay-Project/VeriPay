def verify_vendor_identity(
    signature_integrity: str,
    certificate_trust: str,
    signer_fingerprint: str | None,
    vendor
) -> dict:

    if signature_integrity != "valid":
        return {
            "signer_identity": "not_applicable",
            "signer_trust_model": "none"
        }

    if vendor is None:
        return {
            "signer_identity": "unregistered",
            "signer_trust_model": "none"
        }

    registered_fingerprint = getattr(vendor, "public_key_fingerprint", None)
    if not registered_fingerprint:
        return {
            "signer_identity": "unregistered",
            "signer_trust_model": "none"
        }

    if signer_fingerprint != registered_fingerprint:
        return {
            "signer_identity": "mismatch",
            "signer_trust_model": "none"
        }

    # 🔑 TRUST MODEL COMES FROM CERTIFICATE, NOT REGISTRATION
    if certificate_trust == "public":
        trust_model = "ca_signed"
    elif certificate_trust == "private":
        trust_model = "self_signed"
    else:
        trust_model = "none"

    return {
        "signer_identity": "verified",
        "signer_trust_model": trust_model
    }
