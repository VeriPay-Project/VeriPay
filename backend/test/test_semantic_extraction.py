import json
from backend.extraction.text_for_llm import extract_text_for_llm
from ai_pipeline.semantic_extractor import extract_semantic_fields



PDF_PATH = r"test_pdfs\a99.pdf" # change to real path

payload = extract_text_for_llm(PDF_PATH)

print("Extraction method:", payload["method"])

if payload["method"] == "none":
    print("No usable text found")
else:
    result = extract_semantic_fields(payload["text"])
    print(json.dumps(result, indent=2))
