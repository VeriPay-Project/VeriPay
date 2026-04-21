# VeriPay Codebase Audit Report

**Date:** 2026-04-04
**State:** Post Phase 1-4 (bug fixes, security hardening, performance optimization, AI pipeline upgrades)

---

## 1. PROJECT OVERVIEW

### What VeriPay Does

VeriPay is an invoice fraud detection platform. Users upload PDF or image invoices. The system runs a multi-layer analysis pipeline:

1. **Text extraction** — OCR (Tesseract) for images, PyPDF2 for PDFs
2. **Semantic extraction** — Ollama LLM (qwen2.5:3b) extracts structured fields (vendor, amounts, bank details)
3. **AI anomaly detection** — LayoutLMv3 embeddings scored by IsolationForest
4. **Document forensics** — ELA, noise analysis, font consistency, metadata, DCT, copy-move detection
5. **AI artifact detection** — Linguistic analysis for AI-generated text patterns
6. **Rules-based checks** — Math verification (subtotal + tax = total), line item validation
7. **Cryptographic verification** — PDF digital signature validation via pyHanko
8. **Bank account verification** — IBAN/US/CA validation, vendor bank binding matching
9. **External verification** — OpenIBAN API lookup, Plaid open banking integration

Results are stored in PostgreSQL (Supabase) and displayed in a Next.js frontend with highlight overlays on invoice previews.

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | 16.1.4 |
| Frontend UI | React + Radix UI + Tailwind CSS | React 19.2.3 |
| Backend | FastAPI + Uvicorn | FastAPI 0.128.0, Uvicorn 0.40.0 |
| Database | PostgreSQL (Supabase hosted) | AWS ca-central-1 |
| ORM | SQLAlchemy | 2.0.45 |
| LLM | Ollama + qwen2.5:3b | Latest |
| Document AI | LayoutLMv3-base (HuggingFace) | transformers 4.48.0 |
| Anomaly Detection | scikit-learn IsolationForest | 1.5.2 |
| OCR | Tesseract via pytesseract | 0.3.13 |
| PDF Processing | PyPDF2, pdf2image, PyMuPDF | PyPDF2 3.0.1, pdf2image 1.17.0 |
| Image Analysis | OpenCV, Pillow | opencv-python, Pillow 12.1.0 |
| Crypto | pyHanko, bcrypt, cryptography | pyHanko 0.32.0, bcrypt 5.0.0 |
| HTTP Client | httpx (async) | >=0.27.0 |
| Rate Limiting | slowapi | 0.1.9 |
| Containerization | Docker Compose | 4 services |

### Deployment Model

Docker Compose with 4 services:
- **backend** — FastAPI on port 8000, 4 Uvicorn workers
- **frontend** — Next.js dev server on port 3000
- **ollama** — LLM inference on port 11434
- **ollama_init** — One-shot model pull (qwen2.5:3b)

Database is external (Supabase PostgreSQL, SSL required).

---

## 2. ARCHITECTURE MAP

### System Architecture

```
┌─────────────┐     ┌──────────────────────────┐     ┌────────────────┐
│  Next.js     │────▶│  FastAPI (4 workers)      │────▶│  PostgreSQL    │
│  :3000       │     │  :8000                    │     │  (Supabase)    │
│  (React 19)  │◀────│                           │◀────│  ca-central-1  │
└─────────────┘     │  ┌──────────────────────┐ │     └────────────────┘
                    │  │ Background Analysis   │ │
                    │  │ Pipeline              │ │     ┌────────────────┐
                    │  │  ├─ Tesseract OCR     │─│────▶│  Ollama        │
                    │  │  ├─ Ollama LLM        │ │     │  :11434        │
                    │  │  ├─ LayoutLMv3        │ │     │  qwen2.5:3b    │
                    │  │  ├─ IsolationForest   │ │     └────────────────┘
                    │  │  ├─ Forensics (7 sig) │ │
                    │  │  ├─ AI Artifact Det   │ │     ┌────────────────┐
                    │  │  ├─ Rules Engine      │ │     │  OpenIBAN API  │
                    │  │  └─ Bank Validation   │─│────▶│  (external)    │
                    │  └──────────────────────┘ │     └────────────────┘
                    └──────────────────────────┘
                                                      ┌────────────────┐
                                                      │  Plaid Sandbox │
                                                      │  (external)    │
                                                      └────────────────┘
```

### End-to-End Data Flow for Upload + Analysis

1. **Upload** (`POST /invoices/upload`):
   - Frontend sends file via XHR with progress tracking
   - Backend validates: MIME type, magic bytes, file size (<=50MB), PDF page count (<=200), image decompression bomb check
   - Computes SHA256 hash, rejects duplicates
   - Saves to `backend/invoices/{uuid}.{ext}`
   - Extracts text at upload time (cached on Invoice.extracted_text)
   - Returns invoice_id, file_hash, status

2. **Analysis** (`POST /invoices/{id}/analyze`):
   - Returns HTTP 202 immediately
   - Adds `_run_analysis_background` to FastAPI BackgroundTasks
   - Background pipeline (async):
     a. **Crypto verification** — pyHanko signature detection + validation
     b. **Semantic extraction** — Ollama LLM extracts structured fields (async httpx, 120s timeout)
     c. **Regex fallback** — fills missing fields from text patterns
     d. **Bank verification** — matches against vendor bank bindings in DB
     e. **External IBAN verification** — OpenIBAN API (5s timeout)
     f. **Preview rendering** — pdf2image/PyMuPDF at 200 DPI, up to 5 pages
     g. **Forensics** — all 7 signals on all rendered pages (asyncio.to_thread)
     h. **AI inference** — LayoutLMv3 → IsolationForest (asyncio.to_thread)
     i. **Rules checks** — amount math validation (asyncio.to_thread)
     j. **AI artifact detection** — linguistic analysis (asyncio.to_thread)
     k. **Highlight assembly** — spatial + document highlights from all sources
     l. **Store** — AnalysisResult row with all JSON blobs, Invoice.status = "analyzed"

