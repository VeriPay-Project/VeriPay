from PyPDF2 import PdfReader
import pytesseract
from pdf2image import convert_from_path



def extract_text_from_pdf(pdf_path: str) -> str:
    reader = PdfReader(pdf_path)
    text = []

    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text.append(page_text)

    return "\n".join(text).strip()


def extract_text_with_ocr(pdf_path: str) -> str:
    images = convert_from_path(pdf_path)
    text = []

    for img in images:
        text.append(pytesseract.image_to_string(img))

    return "\n".join(text).strip()


def extract_text_for_llm(pdf_path: str) -> dict:
    """
    Returns:
    {
        "text": str,
        "method": "pdf_text" | "ocr" | "none"
    }
    """

    text = extract_text_from_pdf(pdf_path)

    if text and len(text.split()) > 30:
        return {"text": text, "method": "pdf_text"}

    # fallback to OCR
    ocr_text = extract_text_with_ocr(pdf_path)

    if ocr_text and len(ocr_text.split()) > 30:
        return {"text": ocr_text, "method": "ocr"}

    return {"text": "", "method": "none"}
