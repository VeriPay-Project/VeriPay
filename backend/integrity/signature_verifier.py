from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import async_validate_pdf_signature
from pyhanko_certvalidator import ValidationContext


async def verify_signature(pdf_path: str) -> dict:
    with open(pdf_path, "rb") as f:
        reader = PdfFileReader(f)
        sigs = reader.embedded_signatures

        if not sigs:
            return {
                "valid": False,
                "trusted": False,
                "intact": False,
                "fingerprint": None,
                "reason": "no_signature"
            }

        sig = sigs[0]

        try:
            status = await async_validate_pdf_signature(
                sig,
                ValidationContext(allow_fetching=False)
            )

            cert = status.signing_cert
            fingerprint = cert.sha256.hex() if cert else None

            return {
                "valid": status.valid,
                "trusted": status.trusted,
                "intact": status.intact,
                "fingerprint": fingerprint
            }

        except Exception as e:
            # Self-signed or untrusted certs land here
            cert = sig.signer_cert
            fingerprint = cert.sha256.hex() if cert else None

            return {
                "valid": True,
                "trusted": False,
                "intact": True,
                "fingerprint": fingerprint,
                "reason": "self_signed_or_untrusted"
            }
