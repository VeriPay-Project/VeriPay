from pyhanko.pdf_utils.reader import PdfFileReader

def detect_signature(pdf_path: str) -> dict:
    try:
        with open(pdf_path, "rb") as f:
            reader = PdfFileReader(f)
            sigs = reader.embedded_signatures

            return {
                "present": bool(sigs),
                "count": len(sigs)
            }

    except Exception as e:
        return {
            "present": False,
            "error": str(e)
        }
