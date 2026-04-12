import logging

from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import async_validate_pdf_signature
from pyhanko_certvalidator import ValidationContext
from pyhanko_certvalidator.errors import PathBuildingError, PathValidationError

logger = logging.getLogger(__name__)


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

        except (PathBuildingError, PathValidationError) as e:
            # Expected case: self-signed or untrusted cert — the CA chain cannot
            # be validated, but the signature bytes themselves may still be intact.
            # Re-validate using the signer cert as its own trust root so we can
            # get an accurate intact flag without relying on a trusted CA.
            logger.warning(
                "Certificate path validation failed for %s (likely self-signed): %s",
                pdf_path, e
            )
            fingerprint = None
            intact = False
            try:
                signer_cert = sig.signer_cert
                fingerprint = signer_cert.sha256.hex() if signer_cert else None
                self_trust_ctx = ValidationContext(
                    trust_roots=[signer_cert] if signer_cert else [],
                    allow_fetching=False
                )
                recheck = await async_validate_pdf_signature(sig, self_trust_ctx)
                intact = recheck.intact
            except Exception as inner_e:
                logger.error(
                    "Integrity re-check failed for %s: %s", pdf_path, inner_e
                )
                intact = False

            return {
                "valid": intact,   # valid only if signature bytes are cryptographically intact
                "trusted": False,  # cert is not trusted by any recognised CA
                "intact": intact,
                "fingerprint": fingerprint,
                "reason": "self_signed_or_untrusted"
            }

        except Exception as e:
            logger.error(
                "Signature verification failed for %s: %s: %s",
                pdf_path, type(e).__name__, e
            )
            return {
                "valid": False,
                "trusted": False,
                "intact": False,
                "fingerprint": None,
                "reason": f"verification_error: {type(e).__name__}: {e}"
            }
