# VeriPay — Final Presentation Technical Reference

## What is VeriPay?

VeriPay is an **AI-powered invoice fraud detection and verification platform** for accounts payable teams and finance controllers. It uses a multi-layered analysis approach combining:
- Deep learning document understanding (LayoutLMv3 + IsolationForest)
- Cryptographic PDF signature verification (pyHanko)
- Image forensics (ELA, noise, copy-move, font analysis)
- LLM-based semantic field extraction (Ollama/Qwen2.5)
- Open banking account verification (Plaid)
- A human-in-the-loop review workflow with full audit logging

---

## Complete Tech Stack

### Backend
| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Web Framework | FastAPI | 0.128.0 | REST API, async routing, dependency injection |
| ASGI Server | Uvicorn | 0.40.0 | Python async HTTP server |
| ORM | SQLAlchemy | 2.0.45 | Database models, queries |
| Migrations | Alembic | latest | Schema versioning |
| Database | PostgreSQL (Supabase) | — | Persistent storage |
| DB Driver | psycopg2-binary | 2.9.11 | Python-PostgreSQL adapter |
| PDF Text | PyPDF2 | 3.0.1 | Text extraction from PDFs |
| PDF Tables | pdfplumber | latest | Structured table extraction |
| PDF Render | PyMuPDF (fitz) | latest | PDF → image rendering |
| PDF → PNG | pdf2image + Poppler | 1.17.0 | Page-level image conversion |
| OCR | pytesseract + Tesseract | 0.3.13 | Image text extraction |
| Image Processing | Pillow | 12.1.0 | Image manipulation, ELA |
| Computer Vision | OpenCV | latest | SIFT/ORB copy-move detection |
| PDF Signatures | pyHanko | 0.32.0 | Validate embedded PDF signatures |
| Cert Validation | pyhanko-certvalidator | 0.29.0 | X.509 certificate chain validation |
| Cryptography | cryptography | 46.0.3 | Hashing, cert parsing |
| Password Hashing | bcrypt | 5.0.0 | Secure password storage |
| Session Signing | itsdangerous | 2.1.2 | Signed HTTP session cookies |
| Rate Limiting | slowapi | 0.1.9 | Per-endpoint request throttling |
| HTTP Client | requests / httpx | latest | External API calls |
| Validation | Pydantic | 2.x | Request/response schema validation |
| Env Config | python-dotenv | 1.2.1 | .env file loading |

### AI / ML
| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| LLM Server | Ollama | latest | Local LLM inference runtime |
| LLM Model | Qwen 2.5 (0.5B) | qwen2.5:0.5b | Semantic field extraction, AI artifact detection |
| Transformers | HuggingFace transformers | 4.48.0 | LayoutLMv3 model loading + inference |
| Document AI | microsoft/layoutlmv3-base | — | Multimodal invoice embedding (text + layout) |
| Deep Learning | PyTorch | 2.3.1 | Tensor operations, model inference |
| Anomaly Detection | scikit-learn IsolationForest | 1.5.2 | Unsupervised fraud scoring |
| Numerics | NumPy | 1.26.4 | Vector math, embedding operations |
| Model Storage | joblib | 1.3.0 | Serialize/deserialize sklearn models |

### Frontend
| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | Next.js | 16.1.4 | React meta-framework, App Router, SSR |
| UI Library | React | 19.2.3 | Component model, context API |
| Language | TypeScript | 5 | Type-safe JavaScript |
| Styling | Tailwind CSS | 3.4.19 | Utility-first CSS |
| UI Primitives | Radix UI | multiple | Accessible headless components |
| Icons | lucide-react | 0.563.0 | SVG icon set |
| Animations | framer-motion | 12.34.3 | Smooth page/component transitions |
| Theme | next-themes | 0.4.6 | Dark/light mode |
| Class Utilities | clsx, tailwind-merge | latest | Conditional className merging |

### External Services
| Service | Purpose |
|---------|---------|
| Supabase | Managed PostgreSQL hosting |
| Plaid (Sandbox) | Open banking — verify vendor bank accounts |
| openiban.com | Free IBAN structure validation API |
| HuggingFace Hub | LayoutLMv3-base model download |

### Deployment & DevOps
| Tool | Purpose |
|------|---------|
| Docker | Container images for backend + frontend |
| Docker Compose | Orchestrate 4 services (backend, frontend, ollama, ollama_init) |
| Alembic | Auto-run `upgrade head` on startup |

---

## Service-by-Service Breakdown + Professor Questions

---

### 1. Invoice Upload Service
**File:** `backend/routers/invoice.py`

**What it does:**
- Accepts PDF or image file (max 50 MB)
- Validates MIME type AND magic bytes (not just extension)
- Deduplicates using SHA-256 file hash — same invoice can't be uploaded twice
- Extracts raw text via PyPDF2 (PDFs) or Tesseract OCR (images)
- Detects embedded digital signature (pyHanko)
- Stores file under `invoices/<user_id>/<date>/<uuid>.<ext>`
- Creates an `Invoice` record in PostgreSQL with status `"uploaded"`
- Logs action to `audit_logs`

**5 Technical Questions:**
1. *Why do you validate both MIME type and magic bytes? Why isn't just checking the file extension sufficient?*
   - Extensions are user-controlled and trivially spoofed. Magic bytes (file signature bytes at byte offset 0) are part of the binary content itself — `%PDF` for PDFs, `\x89PNG` for PNGs, `\xff\xd8\xff` for JPEGs. A file named `malware.pdf` with PNG magic bytes would be rejected.

2. *How does SHA-256 deduplication work and what problem does it solve?*
   - The entire file is hashed to a 256-bit digest before storage. We check if that hash exists in the `invoices` table (`file_hash` column, unique constraint). If it does, we reject with a 409 Conflict. This prevents the same invoice being re-analyzed, prevents double payments on identical invoices, and saves storage.

3. *What is a decompression bomb and how do you protect against it?*
   - A specially crafted small image that expands to gigabytes in memory when decompressed (e.g., a 1×1 pixel PNG with 9999 repeats). Pillow's `Image.open()` is called with `MAX_IMAGE_PIXELS` limit set, which raises `DecompressionBombError` before loading into RAM.

4. *Why store files as `<user_id>/<date>/<uuid>` rather than flat storage?*
   - Namespace isolation prevents one user from guessing another's file paths. Date subdirectory keeps directory entry count manageable (no inode exhaustion). UUID prevents filename collisions and removes predictability.

5. *Why use async background tasks for analysis instead of running it synchronously in the upload response?*
   - LayoutLMv3 inference, Ollama LLM calls, and forensic analysis can take 15–60+ seconds. A synchronous endpoint would hold the HTTP connection open, blocking the server worker. Background tasks let the upload return immediately (202 Accepted) while analysis runs independently, which scales much better.

---

### 2. LayoutLMv3 + IsolationForest Anomaly Detection
**Files:** `ai_pipeline/advanced/layoutlm_features.py`, `ai_pipeline/advanced/anomaly.py`, `backend/services/analysis_service.py`

**What it does:**
- Loads **microsoft/layoutlmv3-base** from HuggingFace — a multimodal transformer that jointly encodes token text, bounding box position, and image patches from the same page
- Renders invoice page to image (pdf2image/Poppler), runs Tesseract OCR to get word-level bounding boxes
- Feeds `(word, bbox, image)` triples through LayoutLMv3 to get a **768-dimensional embedding** of the invoice's layout and content
- Scores embedding against a trained **IsolationForest** (unsupervised anomaly detector) trained on known-good invoices
- Also computes Euclidean distance from centroid of known-good embeddings; normalizes by std deviation to get a "layout familiarity" score
- Returns: `prediction` (0/1 anomaly flag), `confidence`, `layout_familiarity`, `rejection_probability`

**5 Technical Questions:**
1. *Why use LayoutLMv3 instead of a plain text transformer like BERT for invoice analysis?*
   - Plain text transformers discard spatial information. Invoice fraud often involves moving amounts, rearranging line items, or inserting fake fields that look correct textually but are positioned wrongly (e.g., a total in the header area). LayoutLMv3 encodes the (x1, y1, x2, y2) bounding box of every token as positional embeddings alongside the text, and adds visual patch embeddings from the rendered page image, making it sensitive to layout anomalies text models would miss.

2. *Why IsolationForest for anomaly detection rather than a supervised classifier?*
   - Labeled fraud data is extremely scarce — you can't collect thousands of real fraudulent invoices to train on. IsolationForest is **unsupervised**: it learns the distribution of normal invoices and flags anything that isolates easily (short average path length in random trees = anomalous). This works with zero fraud labels. A supervised approach would require balanced, labeled examples of each fraud pattern.