3. **Poll** (`GET /invoices/{id}/analysis-status`):
   - Frontend polls until status != "uploaded"
   - Returns full analysis result from `_full_result` stored in rules_json

### All API Endpoints

| Method | Path | Auth | Rate Limit | Router |
|--------|------|------|------------|--------|
| GET | `/` | No | None | main.py:322 |
| POST | `/auth/register` | No | 5/hour | auth/register.py:11 |
| POST | `/auth/login` | No | 5/minute | auth/login.py:25 |
| POST | `/auth/logout` | Yes | None | auth/login.py:56 |
| GET | `/auth/me` | Yes | None | auth/login.py:69 |
| PATCH | `/auth/me` | Yes | None | auth/login.py:74 |
| PATCH | `/auth/change-password` | Yes | None | auth/login.py:97 |
| GET | `/auth/check-email` | No | None | auth/login.py:124 |
| DELETE | `/auth/delete-account` | Yes | None | auth/login.py:133 |
| POST | `/auth/forgot-password` | No | 3/hour | auth/forgot_password.py:16 |
| POST | `/auth/reset-password` | No | 3/hour | auth/forgot_password.py:35 |
| GET | `/invoices/` | Yes | None | invoice.py:555 |
| POST | `/invoices/upload` | Yes | 30/hour | invoice.py:582 |
| POST | `/invoices/match-vendor` | Yes | None | invoice.py:376 |
| POST | `/invoices/{id}/analyze` | Yes | 15/hour | invoice.py:988 |
| GET | `/invoices/{id}/analysis-status` | Yes | None | invoice.py:1021 |
| DELETE | `/invoices/{id}` | Yes | None | invoice.py:1068 |
| POST | `/vendors/` | Yes | None | vendor.py:113 |
| GET | `/vendors/` | Yes | None | vendor.py:506 |
| GET | `/vendors/{id}` | Yes | None | vendor.py:454 |
| POST | `/vendors/{id}/bank-binding` | Yes | None | vendor.py:185 |
| GET | `/vendors/{id}/bank-bindings` | Yes | None | vendor.py:473 |
| POST | `/vendors/{id}/plaid/link-token` | Yes | None | vendor.py:330 |
| POST | `/vendors/{id}/plaid/exchange` | Yes | None | vendor.py:353 |
| GET | `/dashboard/stats` | Yes | None | dashboard.py:17 |
| GET | `/dashboard/recent` | Yes | None | dashboard.py:79 |
| GET | `/dashboard/invoices` | Yes | None | dashboard.py:120 |
| GET | `/dashboard/invoice/{id}` | Yes | None | dashboard.py:180 |
| GET | `/stats/landing` | No | None | stats.py:13 |
| GET | `/api/previews/{filename}` | Yes | None | files.py:43 |
| GET | `/api/rendered/{filename}` | Yes | None | files.py:58 |
| GET | `/audit/logs` | Yes | None | audit.py:23 |

### Database Schema

**Table: `users`**
| Column | Type | Constraints |
|--------|------|------------|
| id | Integer | PK, indexed |
| email | String | unique, indexed, NOT NULL |
| full_name | String | NOT NULL |
| hashed_password | String | NOT NULL |
| date_of_birth | Date | nullable |
| security_question | String | nullable |
| security_answer_hash | String | nullable |

**Table: `vendors`**
| Column | Type | Constraints |
|--------|------|------------|
| vendor_id | Integer | PK, indexed |
| vendor_name | String | NOT NULL |
| public_key_fingerprint | String | unique, nullable |
| status | String | default="active", NOT NULL |
| user_id | Integer | FK→users.id, indexed, nullable |

**Table: `invoices`**
| Column | Type | Constraints |
|--------|------|------------|
| invoice_id | Integer | PK, indexed |
| user_id | Integer | FK→users.id (CASCADE), NOT NULL |
| vendor_id | Integer | FK→vendors.vendor_id, indexed, nullable |
| original_filename | String | nullable |
| file_path | String | NOT NULL |
| file_hash | String | unique, NOT NULL |
| is_signed | Boolean | default=False, NOT NULL |
| crypto_valid | Boolean | nullable |
| signer_fingerprint | String | nullable |
| crypto_json | JSONB | nullable |
| status | String | default="uploaded", NOT NULL |
| analysis_error | String | nullable |
| extracted_text | Text | nullable |
| created_at | DateTime | default=utcnow |

**Table: `analysis_results`**
| Column | Type | Constraints |
|--------|------|------------|
| id | Integer | PK, indexed |
| invoice_id | Integer | FK→invoices.invoice_id, indexed, NOT NULL |
| prediction | Integer | NOT NULL |
| confidence | Float | NOT NULL |
| model_version | String | NOT NULL |
| created_at | DateTime | default=utcnow, NOT NULL |
| crypto_json | JSON | NOT NULL |
| ai_json | JSON | NOT NULL |
| rules_json | JSON | NOT NULL |
| semantic_json | JSON | nullable |

