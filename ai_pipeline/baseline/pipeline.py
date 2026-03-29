from utils.pdf_to_image import pdf_to_images
from utils.ocr import extract_text_from_image
from baseline.features import extract_features


def process_invoice(pdf_path):
    text = ""
    images = pdf_to_images(pdf_path)

    for img in images:
        text += extract_text_from_image(img)

    return extract_features(text)
