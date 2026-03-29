import torch
from transformers import LayoutLMv3Processor, LayoutLMv3Model
from pdf2image import convert_from_path
from PIL import Image
import numpy as np
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)


# Load once (pretrained, frozen)
processor = LayoutLMv3Processor.from_pretrained(
    "microsoft/layoutlmv3-base",
    apply_ocr=True
)

model = LayoutLMv3Model.from_pretrained(
    "microsoft/layoutlmv3-base"
)
model.eval()  # inference mode


def extract_layoutlm_embedding(pdf_path):
    """
    Returns a single document-level embedding vector
    using LayoutLMv3.
    """

    # Convert first page of PDF to image
    images = convert_from_path(pdf_path, first_page=1, last_page=1)
    image = images[0].convert("RGB")

    # Prepare inputs
    encoding = processor(
        image,
        return_tensors="pt",
        truncation=True
    )

    with torch.no_grad():
        outputs = model(**encoding)

    # Use CLS token as document representation
    cls_embedding = outputs.last_hidden_state[:, 0, :]

    return cls_embedding.squeeze().cpu().numpy()