**Table: `vendor_bank_bindings`**
| Column | Type | Constraints |
|--------|------|------------|
| id | Integer | PK, indexed |
| vendor_id | Integer | FK→vendors.vendor_id, indexed |
| account_normalized | String | nullable |
| account_hash | String | indexed, NOT NULL |
| account_masked | String | NOT NULL |
| bank_name | String | nullable |
| account_type | String | nullable |
| currency | String | nullable |
| country | String | nullable |
| account_holder_name | String | nullable |
| verification_status | String | default="pending" |
| verification_reference | String | nullable |
| verified_at | DateTime | nullable |
| is_active | Boolean | default=True |
| created_at | DateTime | default=utcnow |
| updated_at | DateTime | default=utcnow, onupdate=utcnow |

**Table: `audit_logs`**
| Column | Type | Constraints |
|--------|------|------------|
| id | Integer | PK, autoincrement |
| timestamp | DateTime | indexed, NOT NULL, default=utcnow |
| user_id | Integer | FK→users.id, indexed, nullable |
| action | String | indexed, NOT NULL |
| resource_type | String | nullable |
| resource_id | String | nullable |
| details | JSONB | nullable |
| ip_address | String | nullable |
| user_agent | String | nullable |

### Relationships
- User → Invoices (cascade="all, delete")
- User → Vendors (cascade="all, delete")
- Invoice.user_id → User (ondelete="CASCADE")
- Invoice.vendor_id → Vendor
- AnalysisResult.invoice_id → Invoice
- VendorBankBinding.vendor_id → Vendor
- AuditLog.user_id → User

---

## 3. AI/ML PIPELINE — CURRENT STATE

### Ollama LLM (Semantic Extraction)

| Parameter | Value | Location |
|-----------|-------|----------|
| Model | qwen2.5:3b | `OLLAMA_MODEL` env var, `semantic_extraction_service.py:136` |
| URL | http://ollama:11434/api/generate | `OLLAMA_URL` env var, `semantic_extraction_service.py:135` |
| Timeout | 120 seconds | `OLLAMA_TIMEOUT` env var, `semantic_extraction_service.py:137` |
| Temperature | 0 | `semantic_extraction_service.py:189` |
| Context window | 2048 tokens | `num_ctx`, `semantic_extraction_service.py:190` |
| Threads | 8 | `num_thread`, `semantic_extraction_service.py:191` |
| Keep alive | 10 minutes | `semantic_extraction_service.py:186` |
| Stream | False | `semantic_extraction_service.py:184` |
| Format | JSON | `semantic_extraction_service.py:185` |
| Input text limit | 3500 chars | `semantic_extraction_service.py:171` |
| HTTP client | httpx.AsyncClient (native async) | `semantic_extraction_service.py:178` |
| Init script | `scripts/init_ollama_model.sh` pulls qwen2.5:3b | docker-compose depends_on |

**Prompt template** (`semantic_extraction_service.py:27-133`): Extracts 13 fields — invoice_number, vendor_name, customer_name, invoice_date, subtotal, tax, total, total_amount, currency, bank_name, bank_account, institution_number, transit_number, account_number_raw. Handles Canadian (institution-transit-account), US (routing-account), and IBAN formats.

**Failure behavior**: Returns `{"extraction_status": "failed", "extraction_error": "<message>"}`. Falls back to regex extraction for all fields.

### LayoutLMv3 (Document Embedding)

| Parameter | Value | Location |
|-----------|-------|----------|
| Model | microsoft/layoutlmv3-base | `layoutlm_features.py:16` |
| Embedding dim | 768 (CLS token) | `layoutlm_features.py:78` |
| OCR | Built-in (apply_ocr=True) | `layoutlm_features.py:40` |
| Max pages | 5 (configurable via MAX_ANALYSIS_PAGES) | `layoutlm_features.py:14` |
| Multi-page | Mean-pooling across page embeddings | `layoutlm_features.py:120` |
| Image support | PNG, JPG, JPEG, TIFF, BMP, WEBP | `layoutlm_features.py:22` |
| Retry | 2 attempts, 5s delay | `layoutlm_features.py:33,53` |
| Cache | HuggingFace default (~/.cache/huggingface) | `layoutlm_features.py:17` |

**Loading**: Lazy load at import time via `_load_model()` with try/except. Non-fatal failure.

**Failure behavior**: Returns 768-dim zero vector (`layoutlm_features.py:95`). Does not crash the service.

### IsolationForest (Anomaly Detection)

| Parameter | Value | Location |
|-----------|-------|----------|
| Algorithm | sklearn IsolationForest | `anomaly.py:6` |
| Contamination | 0.2 | `anomaly.py:7` |
| Random state | 42 | `anomaly.py:8` |
| Training data | `backend/invoices/*.pdf` (91 real invoices) | `train_reference_model.py:28` |
| Model file | `ai_pipeline/saved_models/anomaly_model.joblib` | `train_reference_model.py:18` |
| Integrity | SHA256 hash file checked at load time | `analysis_service.py:37-44` |
| Stats file | `embedding_stats.json` (centroid, mean_distance=3.35, std_distance=1.69) | Saved models dir |

**Scoring method** (`analysis_service.py:101-105`):
1. Raw score = negative decision function from IsolationForest
2. Normalized = sigmoid: `1 / (1 + exp(-raw_score))`
3. Distance = L2 norm from centroid
4. Z-score = `(distance - mean_distance) / std_distance`
5. Risk override: z-score >= 2.5 forces HIGH risk