3. *What is the "layout familiarity" score and how is it computed?*
   - After extracting the 768-dim embedding from LayoutLMv3, we compute its Euclidean distance from the centroid (mean embedding) of all training invoices. We normalize this by the standard deviation of distances observed during training. A high z-score means the invoice is far from what "normal" looks like in embedding space, regardless of whether the text appears correct.

4. *How does IsolationForest actually isolate anomalies?*
   - It builds an ensemble of random decision trees. At each node, it randomly selects a feature and a random split value within that feature's range. Normal points (clustered together) require many splits to isolate — they have long paths to leaf nodes. Anomalous points (in sparse regions of feature space) are isolated with very few splits — short paths. The anomaly score is the average normalized path length across all trees; shorter = more anomalous.

5. *What are the limitations of this approach and how do you mitigate them?*
   - IsolationForest can produce false positives for legitimate but unusual invoice formats (foreign vendors, unusual currencies). Mitigation: (1) user-specific LayoutLMv3 fine-tuning so the model adapts to each organization's vendor set; (2) ensemble scoring combines anomaly score with rule-based and forensic signals rather than treating it as the sole decision; (3) human review workflow where analysts can override and add decisions as training signal.

---

### 3. Image Forensics Service
**File:** `backend/services/forensics_service.py`

**What it does:**
- Converts invoice to image (if PDF, renders first page)
- Runs **5 independent forensic checks**:
  1. **ELA (Error Level Analysis)**: Re-compresses the image at a known JPEG quality, diffs it with the original. Edited regions (pasted content) re-compressed from a different quality level show up as high-error areas
  2. **Noise Analysis**: Estimates sensor/scanner noise level; artificially generated or copy-pasted regions have abnormally uniform or inconsistent noise signatures
  3. **Font Consistency**: OCRs the invoice and checks if glyphs from the same supposed font vary in spacing, size, or baseline — indicative of character-level editing
  4. **Copy-Move Detection**: Uses SIFT/ORB keypoint matching to find repeated visual patterns within the same document — a cloned/duplicated region for amount manipulation
  5. **Metadata Analysis**: Checks EXIF/PDF metadata for inconsistent creation tools, modification dates, or mixed software origins
- Each check returns a 0.0–1.0 suspicion score calibrated against a 1,323-invoice dataset
- Signals are aggregated with risk boost multipliers into a final forensics score

**5 Technical Questions:**
1. *How does ELA detect image manipulation?*
   - JPEG compression is lossy and non-uniform — it divides the image into 8×8 DCT blocks. When you save an unedited JPEG at quality Q, all blocks reach a consistent residual error level. If someone pastes content from a different source image (saved at a different quality), those blocks had different prior compression history and show a distinctly different error level when re-compressed. You visualize the absolute difference between the original and re-compressed version — bright spots = manipulated regions.

2. *Why use both SIFT and ORB for copy-move detection? Why not just one?*
   - SIFT (Scale-Invariant Feature Transform) is highly accurate and scale/rotation invariant but computationally expensive and patent-sensitive. ORB (Oriented FAST and Rotated BRIEF) is a free, faster alternative but slightly less discriminative. Using both and requiring agreement reduces false positives — a match flagged by both algorithms is more reliable than one flagged by either alone.

3. *What is the limitation of ELA on PDFs and how do you handle it?*
   - PDFs are vector formats — rendering them to JPEG introduces compression artifacts from the rendering process itself, not from any manipulation. This can produce false ELA signals everywhere. We handle this by: (a) rendering at high DPI to minimize JPEG quantization artifacts, (b) using PNG as intermediate format where possible, (c) weighting ELA lower for PDF-origin invoices compared to direct JPEG scans.

4. *How did you calibrate forensic scores against 1,323 invoices?*
   - The threshold values and risk multipliers were derived by running the forensic pipeline over a dataset of known-clean and known-manipulated invoices, computing precision/recall at each threshold, and selecting operating points that minimize false positives while catching high-confidence manipulations. The 1,323 figure represents the size of the calibration corpus.

5. *Could an attacker evade ELA by re-saving the invoice before submission?*
   - Yes — ELA is a fragile signal that can be defeated by a full re-save at uniform quality. This is why forensics is only one of five layers: the ensemble scorer combines it with LayoutLMv3 anomaly detection, semantic analysis, cryptographic verification, and rules engine. An attacker defeating ELA would still face anomaly detection, signature invalidation, and bank account mismatch. Defense in depth mitigates any single signal's weakness.

---

### 4. Semantic Extraction Service (Ollama / Qwen2.5 LLM)
**File:** `backend/services/semantic_extraction_service.py`

**What it does:**
- Sends extracted invoice text (truncated to 2,200 chars) to a locally-running **Ollama** LLM server
- Model: **Qwen2.5 0.5B** — a small, fast, quantized language model
- Prompt instructs the LLM to return a structured JSON object with fields:
  - `vendor_name`, `invoice_number`, `invoice_date`, `due_date`
  - `subtotal`, `tax_amount`, `total_amount`
  - `bank_account`, `iban`, `routing_number`
  - `ai_generated_text_detected` (boolean)
- Falls back to regex patterns if the LLM response is malformed or times out (45s timeout)
- The `ai_generated_text_detected` flag asks the LLM to assess whether the invoice text reads as synthetically generated (formulaic, unnaturally perfect, no variance)

**5 Technical Questions:**
1. *Why run a local LLM (Ollama) instead of using the OpenAI or Anthropic API for extraction?*
   - Invoices contain sensitive financial data — vendor names, account numbers, amounts. Sending this to a third-party cloud API raises data privacy and compliance concerns. Ollama runs entirely on-premise in a Docker container; data never leaves the host. Local inference also eliminates per-token API costs and removes external latency/availability dependencies.

2. *Why Qwen2.5 0.5B and not a larger model like Llama 3 8B or GPT-4?*
   - Extraction is a structured task (fill in JSON fields) — it doesn't require deep reasoning. A 0.5B model with a clear JSON prompt performs adequately for field extraction while being orders of magnitude faster and lighter (fits in CPU RAM on modest hardware). Larger models improve quality marginally but increase inference time from ~2s to 20–60s, making them impractical for a synchronous analysis step.

3. *How do you ensure the LLM returns valid JSON and not free-form text?*
   - The prompt explicitly instructs JSON-only output with a defined schema and provides a template. The response is parsed with `json.loads()` inside a try/except block. If parsing fails or required fields are missing, the service falls back to regex-based extraction. This two-layer approach (LLM primary, regex fallback) ensures the pipeline never stalls due to a malformed LLM output.

4. *How can the LLM detect AI-generated invoice text? What linguistic signals does it use?*
   - The LLM is prompted to look for: unnaturally consistent formatting, perfectly structured sentences with no natural variation, generic placeholder-style language ("Please remit payment by the due date"), uniform terminology unlikely in real business correspondence, and absence of regional/industry-specific phrasing. This is a heuristic — the model is leveraging its training distribution knowledge to assess whether the text matches human-authored business writing.

5. *What is the 2,200-character truncation limit and why is it set there?*
   - Qwen2.5 0.5B has a limited context window, and longer prompts increase inference time and risk of the model losing focus on the structured extraction task. 2,200 characters captures the first ~1–1.5 pages of most invoices, which contain all the critical header fields. The truncation is applied after sorting extracted text lines by vertical position to ensure the header fields (vendor info, amounts, account numbers) appear in the beginning and aren't cut off.

---

### 5. Cryptographic Signature Verification
**Files:** `backend/integrity/signature_verifier.py`, `backend/integrity/crypto_verifier.py`, `backend/integrity/integrity_service.py`

