from PyPDF2 import PdfReader
from integrity.signature_detection import detect_signature

def extract_pdf_content(file_path: str) -> dict:
    reader = PdfReader(file_path)

    text_content = ""
    for page in reader.pages:
        if page.extract_text():
            text_content += page.extract_text() + "\n"

    signature_info = detect_signature(file_path)

    return {
        "text": text_content.strip(),
        "signature_present": signature_info["present"],
        "signature_metadata": signature_info.get("metadata")
    }