**Risk thresholds** (`risk_policy.py:3-4`): LOW < 0.4, MEDIUM 0.4-0.7, HIGH >= 0.7

### Forensics (7 Signals)

| Signal | Weight | Threshold | Status | Location |
|--------|--------|-----------|--------|----------|
| ELA | 0.35 | 0.006 | Active, Tier 1 | `forensics_service.py:59` |
| Noise | 0.25 | 0.92 | Active, Tier 2 | `forensics_service.py:60` |
| Font | 0.20 | 0.006 | Active, Tier 1 | `forensics_service.py:61` |
| Text | 0.15 | 0.25 | Active, Tier 2 | `forensics_service.py:62` |
| Metadata | 0.05 | 0.40 | Active, Tier 2 | `forensics_service.py:63` |
| Copy-Move | 0.05 | 0.60 | Active (low weight), Tier 3 | `forensics_service.py:64` |
| DCT | 0.05 | 0.35 | Active (low weight), Tier 3 | `forensics_service.py:65` |

**Scoring** (`forensics_service.py:826-841`): Confidence-weighted average. Each signal's weight is multiplied by its confidence before averaging.

**Tier 3 gating**: DCT and copy-move only run if base_score > 0.25 or `advanced=True` (`forensics_service.py:937-945`).

**Tier 1 override**: If font OR ela triggered, risk cannot stay "low" — escalates to at least "medium" (`forensics_service.py:870-875`).

**Cross-signal boosts**: font+text (+0.10), font+ela (+0.08), ela+noise (+0.05), metadata+font (+0.10) (`forensics_service.py:72-77`).

**Risk boundaries**: low <= 0.235, medium <= 0.27, high <= 0.40, critical > 0.40 (`forensics_service.py:78-79`).

**Multi-page**: Runs all image-based signals on every rendered page, keeps worst-case scores (`forensics_service.py:960-975`).

### AI Artifact Detection

**Algorithm** (`ai_artifact_service.py`): 5 linguistic metrics + pattern matching, no external model.

| Metric | Weight | Description |
|--------|--------|-------------|
| Perplexity proxy | 0.30 | Unigram entropy (inverted: low entropy = suspicious) |
| Burstiness | 0.22 | Word gap std deviation (inverted: uniform = suspicious) |
| Trigram repetition | 0.22 | Repeated trigram ratio |
| Lexical diversity | 0.10 | Type-token ratio (inverted) |
| Punctuation density | 0.08 | Punctuation chars / text length |
| Signal boost | 0.08 | min(num_signals * 0.06, 0.30) |

**Pattern detection**: 8 template phrase regexes (0.62 confidence), round amounts (0.55), generic invoice numbers (0.50), placeholder names like "ABC Corp" (0.85).

**Risk levels**: low < 0.40, medium 0.40-0.65, high > 0.65.

**Minimum text**: 30 characters required, otherwise returns "skipped".

### Confidence Scoring (Final Risk)

There is **no ensemble fraud score** in the current code. The frontend `scoring` section is typed but the backend does not compute or return a `fraud_score` or `score_breakdown`. The individual results (AI anomaly score, forensics score, AI artifact score) are returned separately and displayed independently in the frontend.

The `prediction` field stored in AnalysisResult maps AI risk level: LOW=0, MEDIUM=1, HIGH=2. The `confidence` field is the AI anomaly_score. No composite scoring across all analysis dimensions exists.

### Failure Behavior Summary

| Component | Failure Mode | Behavior |
|-----------|-------------|----------|
| LayoutLMv3 | Network/load failure | Returns 768-dim zero vector; logs warning |
| Ollama | Unreachable / timeout | Returns status="failed"; falls back to regex extraction |
| IsolationForest | Model file missing | Returns status="error" with message |
| IsolationForest | SHA256 mismatch | Returns status="model_load_failed" |
| Tesseract | Not installed | Returns status="error" |
| Poppler | Not installed (PDF only) | Returns status="error" (skipped for images) |
| Forensics | OpenCV missing | Image-based layers return score=0, confidence=0 |
| Forensics | Image load failure | Text-only analysis (font, metadata, text layers) |
| AI artifact | Insufficient text (<30 chars) | Returns status="skipped" |
| Rules engine | No text extracted | Returns status="no_text" |
| Entire pipeline | Unhandled exception | Invoice.status="analysis_failed", error stored |

---

## 4. PERFORMANCE PROFILE

### Async Architecture

- **Analysis is async**: `POST /invoices/{id}/analyze` returns HTTP 202 immediately. Analysis runs in FastAPI `BackgroundTasks` (`invoice.py:988-1019`).
- **Ollama is async**: Uses `httpx.AsyncClient` with native async/await (`semantic_extraction_service.py:178`).
- **CPU-heavy tasks use thread pools**: All heavy operations use `asyncio.to_thread()`:
  - `run_forensics_analysis` (`invoice.py:866`)
  - `run_ai_analysis` (`invoice.py:875`)
  - `run_rules_checks` (`invoice.py:878`)
  - `run_ai_artifact_detection` (`invoice.py:882`)
  - `render_invoice_preview` (`invoice.py:857`)

### Workers

- **4 Uvicorn workers** (`docker-compose.yml:24`): `uvicorn main:app --workers 4`
- Each worker loads its own copy of LayoutLMv3 and IsolationForest into memory.
- Rate limiting is **per-worker** (slowapi in-memory), not global. A user could theoretically get 4x the rate limit across workers.

### Caching