**What it does:**
- Detects whether the uploaded PDF has an embedded **digital signature** (CMS/PKCS#7 format in `/ByteRange` + `/Contents` fields)
- Uses **pyHanko** to validate the signature: verifies the certificate chain up to a trusted root, checks that the signed byte ranges cover the entire document (modification detection), validates certificate validity period and revocation status
- Extracts the **signer's public key fingerprint** (SHA-256 hash of the DER-encoded certificate)
- Matches fingerprint against the `vendors` table to identify which registered vendor signed the document
- Returns: `is_signed`, `signature_valid`, `signer_name`, `signer_fingerprint`, `certificate_chain_valid`, `signing_timestamp`, `modifications_detected`

**5 Technical Questions:**
1. *What is a PDF digital signature at a cryptographic level and what does it actually prove?*
   - A PDF digital signature is a CMS (Cryptographic Message Syntax) object embedded in the PDF's `/Contents` field. The `/ByteRange` field defines which byte ranges of the file were included in the signature (everything except the signature object itself). The signer's private key signs a hash of those byte ranges. Verification means: recomputing the hash over the same byte ranges, verifying it against the signature using the signer's public key, and validating the certificate chain back to a trusted root. This proves: (1) the document wasn't modified after signing, and (2) it was signed by whoever holds that private key.

2. *What does it mean when pyHanko reports "modifications detected"?*
   - PDFs support "incremental updates" — new content can be appended to a valid signed PDF without invalidating the original signature (the `/ByteRange` covers only the original content). pyHanko analyzes whether any such incremental additions modify security-relevant document features (form field values, visible page content, metadata). "Modifications detected" means content was added after signing that alters what the reader sees — a strong fraud signal.

3. *How does certificate chain validation work and why does it matter?*
   - The signer's certificate is issued by a Certificate Authority (CA). The CA's certificate may itself be issued by a root CA. Chain validation means: for each cert in the chain, verifying the signature of the issuer cert over the subject cert. This ensures the certificate wasn't self-signed or issued by an untrusted party. Without chain validation, an attacker could generate their own certificate and private key, sign a fraudulent invoice, and the signature would verify — but the cert traces to an untrusted root.

4. *Why store a public key fingerprint in the vendors table rather than the full certificate?*
   - The fingerprint (SHA-256 of DER-encoded certificate) is a compact, unique identifier (32 bytes) that can be indexed and compared efficiently. The full certificate can be hundreds of bytes of ASN.1 data and is typically valid for 1–3 years — storing it would require re-enrollment every renewal. The fingerprint approach stores just enough to recognize a known vendor certificate. Renewal would require a new fingerprint registration, which is a natural security checkpoint.

5. *What prevents an attacker from copying a valid signature from one invoice onto a fraudulent one?*
   - The signature covers the SHA-256 hash of the specific byte ranges of that specific document. Copying the signature value to a different document would cause verification to fail because the hash of the new document's byte ranges won't match the hash that was originally signed. The `/ByteRange` mechanism also means any change to the document content invalidates the signature — you'd need the original signer's private key to re-sign a modified version.

---

### 6. Vendor Bank Account Binding & Verification
**Files:** `backend/integrity/vendor_bank_service.py`, `backend/services/bank_utils.py`, `backend/services/plaid_service.py`, `backend/services/iban_registry_service.py`

**What it does:**
- Allows registering official bank accounts for each vendor (via Plaid open banking or manual entry)
- **Normalization**: strips non-digits, standardizes format per country (CA: institution+transit+account, US: routing+account, international: IBAN)
- **Hashing**: SHA-256 of the normalized account string with a secret salt (`BANK_HASH_SECRET`) → stored in DB as `account_hash`
- **Masking**: only last 4 digits stored as plaintext (`account_masked`) for display
- During invoice analysis: extracts account number from invoice text (via LLM/regex), normalizes + hashes it, does **constant-time comparison** against stored vendor hashes
- **Plaid flow**: create link token → vendor opens Plaid Link → exchanges public token for account data → account auto-bound and marked `verified`
- **IBAN validation**: calls openiban.com API to check structural validity before storing

**5 Technical Questions:**
1. *Why hash the bank account number rather than storing it encrypted?*
   - Hashing is one-way: you only need to verify "does this extracted account match a registered one?" — you never need to recover the original number. Encryption is two-way and requires key management; if the key is compromised, all accounts are exposed. With hashing + secret salt (HMAC-like pattern), an attacker who steals the database still can't recover account numbers or brute-force them without the salt. The tradeoff is you can't display the full account number, hence the masked display field.

2. *What is a constant-time comparison and why is it critical for hash comparison?*
   - Python's `==` operator short-circuits on the first differing byte, meaning the comparison takes slightly different time depending on how many leading bytes match. An attacker making thousands of requests with different account numbers could measure response time to infer partial hash matches (timing oracle attack). `hmac.compare_digest()` compares all bytes regardless of where the first difference is, taking constant time, eliminating the timing channel.

3. *How does the Plaid open banking integration work and why use it over asking vendors to self-report their account?*
   - Plaid acts as a secure intermediary: (1) our server creates a `link_token` for the specific vendor, (2) the vendor opens Plaid Link (a trusted UI) and logs into their bank directly — we never see their banking credentials, (3) they grant read access to account data, (4) Plaid returns a `public_token` we exchange for a `processor_token`, (5) we receive verified account number, routing number, institution name directly from the bank. This eliminates the risk of vendors submitting incorrect or fraudulent account details — the data comes from the bank itself.

4. *What is IBAN and how does structural validation work?*
   - IBAN (International Bank Account Number) is a standardized format: 2-letter country code + 2 check digits + up to 30 alphanumeric chars (BBAN). The check digits are computed using MOD-97 over the numeric representation of the IBAN (letters converted to numbers: A=10, B=11, etc.). Structural validation: move the first 4 chars to the end, convert to integer string, compute mod 97 — valid IBANs yield remainder 1. openiban.com performs this plus country-specific length/format checks.

5. *What happens if a vendor invoice references a different account than their registered binding?*
   - The `vendor_bank_service.py` extracts the account from invoice text, normalizes and hashes it, then queries all active bindings for the matched vendor. If no hash matches, it returns `bank_mismatch: true` with a high risk boost to the ensemble scorer. This is one of the highest-confidence fraud signals — a vendor's official invoice should always reference their registered account. A mismatch means either the invoice is fraudulent (account changed for interception) or the vendor updated their account without re-registering.

---

### 7. Rules Engine
**File:** `backend/services/rules_service.py`

**What it does:**
- Applies deterministic, interpretable checks against extracted invoice fields:
  - **Amount validation**: checks if totals are internally consistent (subtotal + tax ≈ total), flags round-number totals (e.g., exactly $10,000.00 — statistically suspicious), checks for amounts outside vendor's historical range
  - **Keyword detection**: scans for suspicious terms ("urgent", "wire transfer only", "avoid usual process", "gift card")
  - **Date validation**: invoice date not in the future, due date not before invoice date, date not in far past
  - **Font inconsistency flags**: triggered by forensics layer, rules amplify the signal
  - **Duplicate invoice number**: checks if same invoice number was submitted previously for this vendor
- Returns a list of triggered rules with severity (LOW/MEDIUM/HIGH) and descriptions

**5 Technical Questions:**
1. *Why include a rules engine when you already have ML-based anomaly detection?*
   - ML models are black boxes — when they flag something, it's hard to explain why to a finance analyst. Rules are interpretable: "Invoice date is 3 years in the past" or "Total doesn't equal subtotal + tax" are immediately actionable. The rules engine also catches simple arithmetic fraud that ML might miss because the embedding doesn't directly encode numerical relationships. Complementary: ML catches pattern anomalies rules can't formalize; rules catch logical errors ML might rationalize.

2. *Why is a perfectly round invoice total suspicious?*
   - Real invoices reflect actual work — labor hours × rates, quantity × unit price — these calculations rarely produce perfectly round numbers. An invoice for exactly $5,000.00 with no line items that multiply to exactly that is statistically improbable and consistent with a manually typed fraudulent amount. This is called Benford's Law analysis territory — the leading digits of naturally occurring financial numbers follow a specific distribution; round numbers deviate from it.

3. *How does duplicate invoice number detection prevent fraud?*
   - Duplicate billing fraud involves re-submitting the same invoice (same number, same vendor) multiple times expecting one payment to slip through. By storing and indexing invoice numbers per vendor, any re-submission of the same number is flagged immediately. This is distinct from file-level SHA-256 deduplication — a fraudster could change one word in the PDF (changing the hash) but keep the same invoice number.

4. *How are keyword signals calibrated to avoid false positives on legitimate urgent invoices?*
   - Keywords are scored by specificity: generic urgency words ("urgent") are LOW severity on their own. Highly specific fraud-pattern phrases ("please change payment details", "new wire instructions", "avoid usual approval process") are HIGH severity because they match known Business Email Compromise (BEC) fraud scripts almost exclusively. Multiple LOW signals together trigger aggregated scoring. Legitimate urgency rarely includes payment method change requests.

5. *Why is date validation important and what fraud does it prevent?*
   - Future-dated invoices could be submitted to trigger early payment before goods/services are delivered. Far-past-dated invoices may be re-submissions of already-paid invoices or attempts to submit invoices for periods before the vendor relationship existed. Due date before invoice date is a logical impossibility that signals document tampering. These checks are cheap and catch obvious manipulation that more complex models may overlook.

---

### 8. Ensemble Scorer
**File:** `backend/services/ensemble_scorer.py`

**What it does:**
- Aggregates signals from all analysis layers into a single **fraud_score** (0.0–1.0) and **risk_level** (LOW/MEDIUM/HIGH)
- Input signals:
  - `crypto_score`: from signature verification (unsigned=0.3, invalid=1.0, valid=0.0)
  - `ai_score`: from LayoutLMv3 + IsolationForest (rejection_probability)
  - `rules_score`: from rules engine (count × severity weights)
  - `forensics_score`: from ELA/noise/copy-move/font analysis
  - `semantic_score`: from LLM-detected AI-generated text
- Configurable weights per signal
- Thresholds: LOW < 0.35, MEDIUM 0.35–0.65, HIGH ≥ 0.65

**5 Technical Questions:**
1. *How do you determine the weights for each signal in the ensemble?*
   - Weights reflect signal reliability and specificity. Cryptographic signals (signature invalid) are near-deterministic — high weight because they have essentially zero false positive rate (a valid signature is a hard guarantee). Forensic signals (ELA) are noisier and context-dependent — lower weight. The weights were tuned empirically against the calibration dataset, targeting minimal false positives at the HIGH threshold while maintaining recall for known fraud patterns.

2. *Why use a linear weighted combination rather than a trained meta-classifier?*
   - A meta-classifier (e.g., logistic regression over signal outputs) would require labeled fraud examples, which are scarce. A linear combination is fully interpretable — an analyst can see that the score is 0.7 because forensics contributed 0.3 and no valid signature contributed 0.25. Interpretability is critical in finance where decisions must be auditable and explainable to auditors. The tradeoff is potentially suboptimal signal interaction compared to learned combinations.

3. *What does a fraud_score of 0.65 mean practically — should it be automatically rejected?*
   - No — the system is designed as decision support, not autonomous rejection. HIGH risk (≥0.65) triggers human review escalation, not automatic rejection. An analyst reviews the specific signals that drove the score, examines the invoice, and makes a final approve/reject decision. Automatic rejection would create business risk (blocking legitimate invoices from unusual vendors) and legal liability. The score is an attention-allocation tool.

4. *How does the system handle contradictory signals — e.g., valid cryptographic signature but high forensic anomaly?*
   - Contradictory signals produce a moderate combined score and flag specific contradictions in the results JSON for human review. A valid signature with high forensic anomaly could mean: the signer is legitimate but used a template-generated invoice, or the PDF was signed after manipulation. Each signal's individual result is preserved and surfaced — the ensemble score doesn't hide the contradiction, it surfaces it for analyst interpretation.

5. *Could the ensemble be gamed by an attacker who knows the weights?*
   - Partially — knowledge of weights helps an attacker know which signals to defeat. This is why the weights are not exposed in the API and why we use a multi-layer approach. Defeating all five independent layers simultaneously is substantially harder than defeating one. Defense in depth: defeating ELA requires full re-save (destroys copy-move signals), obtaining a valid certificate requires social engineering the vendor registration process, making anomaly detection happy requires the invoice to look like a familiar template. Each mitigation creates new challenges for the attacker.

---

### 9. Human Review Workflow + Audit Trail
**Files:** `backend/routers/review.py`, `backend/services/audit_service.py`, `backend/models/audit_log.py`

**What it does:**
- After automated analysis, analysts submit a **review decision**: `approved` or `rejected`
- Decision includes: `confidence` (certain/likely/uncertain) and optional `description`
- Review is stored in `invoice_reviews` table (one per invoice, updatable)
- Every significant action is logged to `audit_logs`: upload, analyze, review, login, vendor registration, etc.
- Audit log is immutable append-only — no delete/update endpoints
- Audit logs are exportable for compliance reporting

**5 Technical Questions:**
1. *Why is the audit log append-only? What threat does mutability of logs prevent against?*
   - If audit logs could be deleted or updated, a fraudster with system access could cover their tracks — removing evidence of accessing a vendor's account or approving a fraudulent invoice. Append-only logging (no UPDATE/DELETE on `audit_logs`) means the record of every action is permanent. This is a standard requirement in financial systems under SOX (Sarbanes-Oxley) and similar compliance frameworks.

2. *What information is stored in the audit log and how granular is it?*
   - Each entry stores: `user_id` (who acted), `action` (enum: login/upload/analyze/review/vendor_create/etc.), `resource_type` (invoice/vendor/user), `resource_id` (specific record ID), `details` (JSON — e.g., decision made, file hash, IP address), `created_at` (timestamp). Granularity allows reconstructing the complete timeline of any invoice from upload through review.

3. *How does the confidence field on reviews help downstream decision-making?*
   - `certain` means the analyst has clear evidence (e.g., confirmed with the vendor directly). `likely` means the signals point strongly in one direction but some ambiguity exists. `uncertain` means the analyst made a call under genuine ambiguity. Confidence metadata allows management review to prioritize uncertain decisions for second-opinion review, and can be used to weight analyst decisions as training signal for future model improvement.

4. *What is the difference between the automated analysis result and the human review, and which takes precedence?*
   - They are separate records with separate semantics. The analysis result captures what the AI/ML/rules found automatically. The human review captures the analyst's informed decision after examining all evidence. The review always takes precedence for payment authorization — the analysis is input to the human decision, not a replacement. This preserves human accountability and legal liability clarity.

5. *How would you extend the audit system to support compliance reporting under regulations like SOX?*
   - SOX Section 404 requires documented controls over financial reporting. Extensions would include: (1) immutable export to append-only storage (S3 Object Lock with WORM mode), (2) digital signing of audit log exports with a timestamping authority (RFC 3161), (3) role-based access controls with audit of who accessed audit logs, (4) retention policies enforcing 7-year minimum log retention, (5) automated alerting on anomalous patterns (e.g., user approving their own vendor's invoice).

---

### 10. LayoutLMv3 Supervised Training
**Files:** `backend/services/layoutlm_training_service.py`, `backend/services/layoutlm_model_registry.py`, `backend/routers/layoutlm_training.py`

**What it does:**
- Allows each user to **fine-tune** a supervised LayoutLMv3 classifier on their own labeled invoice dataset
- Training data: `SuperviseTraining/train/` directory with images, bounding boxes, and entity labels
- Hyperparameters: `iterations`, `epochs`, `min_samples`, `test_size` (train/test split ratio)
- Trains a token classification or sequence classification head on top of `layoutlmv3-base`
- Saves model as `{model_id}.pt` in `ai_pipeline/saved_models/layoutlm_supervised/<user_id>/`
- Tracks metadata (creation time, hyperparameters, accuracy, sample count) in `{model_id}.metadata.json`
- When analyzing, user can select their trained model to replace the baseline IsolationForest model
- Model registry manages versioning and deletion

**5 Technical Questions:**
1. *What is transfer learning and why does it make LayoutLMv3 fine-tuning practical with small datasets?*
   - Transfer learning starts from a model pre-trained on a massive corpus (LayoutLMv3-base was pre-trained on IIT-CDIP — 11 million business documents). The model has already learned rich representations of document layout, text, and visual features. Fine-tuning only needs to adjust the final classification layers for your specific task (legitimate vs. fraudulent invoices), requiring far less data than training from scratch. With hundreds of labeled examples instead of millions, fine-tuning can achieve strong performance.

2. *What is the difference between token classification and sequence classification for invoice analysis?*
   - Token classification assigns a label to each word token (e.g., `VENDOR_NAME`, `AMOUNT`, `DATE`) — useful for information extraction. Sequence classification assigns a single label to the entire document (e.g., `LEGITIMATE` or `FRAUDULENT`) — useful for binary fraud detection. The system uses both depending on the task: extraction uses token classification, fraud scoring uses sequence classification over the [CLS] token embedding.

3. *Why store separate models per user rather than one shared model?*
   - Different organizations have different vendor sets, invoice templates, and industry-specific formats. A hospital's invoices look nothing like a software company's invoices. A shared model trained on everyone's data would either underfit (too generic) or leak signals between organizations (privacy concern — model could inadvertently memorize vendor-specific patterns). Per-user models allow personalization and maintain data isolation.

4. *What is the risk of overfitting when fine-tuning on a small dataset and how do you mitigate it?*
   - With few training examples, the model can memorize training data rather than learning generalizable features. Mitigations: (1) `test_size` split forces evaluation on held-out data; (2) early stopping based on validation loss; (3) low learning rate (fine-tuning preserves pre-trained weights); (4) dropout regularization in the classification head; (5) `min_samples` parameter prevents training if the dataset is too small to produce a reliable model.

5. *How does the model registry versioning work and why is it important?*
   - Each trained model gets a UUID as `model_id`, stored with its metadata JSON. The registry tracks all models per user. When analyzing, the user can select which model version to use. This is important because: (1) you can roll back to a previous model if a new training run degrades performance; (2) you can A/B test models on different invoice subsets; (3) deletion of outdated models reclaims disk space. Without versioning, a bad fine-tuning run would overwrite the only working model.

---

### 11. Authentication & Session Management
**Files:** `backend/routers/auth/`, `backend/dependencies.py`, `backend/limiter.py`

**What it does:**
- **Registration**: validates email format, password strength, hashes password with bcrypt, creates user record
- **Login**: looks up user by email, bcrypt-compares password, creates signed session cookie (itsdangerous `URLSafeTimedSerializer`)
- **Session**: cookie contains signed user_id — server verifies signature + expiry on every request (no DB lookup for auth on each request)
- **Rate limiting**: SlowAPI limits login attempts (brute-force protection), upload endpoints, analysis triggers
- **Forgot password**: security question/answer flow — answer stored as bcrypt hash, correct answer generates reset token
- **Dependency injection**: `get_current_user` dependency used in all protected routes

**5 Technical Questions:**
1. *Why use session cookies rather than JWTs for authentication?*
   - JWTs are stateless — once issued, you can't invalidate them before expiry (logout doesn't truly log out). Session cookies with server-side signing allow true logout (you can blacklist sessions or simply clear the cookie). The cookie is `HttpOnly` (not accessible to JavaScript, XSS-resistant) and `Secure` (HTTPS-only in production). For a financial application, the ability to force-invalidate sessions on suspected compromise is important.

2. *How does itsdangerous signing work and what does it protect against?*
   - `URLSafeTimedSerializer` serializes a payload (user_id) and signs it with HMAC-SHA using the `SESSION_SECRET` key. The signature is appended to the cookie value. On each request, FastAPI re-signs the extracted payload and compares signatures using `hmac.compare_digest()`. An attacker who can read the cookie value cannot forge a valid signature without knowing the secret — modifying the user_id would invalidate the HMAC. The `Timed` variant also embeds a timestamp, enabling max-age enforcement.

3. *What is the difference between bcrypt's cost factor and why does it matter for password security?*
   - bcrypt is an adaptive hash function — its cost factor controls how many internal rounds are performed (2^cost iterations). Higher cost = slower hashing. This is intentional: as hardware gets faster, you increase the cost to keep brute-force attacks slow. At cost 12 (common default), hashing takes ~250ms — negligible for one login but multiplied by 10 billion attempts = 2.5 million CPU-years. The VeriPay implementation uses cost 5 (faster, appropriate for low-traffic dev; production should be ≥10).

4. *How does SlowAPI rate limiting work at the implementation level?*
   - SlowAPI wraps routes with a decorator that counts requests per key (by default: client IP) in a time window using an in-memory or Redis backend. If the count exceeds the limit, it raises HTTP 429 Too Many Requests before the route handler runs. For login, this prevents brute-force password attacks by limiting attempts per IP. Limitations: in-memory storage doesn't persist across restarts; multiple server instances need Redis as shared backend.

5. *What is the security question flow for password reset and what are its weaknesses?*
   - User registers with a question/answer pair; the answer is bcrypt-hashed. At reset time: user provides email + answer; server bcrypt-compares answer, generates a time-limited signed reset token (itsdangerous), user submits new password with token. Weaknesses: security questions are often guessable or publicly known (mother's maiden name, city of birth). This is considered a weak second factor. Production systems should use email-based OTP or TOTP instead. This implementation is acknowledged as a development placeholder.

---

### 12. Dashboard & Frontend Architecture
**Files:** `frontend/src/app/dashboard/`, `frontend/src/app/context/AuthContext.tsx`

**What it does:**
- **Dashboard**: displays aggregate stats (total invoices, analyzed count, fraud detected, pending review), recent invoice queue with risk-level indicators, trend visualizations
- **Next.js App Router**: file-system based routing, server components for layout, client components for interactive UI
- **AuthContext**: React Context providing `user`, `login()`, `logout()` to all child components — prevents prop drilling
- **Radix UI + Tailwind**: accessible, unstyled component primitives styled with Tailwind utility classes
- **framer-motion**: animated transitions between pages and UI states
- **Dark mode**: next-themes toggles `dark` class on root element, Tailwind `dark:` variants handle styling

**5 Technical Questions:**
1. *What is the difference between server components and client components in Next.js App Router, and when do you use each?*
   - Server components run on the server at request time — they can directly fetch from databases, have no client-side JavaScript bundle impact, but cannot use browser APIs, event handlers, or React state. Client components (`"use client"`) run in the browser — they can use hooks, handle events, and access browser APIs, but add to the JS bundle. In VeriPay: layout and static structure use server components; interactive elements (upload forms, review modals, charts) use client components.

2. *Why use Radix UI primitives instead of a pre-styled component library like Material UI?*
   - Radix provides behavior (accessibility, keyboard navigation, focus management, ARIA attributes) without any default styles. This gives full visual control via Tailwind without fighting another library's CSS specificity. Material UI imposes a visual design system — customizing it to match a custom brand requires extensive overriding. The Radix + Tailwind combination is called a "headless UI" pattern: behavior separated from presentation.

3. *What is React Context and what problem does it solve for authentication state?*
   - React Context creates a global state store accessible to any component in the subtree without manually passing props through every intermediate component (prop drilling). `AuthContext` stores the current user object — every page that needs to know if the user is logged in reads from context rather than receiving it as a prop. The tradeoff: all consumers re-render when context value changes, so it's appropriate for low-frequency global state (auth), not high-frequency state (form inputs).

4. *How does framer-motion animate page transitions in the App Router?*
   - framer-motion's `AnimatePresence` component detects component mount/unmount and plays enter/exit animations. In Next.js App Router, navigating to a new route unmounts the current page component and mounts the new one — wrapping these in `AnimatePresence` with `motion.div` wrappers and `initial`, `animate`, `exit` props defines the transition. Challenge: App Router's streaming/partial rendering can conflict with exit animations, requiring careful placement of animation wrappers.

5. *How does the dashboard get its aggregate stats and what are the performance implications?*
   - `GET /dashboard/stats` runs aggregation queries on PostgreSQL: `COUNT(*)` on invoices, `COUNT(*) WHERE status='analyzed'`, `COUNT(*) WHERE risk_level='HIGH'`, etc. These are O(n) full table scans unless indexed. For scale, you'd add a materialized view or a separate stats table updated by triggers/background jobs. For the current scale (single user, hundreds of invoices), direct aggregation queries are acceptable and simpler.

---

## System Architecture Diagram (Text)

```
User Browser (Next.js 16 + React 19)
    │
    │ HTTP/REST
    ▼
FastAPI Backend (Port 8000)
    ├── Auth Layer (bcrypt + itsdangerous sessions)
    ├── Rate Limiter (SlowAPI)
    │
    ├── Invoice Upload
    │   ├── Magic byte validation
    │   ├── SHA-256 deduplication → PostgreSQL
    │   └── Text extraction (PyPDF2 / Tesseract)
    │
    ├── Analysis Pipeline (async)
    │   ├── Semantic Extraction ──────────► Ollama/Qwen2.5 (Port 11434)
    │   ├── LayoutLMv3 Embedding ─────────► HuggingFace model (local)
    │   ├── IsolationForest Scoring ──────► scikit-learn (in-process)
    │   ├── Image Forensics (ELA/SIFT) ───► OpenCV + Pillow (in-process)
    │   ├── Rules Engine ─────────────────► In-process
    │   └── Ensemble Scorer ──────────────► Aggregated fraud_score
    │
    ├── Integrity Layer
    │   ├── pyHanko signature verification
    │   ├── Certificate chain validation
    │   └── Bank account hash comparison
    │
    ├── Vendor Management
    │   ├── Plaid open banking ───────────► Plaid API (external)
    │   └── IBAN validation ──────────────► openiban.com (external)
    │
    └── Audit Logging → PostgreSQL (Supabase)
```

---

## Key Design Decisions (Be Ready to Defend These)

| Decision | Rationale |
|----------|-----------|
| Local Ollama LLM | Financial data privacy — no third-party cloud exposure |
| Unsupervised IsolationForest | No labeled fraud data required; works on distribution of normals |
| LayoutLMv3 over BERT | Spatial layout encoding critical for document fraud detection |
| Session cookies over JWT | True logout capability; HttpOnly prevents XSS token theft |
| Append-only audit log | Compliance requirement; tamper evidence |
| SHA-256 + salt for bank accounts | One-way verification without exposing sensitive financial data |
| Defense in depth (5 signal layers) | No single signal is reliable alone; ensemble reduces false positives |
| Docker Compose orchestration | Reproducible local deployment; isolates Ollama GPU/CPU resource |
| Per-user LayoutLMv3 models | Personalization + data isolation between organizations |
| Human review as final gate | Legal accountability; analyst override capability |

---




# VeriPay — Technical Q&A

---

## Invoice Upload

**Q1. Why validate both MIME type and magic bytes? Why isn't checking the file extension enough?**
Extensions are user-controlled and trivially spoofed. Magic bytes are part of the binary content itself — `%PDF` for PDFs, `\x89PNG` for PNGs, `\xff\xd8\xff` for JPEGs. A file named `malware.pdf` with PNG magic bytes would be rejected. You need both checks because MIME type can also be set by the client and faked.

**Q2. How does SHA-256 deduplication work and what fraud does it prevent?**
The entire file is hashed to a 256-bit digest before storage. We check if that hash exists in the `invoices` table (`file_hash` column, unique constraint). If it does, we return 409 Conflict. This prevents the same invoice being re-analyzed, prevents double payments on identical invoices, and saves storage.

**Q3. What is a decompression bomb and how do you protect against it?**
A specially crafted small image that expands to gigabytes in memory when decompressed (e.g., a 1×1 pixel PNG with 9999 repeats). Pillow's `Image.open()` is called with `MAX_IMAGE_PIXELS` limit set, which raises `DecompressionBombError` before the image loads into RAM.

**Q4. Why store files as `<user_id>/<date>/<uuid>` rather than flat storage?**
Namespace isolation prevents one user from guessing another user's file paths. Date subdirectory keeps directory entry count manageable (no inode exhaustion on the filesystem). UUID prevents filename collisions and removes predictability from path names.

**Q5. Why use async background tasks for analysis instead of running it synchronously?**
LayoutLMv3 inference, Ollama LLM calls, and forensic analysis can take 15–60+ seconds. A synchronous endpoint would hold the HTTP connection open and block the server worker. Background tasks let the upload return immediately (202 Accepted) while analysis runs independently, which scales far better under concurrent load.

---

## LayoutLMv3 + IsolationForest

**Q1. Why use LayoutLMv3 instead of plain BERT for invoice analysis?**
Plain text transformers discard spatial information. Invoice fraud often involves moving amounts, rearranging line items, or inserting fake fields that look correct textually but are positioned wrongly (e.g., a total in the header area). LayoutLMv3 encodes the (x1, y1, x2, y2) bounding box of every token as positional embeddings alongside the text, and adds visual patch embeddings from the rendered page image, making it sensitive to layout anomalies that text models would miss.

**Q2. Why IsolationForest over a supervised classifier?**
Labeled fraud data is extremely scarce — you can't collect thousands of real fraudulent invoices to train on. IsolationForest is unsupervised: it learns the distribution of normal invoices and flags anything that isolates easily (short average path length in random trees = anomalous). This works with zero fraud labels. A supervised approach would require balanced, labeled fraud examples.

**Q3. What is the "layout familiarity" score and how is it computed?**
After extracting the 768-dim embedding from LayoutLMv3, we compute its Euclidean distance from the centroid (mean embedding) of all training invoices. We normalize this by the standard deviation of distances observed during training. A high z-score means the invoice is far from what "normal" looks like in embedding space, regardless of whether the text appears correct.

**Q4. How does IsolationForest actually isolate anomalies — walk me through the algorithm?**
It builds an ensemble of random decision trees. At each node, it randomly selects a feature and a random split value within that feature's range. Normal points (clustered together) require many splits to isolate — long paths to leaf nodes. Anomalous points (in sparse regions of feature space) are isolated with very few splits — short paths. The anomaly score is the average normalized path length across all trees; shorter path = more anomalous.

**Q5. What are the limitations of this approach and how do you mitigate them?**
IsolationForest can produce false positives for legitimate but unusual invoice formats (foreign vendors, unusual currencies). Mitigations: (1) user-specific LayoutLMv3 fine-tuning so the model adapts to each organization's vendor set; (2) ensemble scoring combines anomaly score with rule-based and forensic signals rather than using it as the sole decision; (3) human review workflow where analysts can override.

---

## Image Forensics

**Q1. How does ELA detect image manipulation?**
JPEG compression divides the image into 8×8 DCT blocks. When you save an unedited JPEG at quality Q, all blocks reach a consistent residual error level. If someone pastes content from a different source image (saved at a different quality), those blocks had different prior compression history and show a distinctly different error level when re-compressed. You visualize the absolute difference between the original and re-compressed version — bright spots = manipulated regions.

**Q2. Why use both SIFT and ORB for copy-move detection?**
SIFT (Scale-Invariant Feature Transform) is highly accurate and scale/rotation invariant but computationally expensive. ORB (Oriented FAST and Rotated BRIEF) is faster but slightly less discriminative. Using both and requiring agreement reduces false positives — a match flagged by both algorithms is more reliable than one flagged by either alone.

**Q3. What is the limitation of ELA on PDFs and how do you handle it?**
PDFs are vector formats — rendering them to JPEG introduces compression artifacts from the rendering process itself, not from any manipulation. This can produce false ELA signals everywhere. We handle this by: (a) rendering at high DPI to minimize quantization artifacts, (b) using PNG as intermediate format where possible, (c) weighting ELA lower for PDF-origin invoices compared to direct JPEG scans.

**Q4. How did you calibrate forensic scores against 1,323 invoices?**
The threshold values and risk multipliers were derived by running the forensic pipeline over a dataset of known-clean and known-manipulated invoices, computing precision/recall at each threshold, and selecting operating points that minimize false positives while catching high-confidence manipulations. The 1,323 figure represents the size of the calibration corpus.

**Q5. Could an attacker evade ELA by re-saving the invoice before submission?**
Yes — ELA is a fragile signal that can be defeated by a full re-save at uniform quality. This is why forensics is only one of five layers: the ensemble scorer combines it with LayoutLMv3 anomaly detection, semantic analysis, cryptographic verification, and the rules engine. An attacker defeating ELA would still face anomaly detection, signature invalidation, and bank account mismatch. Defense in depth mitigates any single signal's weakness.

---

## Ollama / Qwen2.5 LLM Extraction

**Q1. Why run a local LLM instead of using OpenAI or Anthropic's API?**
Invoices contain sensitive financial data — vendor names, account numbers, amounts. Sending this to a third-party cloud API raises data privacy and compliance concerns. Ollama runs entirely on-premise in a Docker container; data never leaves the host. Local inference also eliminates per-token API costs and removes external latency/availability dependencies.

**Q2. Why Qwen2.5 0.5B and not a larger model like Llama 3 8B?**
Extraction is a structured task (fill in JSON fields) — it doesn't require deep reasoning. A 0.5B model with a clear JSON prompt performs adequately for field extraction while being orders of magnitude faster and lighter (fits in CPU RAM on modest hardware). Larger models improve quality marginally but increase inference time from ~2s to 20–60s, making them impractical for a synchronous analysis step.

**Q3. How do you ensure the LLM returns valid JSON and not free-form text?**
The prompt explicitly instructs JSON-only output with a defined schema and provides a template. The response is parsed with `json.loads()` inside a try/except block. If parsing fails or required fields are missing, the service falls back to regex-based extraction. This two-layer approach (LLM primary, regex fallback) ensures the pipeline never stalls due to a malformed LLM output.

**Q4. How can the LLM detect AI-generated invoice text — what signals does it use?**
The LLM is prompted to look for: unnaturally consistent formatting, perfectly structured sentences with no natural variation, generic placeholder-style language ("Please remit payment by the due date"), uniform terminology unlikely in real business correspondence, and absence of regional/industry-specific phrasing. The model leverages its training distribution knowledge to assess whether the text matches human-authored business writing.

**Q5. What is the 2,200-character truncation limit and why is it set there?**
Qwen2.5 0.5B has a limited context window, and longer prompts increase inference time and risk of the model losing focus on the structured extraction task. 2,200 characters captures the first ~1–1.5 pages of most invoices, which contain all the critical header fields. The truncation is applied after sorting extracted text lines by vertical position so header fields (vendor info, amounts, account numbers) aren't cut off.

---

## Cryptographic Signature Verification

**Q1. What is a PDF digital signature at a cryptographic level — what does it actually prove?**
A PDF digital signature is a CMS (Cryptographic Message Syntax) object embedded in the PDF's `/Contents` field. The `/ByteRange` field defines which byte ranges of the file were included in the signature. The signer's private key signs a hash of those byte ranges. Verification means: recomputing the hash over the same byte ranges, verifying it against the signature using the signer's public key, and validating the certificate chain back to a trusted root. This proves: (1) the document wasn't modified after signing, and (2) it was signed by whoever holds that private key.

**Q2. What does pyHanko's "modifications detected" mean?**
PDFs support incremental updates — new content can be appended to a valid signed PDF without invalidating the original signature. pyHanko analyzes whether any such incremental additions modify security-relevant document features (form field values, visible page content, metadata). "Modifications detected" means content was added after signing that alters what the reader sees — a strong fraud signal.

**Q3. How does certificate chain validation work and why does it matter?**
The signer's certificate is issued by a Certificate Authority (CA). Chain validation means verifying the signature of the issuer cert over the subject cert, all the way up to a trusted root. Without this, an attacker could generate their own self-signed certificate and private key, sign a fraudulent invoice, and the signature would verify cryptographically — but the cert traces to an untrusted root. Chain validation ensures the certificate was issued by a legitimate authority.

**Q4. Why store a public key fingerprint in the vendors table rather than the full certificate?**
The fingerprint (SHA-256 of DER-encoded certificate) is a compact, unique 32-byte identifier that can be indexed and compared efficiently. The full certificate can be hundreds of bytes of ASN.1 data and expires every 1–3 years — storing it would require re-enrollment every renewal. The fingerprint approach stores just enough to recognize a known vendor certificate, and renewal is a natural security checkpoint.

**Q5. What prevents an attacker from copying a valid signature from one invoice onto a fraudulent one?**
The signature covers the SHA-256 hash of the specific byte ranges of that specific document. Copying the signature value to a different document causes verification to fail because the hash of the new document's byte ranges won't match the hash that was originally signed. Any change to document content invalidates the signature — you'd need the original signer's private key to re-sign a modified version.

---

## Vendor Bank Account Binding

**Q1. Why hash the bank account number rather than storing it encrypted?**
Hashing is one-way: you only need to verify "does this extracted account match a registered one?" — you never need to recover the original number. Encryption is two-way and requires key management; if the key is compromised, all accounts are exposed. With hashing + secret salt, an attacker who steals the database still can't recover account numbers. The tradeoff is you can't display the full account number, hence the masked display field.

**Q2. What is a constant-time comparison and why is it critical here?**
Python's `==` operator short-circuits on the first differing byte, meaning comparison time varies depending on how many leading bytes match. An attacker making thousands of requests with different account numbers could measure response time to infer partial hash matches (timing oracle attack). `hmac.compare_digest()` compares all bytes regardless of where the first difference is, taking constant time and eliminating the timing channel.

**Q3. How does the Plaid open banking integration work and why use it over self-reporting?**
(1) Our server creates a `link_token` for the specific vendor. (2) The vendor opens Plaid Link (a trusted UI) and logs into their bank directly — we never see their banking credentials. (3) They grant read access to account data. (4) Plaid returns a `public_token` we exchange server-side for verified account number, routing number, and institution name directly from the bank. This eliminates the risk of vendors submitting incorrect or fraudulent account details since data comes from the bank itself.

**Q4. What is IBAN and how does structural validation work?**
IBAN (International Bank Account Number) is a standardized format: 2-letter country code + 2 check digits + up to 30 alphanumeric chars. The check digits are computed using MOD-97 over the numeric representation of the IBAN (letters converted to numbers: A=10, B=11, etc.). Validation: move the first 4 chars to the end, convert to an integer string, compute mod 97 — valid IBANs yield remainder 1. openiban.com performs this plus country-specific length and format checks.

**Q5. What happens if a vendor invoice references a different account than their registered binding?**
The `vendor_bank_service.py` extracts the account from invoice text, normalizes and hashes it, then queries all active bindings for the matched vendor. If no hash matches, it returns `bank_mismatch: true` with a high risk boost to the ensemble scorer. This is one of the highest-confidence fraud signals — a vendor's official invoice should always reference their registered account. A mismatch means either the invoice is fraudulent (account changed for interception) or the vendor updated their account without re-registering.

---

## Rules Engine

**Q1. Why include a rules engine when you already have ML-based anomaly detection?**
ML models are black boxes — when they flag something, it's hard to explain why to a finance analyst. Rules are interpretable: "Invoice date is 3 years in the past" or "Total doesn't equal subtotal + tax" are immediately actionable. The rules engine also catches simple arithmetic fraud that ML might miss because the embedding doesn't directly encode numerical relationships. ML catches pattern anomalies rules can't formalize; rules catch logical errors ML might rationalize.

**Q2. Why is a perfectly round invoice total suspicious?**
Real invoices reflect actual work — labor hours × rates, quantity × unit price — these calculations rarely produce perfectly round numbers. An invoice for exactly $5,000.00 with no line items that multiply to exactly that is statistically improbable and consistent with a manually typed fraudulent amount. This is related to Benford's Law: the leading digits of naturally occurring financial numbers follow a specific distribution; round numbers deviate from it.

**Q3. How does duplicate invoice number detection prevent fraud?**
Duplicate billing fraud involves re-submitting the same invoice (same number, same vendor) multiple times expecting one payment to slip through. By storing and indexing invoice numbers per vendor, any re-submission of the same number is flagged. This is distinct from file-level SHA-256 deduplication — a fraudster could change one word in the PDF (changing the hash) but keep the same invoice number.

**Q4. How are keyword signals calibrated to avoid false positives on legitimate urgent invoices?**
Keywords are scored by specificity. Generic urgency words ("urgent") are LOW severity on their own. Highly specific fraud-pattern phrases ("please change payment details", "new wire instructions", "avoid usual approval process") are HIGH severity because they match known Business Email Compromise (BEC) fraud scripts almost exclusively. Multiple LOW signals together trigger aggregated scoring. Legitimate urgency rarely includes payment method change requests.

**Q5. Why is date validation important and what fraud does it prevent?**
Future-dated invoices could be submitted to trigger early payment before goods/services are delivered. Far-past-dated invoices may be re-submissions of already-paid invoices or invoices for periods before the vendor relationship existed. Due date before invoice date is a logical impossibility that signals document tampering. These checks are cheap and catch obvious manipulation that more complex models may overlook.

---

## Ensemble Scorer

**Q1. How do you determine the weights for each signal?**
Weights reflect signal reliability and specificity. Cryptographic signals (signature invalid) are near-deterministic — high weight because they have essentially zero false positive rate. Forensic signals (ELA) are noisier and context-dependent — lower weight. The weights were tuned empirically against the calibration dataset, targeting minimal false positives at the HIGH threshold while maintaining recall for known fraud patterns.

**Q2. Why use a linear weighted combination rather than a trained meta-classifier?**
A meta-classifier would require labeled fraud examples, which are scarce. A linear combination is fully interpretable — an analyst can see that the score is 0.7 because forensics contributed 0.3 and no valid signature contributed 0.25. Interpretability is critical in finance where decisions must be auditable and explainable to auditors. The tradeoff is potentially suboptimal signal interaction compared to learned combinations.

**Q3. What does a fraud_score of 0.65 mean — should it be automatically rejected?**
No. The system is designed as decision support, not autonomous rejection. HIGH risk (≥0.65) triggers human review escalation, not automatic rejection. An analyst reviews the specific signals that drove the score, examines the invoice, and makes a final approve/reject decision. Automatic rejection would create business risk (blocking legitimate invoices from unusual vendors) and legal liability. The score is an attention-allocation tool.

**Q4. How does the system handle contradictory signals — e.g., valid signature but high forensic anomaly?**
Contradictory signals produce a moderate combined score and flag specific contradictions in the results JSON for human review. A valid signature with high forensic anomaly could mean the signer is legitimate but used a template-generated invoice, or the PDF was signed after manipulation. Each signal's individual result is preserved and surfaced — the ensemble score doesn't hide the contradiction, it surfaces it for analyst interpretation.

**Q5. Could the ensemble be gamed by an attacker who knows the weights?**
Partially — knowledge of weights helps an attacker know which signals to defeat. This is why the weights are not exposed in the API and why we use a multi-layer approach. Defeating all five independent layers simultaneously is substantially harder than defeating one. Defeating ELA requires full re-save (which destroys copy-move signals); obtaining a valid certificate requires social engineering the vendor registration process; making anomaly detection happy requires the invoice to match a familiar template.

---

## Human Review + Audit Trail

**Q1. Why is the audit log append-only — what threat does mutability prevent?**
If audit logs could be deleted or updated, a fraudster with system access could cover their tracks — removing evidence of accessing a vendor's account or approving a fraudulent invoice. Append-only logging (no UPDATE/DELETE on `audit_logs`) means the record of every action is permanent. This is a standard requirement in financial systems under SOX (Sarbanes-Oxley) and similar compliance frameworks.

**Q2. What information is stored in the audit log and how granular is it?**
Each entry stores: `user_id` (who acted), `action` (enum: login/upload/analyze/review/vendor_create/etc.), `resource_type` (invoice/vendor/user), `resource_id` (specific record ID), `details` (JSON with structured event data), `created_at` (timestamp). This granularity allows reconstructing the complete timeline of any invoice from upload through review.

**Q3. How does the confidence field on reviews help downstream decision-making?**
`certain` means the analyst has clear evidence (e.g., confirmed with the vendor directly). `likely` means signals point strongly in one direction but some ambiguity exists. `uncertain` means the analyst made a call under genuine ambiguity. Confidence metadata allows management to prioritize uncertain decisions for second-opinion review, and can weight analyst decisions as training signal for future model improvement.

**Q4. What is the difference between the analysis result and the human review — which takes precedence?**
They are separate records with separate semantics. The analysis result captures what the AI/ML/rules found automatically. The human review captures the analyst's informed decision after examining all evidence. The review always takes precedence for payment authorization — the analysis is input to the human decision, not a replacement. This preserves human accountability and legal liability clarity.

**Q5. How would you extend the audit system for SOX compliance?**
SOX Section 404 requires documented controls over financial reporting. Extensions would include: (1) immutable export to append-only storage (S3 Object Lock with WORM mode); (2) digital signing of audit log exports with a timestamping authority (RFC 3161); (3) role-based access controls with audit of who accessed audit logs; (4) retention policies enforcing 7-year minimum log retention; (5) automated alerting on anomalous patterns (e.g., user approving their own vendor's invoice).

---

## LayoutLMv3 Supervised Training

**Q1. What is transfer learning and why does it make fine-tuning practical with small datasets?**
Transfer learning starts from a model pre-trained on a massive corpus (LayoutLMv3-base was pre-trained on IIT-CDIP — 11 million business documents). The model has already learned rich representations of document layout, text, and visual features. Fine-tuning only needs to adjust the final classification layers for your specific task, requiring far less data than training from scratch. With hundreds of labeled examples instead of millions, fine-tuning can achieve strong performance.

**Q2. What is the difference between token classification and sequence classification for invoice analysis?**
Token classification assigns a label to each word token (e.g., `VENDOR_NAME`, `AMOUNT`, `DATE`) — useful for information extraction. Sequence classification assigns a single label to the entire document (e.g., `LEGITIMATE` or `FRAUDULENT`) — useful for binary fraud detection. The system uses both: extraction uses token classification, fraud scoring uses sequence classification over the [CLS] token embedding.

**Q3. Why store separate models per user rather than one shared model?**
Different organizations have different vendor sets, invoice templates, and industry-specific formats. A hospital's invoices look nothing like a software company's. A shared model trained on everyone's data would either underfit (too generic) or leak signals between organizations (privacy concern — the model could memorize vendor-specific patterns). Per-user models allow personalization and maintain data isolation.

**Q4. What is the risk of overfitting on a small dataset and how do you mitigate it?**
With few training examples, the model can memorize training data rather than learning generalizable features. Mitigations: (1) `test_size` split forces evaluation on held-out data; (2) early stopping based on validation loss; (3) low learning rate to preserve pre-trained weights; (4) dropout regularization in the classification head; (5) `min_samples` parameter prevents training if the dataset is too small to produce a reliable model.

**Q5. How does the model registry versioning work and why is it important?**
Each trained model gets a UUID as `model_id`, stored with its metadata JSON (creation time, hyperparameters, accuracy, sample count). The registry tracks all models per user. When analyzing, the user selects which model version to use. This allows rollback to a previous model if a new training run degrades performance, A/B testing models on different invoice subsets, and deletion of outdated models to reclaim disk space.

---

## Authentication & Sessions

**Q1. Why use session cookies rather than JWTs?**
JWTs are stateless — once issued, you can't invalidate them before expiry, so logout doesn't truly log out. Session cookies with server-side signing allow true logout (clear the cookie). The cookie is `HttpOnly` (not accessible to JavaScript — XSS-resistant) and `Secure` (HTTPS-only in production). For a financial application, the ability to force-invalidate sessions on suspected compromise is critical.

**Q2. How does itsdangerous signing work and what does it protect against?**
`URLSafeTimedSerializer` serializes a payload (user_id) and signs it with HMAC-SHA using the `SESSION_SECRET` key. The signature is appended to the cookie value. On each request, FastAPI re-signs the extracted payload and compares signatures using `hmac.compare_digest()`. An attacker who reads the cookie value cannot forge a valid signature without knowing the secret — modifying the user_id would invalidate the HMAC. The `Timed` variant also embeds a timestamp enabling max-age enforcement.

**Q3. What is bcrypt's cost factor and why does it matter for password security?**
bcrypt is an adaptive hash function — its cost factor controls how many internal rounds are performed (2^cost iterations). Higher cost = slower hashing. This is intentional: as hardware gets faster, you increase the cost to keep brute-force attacks slow. At cost 12, hashing takes ~250ms — negligible for one login but multiplied by billions of attempts becomes computationally infeasible. The VeriPay implementation uses cost 5 (development speed); production should be ≥10.

**Q4. How does SlowAPI rate limiting work at the implementation level?**
SlowAPI wraps routes with a decorator that counts requests per key (by default: client IP) in a time window using an in-memory or Redis backend. If the count exceeds the limit, it raises HTTP 429 Too Many Requests before the route handler runs. For login endpoints, this prevents brute-force password attacks by limiting attempts per IP. Limitation: in-memory storage doesn't persist across restarts; multiple server instances need Redis as a shared backend.

**Q5. What are the weaknesses of security-question-based password reset?**
Security questions are often guessable or publicly known (mother's maiden name, city of birth are on social media). This is considered a weak second factor. Production systems should use email-based OTP or TOTP (time-based one-time passwords via an authenticator app) instead. The security question implementation in VeriPay is acknowledged as a development placeholder, not a production-grade recovery mechanism.

---

## Dashboard & Frontend

**Q1. What is the difference between server and client components in Next.js App Router?**
Server components run on the server at request time — they can directly access databases, have no client-side JS bundle impact, but cannot use browser APIs, event handlers, or React state. Client components (`"use client"`) run in the browser — they can use hooks and handle events but add to the JS bundle. In VeriPay: layout and static structure use server components; interactive elements (upload forms, review modals, charts) use client components.

**Q2. Why use Radix UI primitives instead of a pre-styled library like Material UI?**
Radix provides behavior (accessibility, keyboard navigation, focus management, ARIA attributes) without any default styles. This gives full visual control via Tailwind without fighting another library's CSS specificity. Material UI imposes a visual design system — customizing it to match a custom brand requires extensive overriding. The Radix + Tailwind combination is called a "headless UI" pattern: behavior separated from presentation.

**Q3. What is React Context and what problem does it solve for authentication state?**
React Context creates a global state store accessible to any component in the subtree without manually passing props through every intermediate component (prop drilling). `AuthContext` stores the current user object — every page that needs to know if the user is logged in reads from context. The tradeoff: all consumers re-render when context value changes, so it's appropriate for low-frequency global state (auth), not high-frequency state (form inputs).

**Q4. How does framer-motion animate page transitions in the App Router?**
framer-motion's `AnimatePresence` component detects component mount/unmount and plays enter/exit animations. In Next.js App Router, navigating to a new route unmounts the current page and mounts the new one — wrapping these in `AnimatePresence` with `motion.div` wrappers and `initial`, `animate`, `exit` props defines the transition. Challenge: App Router's streaming/partial rendering can conflict with exit animations, requiring careful placement of animation wrappers.

**Q5. How does the dashboard get its aggregate stats and what are the performance implications at scale?**
`GET /dashboard/stats` runs aggregation queries on PostgreSQL: `COUNT(*)` on invoices, `COUNT(*) WHERE status='analyzed'`, `COUNT(*) WHERE risk_level='HIGH'`, etc. These are O(n) full table scans unless indexed. For scale, you'd add a materialized view or a separate stats table updated by database triggers or background jobs. For the current scale (single user, hundreds of invoices), direct aggregation queries are acceptable and simpler.

---

*VeriPay Technical Q&A — 2026-04-20*


*Generated for VeriPay final presentation — 2026-04-20*
