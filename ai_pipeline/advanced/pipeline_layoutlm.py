from advanced.layoutlm_features import extract_layoutlm_embedding


def process_invoice_layoutlm(pdf_path):
    """
    Processes an invoice using LayoutLMv3 embeddings
    instead of handcrafted features.
    """
    return extract_layoutlm_embedding(pdf_path)