| What | How | Location |
|------|-----|----------|
| Invoice preview images | In-memory dict keyed on path+mtime+size | `image_service.py:62` |
| IsolationForest model | Module-level `_cached_detector` | `analysis_service.py:22` |
| LayoutLMv3 model | Module-level globals | `layoutlm_features.py:23-24` |
| Layout detection model | `@lru_cache(maxsize=1)` | `image_extractor.py:38` |
| OCR agent | `@lru_cache(maxsize=1)` | `image_extractor.py:50` |
| Extracted text | Stored on Invoice.extracted_text at upload | `invoice.py:653-665` |
| HuggingFace models | Disk cache at ~/.cache/huggingface | Default transformers behavior |

### Model Warm-up (`main.py:277-316`)

On startup, `warm_up_models()` event handler pre-loads:
1. LayoutLMv3 processor + model (import triggers `_load_model()`)
2. Ollama qwen2.5:3b (dummy "ping" request, 60s timeout)
3. IsolationForest (calls `_load_detector()`)

All warm-up failures are non-fatal (logged as warnings).

### Estimated Analysis Time

No benchmarks in code. Expected per-invoice based on component complexity:
- Ollama extraction: 5-30s (depends on text length, model warm state)
- LayoutLMv3 embedding: 2-10s (depends on page count, GPU availability — CPU-only in current Docker)
- Forensics: 1-5s (depends on image resolution, whether Tier 3 triggers)
- Rules + AI artifact: <1s each
- Total: ~10-45s per invoice (CPU-only)

---

## 5. SECURITY STATE

### Authentication & Session Management

- **Session-based auth** via Starlette `SessionMiddleware` (`main.py:224-230`)
- **Session secret**: 64-char hex from `SESSION_SECRET` env var (`main.py:152`)
- **Max age**: 8 hours (28800s) (`main.py:156`)
- **HTTPS-only cookies**: Enabled when `VERIPAY_ENV=production` (`main.py:157`)
- **Same-site**: `lax` (`main.py:227`)
- **Password hashing**: bcrypt with pre-hash for >72-byte passwords (`utils/security.py:8-13`)
- **Password validation**: Min 8 chars, upper, lower, digit, special char (`utils/password_validator.py:8-20`)
- **Startup validation**: Required secrets checked at boot; production refuses to start with defaults (`main.py:60-93`)

### Rate Limiting

| Endpoint | Limit | Key | Location |
|----------|-------|-----|----------|
| POST /auth/login | 5/minute | IP | auth/login.py:26 |
| POST /auth/register | 5/hour | IP | auth/register.py:12 |
| POST /auth/forgot-password | 3/hour | IP | auth/forgot_password.py:17 |
| POST /auth/reset-password | 3/hour | IP | auth/forgot_password.py:36 |
| POST /invoices/upload | 30/hour | user_id or IP | invoice.py:583 |
| POST /invoices/{id}/analyze | 15/hour | user_id or IP | invoice.py:989 |

**Implementation**: slowapi (in-memory per worker). Not shared across 4 Uvicorn workers.

### File Upload Validation

| Check | Value | Location |
|-------|-------|----------|
| MIME type whitelist | application/pdf, image/png, image/jpeg, image/jpg | invoice.py:71-76 |
| Magic bytes validation | %PDF, \x89PNG, \xff\xd8\xff | invoice.py:85-99 |
| Max file size | 50 MB | invoice.py:79 |
| Max PDF pages | 200 | invoice.py:80 |
| Image decompression bomb | PIL.MAX_IMAGE_PIXELS = 178,956,970 | invoice.py:82 |
| Duplicate detection | SHA256 hash unique constraint | invoice.py:646-647 |
| Empty file check | Rejects 0-byte uploads | invoice.py:607-608 |

### Secrets Management

Secrets are stored in `backend/.env` (loaded via python-dotenv):
- `SESSION_SECRET` — 64-char hex
- `BANK_HASH_SECRET` — 64-char hex (used for HMAC-SHA256 account hashing)
- `DB_PASSWORD` — Supabase DB password
- `PLAID_CLIENT_ID` / `PLAID_SECRET` — Plaid sandbox credentials

**`.env` is in `.gitignore`** (`.gitignore:27-28`). However the file is present on disk with real Supabase credentials and Plaid sandbox keys.

### Security Headers (`main.py:183-196`)

| Header | Value |
|--------|-------|
| X-Content-Type-Options | nosniff |
| X-Frame-Options | DENY |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |
| Content-Security-Policy | default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http://localhost:8000; frame-ancestors 'none' |
| Strict-Transport-Security | max-age=31536000; includeSubDomains (production only) |

### Audit Trail

Events logged to `audit_logs` table via `log_event()` (`audit_service.py:20-71`):
- Captures: action, user_id, resource_type, resource_id, details (JSON), IP address, user-agent
- IP extraction: X-Forwarded-For (first segment) or request.client.host
- Never raises — silently logs errors to stderr
- Read endpoint: `GET /audit/logs` (authenticated)

### Static File Serving

