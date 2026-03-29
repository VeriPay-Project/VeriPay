from advanced.layoutlm_features import extract_layoutlm_embedding


vec = extract_layoutlm_embedding("sample_invoices/invoice_10249.pdf")

print("Embedding shape:", vec.shape)
print("First 10 values:", vec[:10])