- **Authenticated**: Preview images served via `GET /api/rendered/{filename}` and `GET /api/previews/{filename}` — both require `get_current_user` (`files.py:43-70`)
- **Path traversal protection**: Rejects filenames with `..`, `/`, `\`, null bytes (`files.py:37`)
- **No unauthenticated static mounts** remain

### Known Remaining Vulnerabilities

1. **`backend/.env` on disk** — contains real Supabase credentials and session secret. While gitignored, it's mounted into Docker containers and present in the working directory.

2. **Rate limiting per-worker** — slowapi uses in-memory storage. With 4 workers, effective rate limits are 4x the configured values. Needs Redis backend for global enforcement (`limiter.py:20`).

3. **CORS allows only localhost:3000** — adequate for development but blocks any non-localhost frontend deployment (`main.py:234`).

4. **CSP connect-src hardcoded to localhost:8000** — would break in production with a different API domain (`main.py:177`).

5. **No CSRF protection** — session cookies with `same_site=lax` provide partial protection, but POST endpoints are still vulnerable to cross-site requests from same-site origins.

6. **`get_current_user` opens a new DB session** that is not yielded through FastAPI's dependency injection, bypassing connection pool management (`dependencies.py:18-23`).

7. **No file-level access control** — any authenticated user can request any rendered preview file by filename. Files are not scoped to the user who uploaded the invoice (`files.py:58-70`).

---

## 6. COMPLETE FEATURE INVENTORY

| Feature | Status | Details |
|---------|--------|---------|
| User registration | Working | Email, password (bcrypt), full name, DOB, security Q&A |
| User login/logout | Working | Session-based, 8-hour expiry |
| Password change | Working | Requires current password verification |
| Forgot password | Working | Security question/answer flow (no email) |
| Account deletion | Working | Cascading delete of all user data |
| Invoice upload (PDF) | Working | SHA256 dedup, magic bytes, page limit |
| Invoice upload (PNG/JPEG) | Working | Decompression bomb protection |
| Text extraction (PDF) | Working | PyPDF2 for all pages |
| Text extraction (image) | Working | Tesseract OCR |
| Semantic extraction (LLM) | Working | Ollama qwen2.5:3b with regex fallback |
| AI anomaly detection (PDF) | Working | LayoutLMv3 + IsolationForest |
| AI anomaly detection (image) | Working | LayoutLMv3 with apply_ocr=True |
| Multi-page PDF analysis | Working | Up to 5 pages, mean-pooled embeddings |
| Forensics — ELA | Working | JPEG recompression analysis |
| Forensics — Noise | Working | Laplacian variance |
| Forensics — Font | Working | PDF font consistency (PDF only) |
| Forensics — Text consistency | Working | Font size/alignment analysis |
| Forensics — Metadata | Working | Suspicious tool detection |
| Forensics — DCT | Working | Low weight (0.05), Tier 3 only |
| Forensics — Copy-Move | Working | ORB feature matching, low weight (0.05) |
| Forensics — Multi-page | Working | All pages analyzed, worst-case kept |
| AI artifact detection | Working | Linguistic metrics + pattern matching |
| Rules engine (math checks) | Working | Subtotal+tax=total, line item sums |
| PDF signature detection | Working | pyHanko embedded signature detection |
| PDF signature verification | Working | Full CA chain validation + self-signed fallback |
| IBAN validation | Working | MOD-97 checksum |
| US routing validation | Working | 9-digit checksum |
| Canadian bank validation | Working | 3-digit institution (20 known FIs), 5-digit transit, 7-12 digit account |
| Vendor management | Working | CRUD + user ownership |
| Vendor bank bindings | Working | Hash-based matching, masked display |
| External IBAN lookup | Working | OpenIBAN API (5s timeout) |
| Plaid integration | Partial | Sandbox only; fallback to mock enabled |
| Preview image rendering | Working | pdf2image/PyMuPDF at 200 DPI |
| Highlight overlays | Working | Spatial (bbox) + document-level highlights |
| Dashboard stats | Working | Invoice counts, risk distribution |
| Audit logging | Working | All actions logged with IP/UA |
| Invoice deletion | Working | File + DB record removal |
| Ensemble fraud score | **Not implemented** | Frontend types exist but backend doesn't compute it |
| Email notifications | **Not implemented** | No email service configured |
| Multi-user file isolation | **Partial** | DB queries filter by user_id, but rendered files are globally accessible |
| PDF password protection | **Not handled** | Encrypted PDFs will fail silently |

---

## 7. EVERY REMAINING LIMITATION

### Functional Limitations
1. **No ensemble fraud score** — AI, forensics, and rules results are returned independently. No composite risk scoring across all dimensions.
2. **No email service** — Forgot password uses security questions only. No email verification on registration.
3. **Plaid is sandbox-only** — `PLAID_ENV=sandbox`, mock fallback enabled. Not production-ready.
4. **Single-tenant CORS** — Hardcoded to `localhost:3000`.
5. **No PDF password support** — Encrypted PDFs fail at text extraction.
6. **No invoice edit/update** — Upload-only workflow, no re-analysis trigger from UI.
7. **Baseline pipeline unused** — The handcrafted OCR feature pipeline (`ai_pipeline/baseline/`) is never called by the backend. Only the LayoutLMv3 pipeline is used.

### Scaling Limitations
1. **In-memory rate limiting** — Not shared across workers. Needs Redis.
2. **In-memory image cache** — Per-worker, lost on restart. No Redis/disk cache.
3. **No connection pooling config** — SQLAlchemy engine has no pool_size, max_overflow, or pool_recycle settings (`conn_db.py:24-27`).
4. **4 workers, CPU-only** — LayoutLMv3 inference is slow on CPU. No GPU support configured in Docker.
5. **No async DB** — SQLAlchemy sync engine used throughout. Thread pool dispatches mitigate but don't solve.
6. **Ollama single instance** — No load balancing, no replicas.
7. **No horizontal scaling** — Single Docker Compose deployment. No Kubernetes, no load balancer.
8. **Full analysis result stored in rules_json** — The `_full_result` blob (including all highlights, forensics, etc.) is stuffed into the `rules_json` column for status polling (`invoice.py:934-937`). This grows the JSON column significantly.

### Compliance Gaps
1. **No data retention policy** — Invoices and analysis results are never purged.
2. **No data export** — No GDPR-style data portability endpoint.
3. **No role-based access control** — All authenticated users have equal permissions.
4. **Audit log has no tamper protection** — Standard DB table, no append-only guarantees.
5. **Bank account data in logs** — Debug-level logs include normalized account numbers (`vendor_bank_service.py:110`).

---

## 8. EVERY REMAINING BREAKPOINT AND FAILURE MODE

### Can Still Crash
1. **`BANK_HASH_SECRET` missing at runtime** — `bank_utils.py:7-10` calls `.encode("utf-8")` on env var at module level. If unset, raises `AttributeError: 'NoneType' object has no attribute 'encode'` on first import. This crashes any request that touches bank utils.
2. **`SESSION_SECRET` missing** — `main.py:153-154` raises RuntimeError at startup (intentional, but crashes the whole service).
3. **Database unreachable** — Startup logs error but continues (`main.py:247-251`). First request will crash on DB access.

### Silent Failures
1. **LayoutLMv3 zero embedding** — If model fails to load, all invoices get identical zero-vector embeddings. IsolationForest will score them identically (likely all "normal"), silently providing no anomaly detection. (`layoutlm_features.py:92-97`)
2. **Ollama timeout returns partial result** — If Ollama is slow, extraction returns "failed" status but the pipeline continues with regex-only extraction. No retry.
3. **Forensics image load failure** — If preview rendering fails, forensics runs text-only checks (font, metadata, text). ELA, noise, DCT, copy-move all return score=0. The overall forensic score is computed only from text layers.
4. **Rules engine amount parsing** — Uses regex to find amounts. Misparses invoice formats with non-standard number formatting (e.g., European 1.234,56 format).
5. **AI artifact detection** — Returns "skipped" for invoices with <30 chars of extracted text. No warning to the user.
6. **Audit log failures are swallowed** — `log_event()` catches all exceptions and logs to stderr only (`audit_service.py:70`).

### Error Handling Gaps
1. **No timeout on LayoutLMv3 inference** — A malformed image could cause the model to hang indefinitely in the thread pool.
2. **No retry on Ollama** — Single attempt only. If Ollama is temporarily overloaded, extraction fails permanently.
3. **Background task exception after DB close** — The finally block closes DB (`invoice.py:972-973`), but if the exception happens during commit, the connection may already be in a bad state.
4. **`_full_result` stored inside `rules_json`** — If `rules_json` was previously populated, the full result is merged into it (`invoice.py:934-937`). Subsequent reads of `rules_json` for rules-specific data get polluted with the entire analysis result.

---

## 9. CODE QUALITY

### Dead Code
1. **Entire baseline pipeline** — `ai_pipeline/baseline/` (pipeline.py, features.py, explain.py, run_pipeline.py) is never called by the backend. Only the LayoutLMv3 advanced pipeline is used.
2. **`ai_pipeline/utils/ocr.py`** — Single function `extract_text()`, never imported by any other file.
3. **`ai_pipeline/utils/pdf_to_image.py`** — `pdf_to_images()` is only used by the baseline pipeline which is itself dead code.
4. **`ai_pipeline/utils/visualize.py`** — Only called by the dead baseline and advanced run_pipeline scripts.
5. **`ai_pipeline/invoice_gen.py`** — Test invoice generator, not used in production.
6. **Duplicate `get_db()`** — Defined in both `dependencies.py:5-10` and `conn_db.py:39-44`. Both are used by different files.
7. **`_MAGIC` entries duplicated** — `image/jpeg` and `image/jpg` have identical magic bytes (`invoice.py:88-89`).

### Duplicated Logic
1. **`get_db()`** — Two identical implementations in `dependencies.py` and `conn_db.py`.
2. **Account pattern regex** — Bank account patterns defined in both `invoice.py:111-118` and `vendor_bank_service.py:22-32`.
3. **File type inference** — `_infer_file_type()` in `invoice.py:121-127` and `IMAGE_EXTENSIONS` set in `layoutlm_features.py:22`.

### Test Coverage
- **Zero automated tests** — No test directory exists under `backend/`. The `ai_pipeline/tests/test_layoutlm.py` is a manual script (not pytest), and `backend/scripts/test_semantic_extraction.py` is also a manual script.

### Logging State
- **No print() calls remain** in project code (all converted to logging in Phase 4).
- All backend services use `logging.getLogger(__name__)`.
- `main.py:21` sets `logging.basicConfig(level=logging.INFO)`.
- Bank verification debug logs include account data at DEBUG level (`vendor_bank_service.py:110-113`).

### Dependency Issues
1. **`requirements.txt` references `requirements.normalized.txt`** in Dockerfile (`backend/Dockerfile:21`) — if that file doesn't exist, Docker build fails. (May be a typo for `requirements.txt`.)
2. **torch 2.3.1** — CPU-only in Docker (no CUDA). LayoutLMv3 inference will be slow.
3. **layoutparser** — Requires `detectron2` which can be difficult to install. Used only for table detection in rules engine.

---

## 10. DOCKER AND DEPLOYMENT STATE

### Docker Configuration

**docker-compose.yml** — 4 services:

| Service | Image | Ports | Volumes | Health Check |
|---------|-------|-------|---------|-------------|
| backend | Built from `backend/Dockerfile` | 8000:8000 | `./ai_pipeline:/app/ai_pipeline`, `./test_pdfs:/app/test_pdfs` | **None** |
| frontend | Built from `frontend/Dockerfile` | 3000:3000 | `./frontend:/app`, named `frontend_node_modules` | **None** |
| ollama | ollama/ollama:latest | 11434:11434 | Named `ollama_data` | **None** |
| ollama_init | ollama/ollama:latest | None | Shared `ollama_data`, app mount | Runs to completion |

**Named volumes**: `frontend_node_modules`, `ollama_data`

**No health checks** on any service.

### Frontend Build Mode
- **Development** — Docker runs `npm ci && npm run dev` (hot-reload dev server)
- `next.config.ts`: `typescript.ignoreBuildErrors: true`, `images.unoptimized: true`
- **Not production-optimized** — No `next build` / `next start` in Docker

### File Persistence
- **Uploaded invoices** — Stored at `backend/invoices/`. **Not mounted as a Docker volume.** The `backend/` directory is copied into the image via `COPY backend /app/backend` in Dockerfile. Invoices written at runtime exist only inside the container and are **lost on container rebuild**.
- **Rendered previews** — `backend/uploads/rendered/`. Same issue — not persisted.
- **AI models** — `ai_pipeline/` is bind-mounted (`./ai_pipeline:/app/ai_pipeline`), so `saved_models/` persists.
- **Ollama models** — Persisted via named volume `ollama_data`.
- **Database** — External Supabase, fully persisted.

### Dockerfile Issues
1. **`requirements.normalized.txt`** referenced in backend Dockerfile line 21, but the actual file is `requirements.txt`. Build may fail.
2. **No non-root user** — Backend runs as root in the container.
3. **No `.dockerignore`** — `backend/.venv/` (1GB+) could be copied into the build context.
4. **Frontend installs deps twice** — Dockerfile runs `npm ci`, then docker-compose command runs `npm ci && npm run dev` again.

---

## 11. SUMMARY TABLE

| Area | Status | Severity | Details |
|------|--------|----------|---------|
| Authentication | Good | — | bcrypt, session-based, 8hr expiry, password validation |
| Session security | Good | — | Env-driven HTTPS-only, same-site=lax, no default secret |
| Security headers | Good | — | Full set including CSP, HSTS (prod), X-Frame-Options |
| File upload validation | Good | — | MIME + magic bytes + size + page count + decompression bomb |
| Static file auth | Good | — | All file endpoints require authentication |
| Path traversal protection | Good | — | Filename validation rejects .., /, \, null bytes |
| Audit logging | Good | — | All actions logged with IP, UA, details |
| Secrets at startup | Good | — | Production refuses to start with default secrets |
| AI anomaly detection | Good | — | LayoutLMv3 + IsolationForest, trained on 91 real invoices |
| Image invoice support | Good | — | Full LayoutLMv3 analysis for PNG/JPEG |
| Multi-page PDF | Good | — | Up to 5 pages, mean-pooled embeddings, multi-page forensics |
| Forensics pipeline | Good | — | 7 signals, confidence-weighted, tiered execution |
| Canadian bank validation | Good | — | Institution (20 known FIs), transit, account number |
| IBAN/US validation | Good | — | MOD-97 checksum / US routing checksum |
| Vendor bank matching | Good | — | HMAC-SHA256 hash matching, masked display |
| Semantic extraction | Good | — | Ollama LLM + regex fallback |
| Background analysis | Good | — | Async with thread pool for CPU work |
| Model warm-up | Good | — | Pre-loads LayoutLMv3, Ollama, IsolationForest |
| Preview rendering | Good | — | pdf2image with PyMuPDF fallback, multi-page |
| Logging | Good | — | All print() removed, proper logging throughout |
| Rate limiting scope | Warning | Medium | Per-worker in-memory, 4x effective limits |
| File access control | Warning | Medium | Any authenticated user can access any rendered file |
| CORS / CSP hardcoded | Warning | Medium | localhost only, breaks non-local deployment |
| No CSRF protection | Warning | Medium | Same-site=lax provides partial coverage only |
| DB connection in get_current_user | Warning | Low | Opens session outside DI, bypasses pool management |
| Uploaded files not persisted | Warning | High | Container rebuild loses all invoices and previews |
| Frontend in dev mode | Warning | Medium | Not production-optimized, runs npm run dev in Docker |
| No health checks | Warning | Medium | Docker has no health checks on any service |
| No automated tests | Warning | High | Zero test coverage in backend or frontend |
| No ensemble fraud score | Gap | Medium | Individual scores returned, no composite risk |
| Dockerfile requirements typo | Bug | High | References requirements.normalized.txt, may break build |
| BANK_HASH_SECRET crash | Bug | High | Missing env var crashes on first bank-related request |
| Zero-vector silent failure | Warning | High | Model load failure silently disables anomaly detection |
| _full_result in rules_json | Warning | Low | Pollutes rules column with entire analysis blob |
| No data retention | Gap | Low | Invoices/results never purged |
| No role-based access | Gap | Low | All users have identical permissions |
| Duplicate get_db() | Debt | Low | Two identical definitions in separate files |
| Dead baseline pipeline | Debt | Low | ~150 lines of unused code in ai_pipeline/baseline/ |
| Plaid sandbox only | Gap | Medium | Not production-ready, mock fallback enabled |
| No GPU support | Limit | Medium | LayoutLMv3 on CPU only, slow inference |
| No horizontal scaling | Limit | Medium | Single Docker Compose, no orchestration |
