# VeriPay — Exhaustive Technical Audit Report

**Audit Date:** 2026-04-04  
**Auditor:** Claude Code (claude-sonnet-4-6)  
**Codebase Location:** `c:/Users/Hassan/Documents/VeriPay-Aryan/`  
**Repository State:** Not a git repository (local directory only)  

---

## Directory Tree (Source Files Only)

```
VeriPay-Aryan/
├── .dockerignore
├── .gitignore
├── docker-compose.yml
├── requirements.txt                    ← UTF-16 encoded (broken format)
├── readmeMac.md
├── readmeWindows.md
├── backend/
│   ├── .env                            ← LIVE CREDENTIALS
│   ├── Dockerfile
│   ├── conn_db.py
│   ├── dependencies.py
│   ├── main.py
│   ├── package-lock.json               ← out-of-place in backend/
│   ├── extraction/
│   │   ├── image_extractor.py
│   │   └── pdf_extractor.py
│   ├── integrity/
│   │   ├── crypto_verifier.py
│   │   ├── hash_utils.py
│   │   ├── integrity_service.py
│   │   ├── signature_detection.py
│   │   ├── signature_verifier.py
│   │   ├── vendor_bank_service.py
│   │   └── vendor_identity_service.py
│   ├── invoices/                       ← ~100 production invoice files on disk
│   ├── models/
│   │   ├── analysis_result.py
│   │   ├── invoice.py
│   │   ├── user.py
│   │   ├── vendor.py
│   │   └── vendor_bank_binding.py
│   ├── routers/
│   │   ├── auth/
│   │   │   ├── forgot_password.py
│   │   │   ├── login.py
│   │   │   └── register.py
│   │   ├── dashboard.py
│   │   ├── invoice.py
│   │   ├── stats.py
│   │   └── vendor.py
│   ├── schemas/
│   │   ├── auth/ (login, register, profile, forgot_password)
│   │   ├── invoice.py
│   │   └── vendor.py
│   ├── scripts/
│   │   ├── init_ollama_model.sh
│   │   └── test_semantic_extraction.py
│   ├── services/
│   │   ├── ai_artifact_service.py
│   │   ├── analysis_service.py
│   │   ├── auth/ (login_service.py, register_service.py)
│   │   ├── auth_service.py
│   │   ├── bank_utils.py
│   │   ├── bank_validation_service.py
│   │   ├── forensics_service.py
│   │   ├── highlight_service.py
│   │   ├── iban_registry_service.py
│   │   ├── image_service.py
│   │   ├── plaid_service.py
│   │   ├── rules_service.py
│   │   └── semantic_extraction_service.py
│   └── utils/
│       ├── bank_hashing.py
│       ├── hashing.py
│       ├── password_validator.py
│       └── security.py
├── ai_pipeline/
│   ├── README.md
│   ├── advanced/
│   │   ├── anomaly.py
│   │   ├── layoutlm_features.py
│   │   ├── pipeline_layoutlm.py
│   │   └── run_pipeline_layoutlm.py
│   ├── baseline/
│   │   ├── explain.py
│   │   ├── features.py
│   │   ├── pipeline.py
│   │   └── run_pipeline.py
│   ├── deployment/
│   │   ├── analyze_invoice.py
│   │   └── train_reference_model.py
│   ├── interpretation/
│   │   ├── explanation.py
│   │   └── risk_policy.py
│   ├── invoice_gen.py
│   ├── sample_invoices/ (3 PDFs)
│   ├── saved_models/
│   │   ├── anomaly_model.pkl           ← Pickle file
│   │   └── embedding_stats.json
│   ├── temp_images/ (~17 PNG renders)
│   ├── tests/
│   │   └── test_layoutlm.py
│   └── utils/
│       ├── normalize.py
│       ├── ocr.py
│       ├── pdf_to_image.py
│       └── visualize.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── about/page.tsx
│       │   ├── analysis/page.tsx
│       │   ├── context/AuthContext.tsx
│       │   ├── dashboard/page.tsx
│       │   ├── forgot-password/page.tsx
│       │   ├── invoices/[id]/page.tsx
│       │   ├── invoices/page.tsx
│       │   ├── layout.tsx
│       │   ├── login/page.tsx
│       │   ├── page.tsx
│       │   ├── profile/page.tsx
│       │   ├── register/page.tsx
│       │   ├── upload/page.tsx
│       │   └── vendors/
│       │       ├── [vendor_id]/page.tsx
│       │       ├── new/page.tsx
│       │       └── page.tsx
│       ├── components/
│       │   ├── AddBankBindingModal.tsx
│       │   ├── analysis/ (CryptoVerificationCard, VendorPaymentCard, types.ts)
│       │   └── ui/ (Radix primitives, toast, etc.)
│       └── hooks/use-toast.ts
└── test_pdfs/ (sample PDFs + test certs)
```

---

## 1. PROJECT IDENTITY

### What VeriPay Actually Is

VeriPay is an **invoice fraud detection and verification platform** targeting **accounts-payable teams** — likely at SMEs processing vendor invoices and managing payment authorization. Based on the actual code:

- Users upload PDF or image invoices.
- The system extracts payment fields (vendor name, bank account, amounts) via LLM (Ollama/Qwen2.5:3b) and regex.
- It verifies extracted bank account numbers against pre-registered vendor bank bindings (either Plaid-linked or manually entered).
- It runs a LayoutLMv3 + IsolationForest anomaly detector to flag suspicious invoices.
- It performs forensic image analysis (ELA, noise, font consistency, copy-move) to detect document manipulation.
- It checks PDF digital signatures against a vendor certificate registry.
- It produces a composite fraud score and risk level (LOW/MEDIUM/HIGH) used to decide whether an invoice requires manual review.

### Target Users

Accounts payable staff, finance controllers, and fraud analysts at businesses that process vendor invoices.

### Complete Tech Stack

**Backend:**
- Python 3.11
- FastAPI 0.128.0 + Uvicorn 0.40.0 + Starlette 0.50.0
- SQLAlchemy 2.0.45 (ORM)
- PostgreSQL via Supabase (psycopg2-binary 2.9.11)
- Alembic (migration tool — imported but migrations directory not present in source)
- PyPDF2 3.0.1 (PDF text extraction)
- pdfplumber (table extraction)
- PyMuPDF / fitz (PDF rendering)
- pdf2image 1.17.0 + Poppler (PDF-to-image conversion)
- pytesseract 0.3.13 + Tesseract OCR (image text extraction)
- Pillow 12.1.0 (image processing)
- OpenCV (forensics)
- pyHanko 0.32.0 (PDF signature verification)
- pyhanko-certvalidator 0.29.0
- cryptography 46.0.3 (certificate handling)
- bcrypt 5.0.0 (password hashing)
- requests 2.32.5 (HTTP calls to Ollama, Plaid, OpenIBAN)
- itsdangerous 2.1.2 (session signing)
- layoutparser (document layout detection — optional, no version pinned)

**AI/ML:**
- Ollama (self-hosted LLM inference server)
- Model: `qwen2.5:3b` (3-billion parameter Qwen model for field extraction)
- transformers 4.48.0 (LayoutLMv3 from HuggingFace)
- torch 2.3.1 + torchvision 0.18.1 (LayoutLMv3 inference)
- scikit-learn 1.5.2 (IsolationForest anomaly detector)
- numpy 1.26.4
- microsoft/layoutlmv3-base (pretrained, loaded from HuggingFace)

**Frontend:**
- Next.js 16.1.4 (React 19.2.3)
- TypeScript
- Tailwind CSS 3.4.19
- Radix UI component primitives
- framer-motion 12.34.3 (animations)
- lucide-react 0.563.0 (icons)
- next-themes (dark mode)

**External Services:**
- Supabase (PostgreSQL hosting)
- Plaid (Sandbox — bank account verification)
- openiban.com (free IBAN validation API)
- HuggingFace Hub (LayoutLMv3-base model download)

**Deployment:**
- Docker Compose (4 services: backend, frontend, ollama, ollama_init)
- No cloud provider, no CI/CD, no load balancer.

---

## 2. FULL ARCHITECTURE MAP

### System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Client Browser                     │
│         (Next.js 16, React 19, Tailwind)             │
│              http://localhost:3000                    │
└────────────────────────┬────────────────────────────┘
                         │ HTTP + Cookies (session-based auth)
                         │ credentials: "include"
┌────────────────────────▼────────────────────────────┐
│                   FastAPI Backend                    │
│              http://localhost:8000                   │
│  Uvicorn (single process, single worker)             │
│                                                      │
│  Routers: /auth  /vendors  /invoices  /dashboard    │
│           /stats  /preview_cache  /rendered          │
│                                                      │
│  SessionMiddleware (itsdangerous signed cookies)     │
│  CORS: allow_origins=["http://localhost:3000"]       │
└──────┬────────────────┬────────────────┬────────────┘
       │                │                │
┌──────▼──────┐  ┌──────▼──────┐  ┌────▼──────────────┐
│  Supabase   │  │   Ollama    │  │  openiban.com      │
│  PostgreSQL │  │ :11434      │  │  (IBAN validation) │
│  (remote)   │  │ qwen2.5:3b  │  │  Free public API   │
└─────────────┘  └─────────────┘  └───────────────────┘
       │                │
┌──────▼──────┐  ┌──────▼──────┐
│  Plaid API  │  │ HuggingFace │
│  (sandbox)  │  │  Hub (model │
│  Mocked     │  │  download)  │
└─────────────┘  └─────────────┘
```

### Every Module and Its Role

| Module | File(s) | Role |
|--------|---------|------|
| Auth | `routers/auth/login.py`, `register.py`, `forgot_password.py` | Session-based login/logout/registration/password reset |
| Invoice Upload | `routers/invoice.py:538-610` | File receipt, dedup, integrity check, storage |
| Invoice Analysis | `routers/invoice.py:616-830` | Full ML pipeline orchestration |
| Vendor Management | `routers/vendor.py` | Vendor CRUD, Plaid exchange, bank binding |
| Dashboard | `routers/dashboard.py` | Stats, recent invoices, invoice detail view |
| Stats | `routers/stats.py` | Unauthenticated landing page stats |
| PDF Extraction | `extraction/pdf_extractor.py` | Text and signature metadata extraction via PyPDF2 |
| Image Extraction | `extraction/image_extractor.py` | OCR via Tesseract, optional layout detection |
| Semantic Extraction | `services/semantic_extraction_service.py` | LLM-based field extraction via Ollama/Qwen |
| Rules Engine | `services/rules_service.py` | Amount validation, font consistency, keyword matching |
| AI Analysis | `services/analysis_service.py` | LayoutLMv3 + IsolationForest anomaly scoring |
| Forensics | `services/forensics_service.py` | ELA, noise, copy-move, font, metadata analysis |
| AI Artifact Detection | `services/ai_artifact_service.py` | Linguistic analysis to detect AI-generated invoices |
| Integrity Service | `integrity/integrity_service.py` | PDF signature detection + verification orchestration |
| Signature Verifier | `integrity/signature_verifier.py` | pyHanko PDF signature validation |
| Vendor Bank Service | `integrity/vendor_bank_service.py` | Bank account hash comparison against stored bindings |
| Vendor Identity Service | `integrity/vendor_identity_service.py` | Certificate fingerprint matching |
| Plaid Service | `services/plaid_service.py` | Open banking integration with mock fallback |
| Bank Utils | `services/bank_utils.py` | Account normalization, hashing, masking, type detection |
| IBAN Registry | `services/iban_registry_service.py` | External IBAN validation via openiban.com |
| Highlight Service | `services/highlight_service.py` | Aggregates signals into UI highlight bundles |
| Image Service | `services/image_service.py` | PDF-to-image rendering, caching, shared across services |
| AI Pipeline | `ai_pipeline/advanced/` | LayoutLMv3 embedding + IsolationForest detector |

### End-to-End Data Flows

#### Invoice Upload Flow (`POST /invoices/upload`)
```
User → POST file → 
  1. MIME type validation (application/pdf, image/*) [invoice.py:547]
  2. File contents read into memory [invoice.py:553]
  3. SHA256 hash computed [invoice.py:557]
  4. Duplicate check against invoices.file_hash [invoice.py:559]
  5. File written to disk: backend/invoices/<uuid>.<ext> [invoice.py:562-564]
  6. Text/content extraction (pdf_extractor or image_extractor) [invoice.py:567-570]
  7. PDF signature detection + verification (pyHanko) [invoice.py:572]
  8. Vendor identity check by certificate fingerprint [invoice.py:580-585]
  9. Invoice record written to DB [invoice.py:589-601]
  10. Response: invoice_id, file_hash, file_type, crypto result
```

#### Invoice Analysis Flow (`POST /invoices/{id}/analyze`)
```
User → POST invoice_id →
  1. Invoice fetched from DB (user ownership check) [invoice.py:622-629]
  2. Text extraction (silent failure on exception) [invoice.py:634-643]
  3. Signature verification (repeated from upload) [invoice.py:646]
  4. Vendor identity resolution [invoice.py:654-659]
  5. LLM semantic extraction via Ollama/Qwen2.5:3b [invoice.py:662]
  6. Regex fallback extraction [invoice.py:663]
  7. Merge (semantic-first) [invoice.py:664]
  8. Bank account assembly from parts [invoice.py:667-690]
  9. Account type detection (CA/US/IBAN/OTHER) [invoice.py:692]
  10. Format validation [invoice.py:694-706]
  11. Account normalization [invoice.py:708-713]
  12. IBAN external validation via openiban.com (if IBAN) [invoice.py:715-721]
  13. Bank account hash comparison vs vendor bindings [invoice.py:724-730]
  14. Image render for preview + forensics [invoice.py:735-743]
  15. Forensic analysis (ELA, noise, fonts, copy-move) [invoice.py:746-750]
  16. AI anomaly analysis (LayoutLMv3 + IsolationForest) [invoice.py:753-758]
  17. Rules checks (amount validation, font analysis) [invoice.py:761-767]
  18. AI artifact detection (linguistic analysis) [invoice.py:770]
  19. Highlight bundle construction [invoice.py:773-777]
  20. Prediction + confidence score assembly [invoice.py:780-786]
  21. AnalysisResult written to DB [invoice.py:789-801]
  22. Full response returned (30+ fields) [invoice.py:804-830]
```

#### Vendor + Bank Binding Registration Flow
```
User → POST /vendors/ (with optional .pem/.cer cert) →
  1. Certificate parsed (PEM or DER) [vendor.py:129-137]
  2. SHA256 fingerprint of DER encoding [vendor.py:139-141]
  3. Duplicate fingerprint check [vendor.py:143-151]
  4. Vendor record created [vendor.py:153-160]

User → POST /vendors/{id}/plaid/link-token →
  1. Plaid link token created (or mocked) [vendor.py:315-320]

User → POST /vendors/{id}/plaid/exchange (with public_token) →
  1. Public token exchanged for access token [vendor.py:336]
  2. Account data fetched from Plaid [vendor.py:337]
  3. DEV_MODE_OVERRIDE_BANK may replace account number [vendor.py:346-349]
  4. Account normalized + hashed + masked [vendor.py:351-356]
  5. VendorBankBinding written to DB [vendor.py:393-410]
```

### All API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | None | Create account |
| POST | `/auth/login` | None | Login, set session cookie |
| POST | `/auth/logout` | None | Clear session |
| GET | `/auth/me` | Session | Get current user |
| PATCH | `/auth/me` | Session | Update profile |
| PATCH | `/auth/change-password` | Session | Change password |
| GET | `/auth/check-email` | Session | Check if email exists |
| DELETE | `/auth/delete-account` | Session | Delete account with security answer |
| POST | `/auth/forgot-password` | None | Return security question for email |
| POST | `/auth/reset-password` | None | Reset password via security answer |
| GET | `/vendors/` | Session | List ALL vendors (no user filter) |
| POST | `/vendors/` | Session | Register vendor |
| GET | `/vendors/{id}` | Session | Get vendor details |
| GET | `/vendors/{id}/bank-bindings` | Session | Get vendor bank bindings |
| POST | `/vendors/{id}/bank-binding` | Session | Add manual bank binding |
| POST | `/vendors/{id}/plaid/link-token` | Session | Create Plaid link token |
| POST | `/vendors/{id}/plaid/exchange` | Session | Exchange Plaid public token |
| GET | `/invoices/` | Session | List current user's invoices |
| POST | `/invoices/upload` | Session | Upload invoice |
| POST | `/invoices/match-vendor` | Session | Match invoice fields to vendor |
| POST | `/invoices/{id}/analyze` | Session | Run full analysis pipeline |
| DELETE | `/invoices/{id}` | Session | Delete invoice |
| GET | `/dashboard/stats` | Session | Dashboard statistics |
| GET | `/dashboard/recent` | Session | Recent 10 invoices |
| GET | `/dashboard/invoices` | Session | Paginated invoice list |
| GET | `/dashboard/invoice/{id}` | Session | Single invoice with analysis |
| GET | `/stats/landing` | **None** | Total invoice/vendor counts |
| GET | `/preview_cache/*` | **None** | Static file serving (invoice previews) |
| GET | `/rendered/*` | **None** | Static file serving (rendered previews) |

### Complete Database Schema

**Table: `users`**
```sql
id                   INTEGER  PK, index
email                STRING   unique, index, not null
full_name            STRING   not null
hashed_password      STRING   not null
date_of_birth        DATE     nullable
security_question    STRING   nullable
security_answer_hash STRING   nullable
```
Relationship: `invoices` (one-to-many, cascade delete)

**Table: `vendors`**
```sql
vendor_id              INTEGER  PK, index
vendor_name            STRING   not null
public_key_fingerprint STRING   unique, nullable
status                 STRING   not null, default="active"
```
No relationship to users — vendors are global, not user-scoped.

**Table: `invoices`**
```sql
invoice_id         INTEGER  PK, index
user_id            INTEGER  FK(users.id, CASCADE), not null
vendor_id          INTEGER  FK(vendors.vendor_id), index, nullable
original_filename  STRING   nullable
file_path          STRING   not null
file_hash          STRING   not null, unique
is_signed          BOOLEAN  not null, default=false
crypto_valid       BOOLEAN  nullable
signer_fingerprint STRING   nullable
status             STRING   not null, default="uploaded"
created_at         DATETIME default=utcnow
```

**Table: `analysis_results`**
```sql
id            INTEGER  PK, index
invoice_id    INTEGER  FK(invoices.invoice_id), index, not null
prediction    INTEGER  not null   (-1=no AI result, 0=LOW, 1=MED, 2=HIGH)
confidence    FLOAT    not null
model_version STRING   not null   (hardcoded: "layoutlmv3-isolation-forest")
created_at    DATETIME not null, default=utcnow
crypto_json   JSON     not null
ai_json       JSON     not null
rules_json    JSON     not null
semantic_json JSON     nullable
```

**Table: `vendor_bank_bindings`**
```sql
id                   INTEGER  PK, index
vendor_id            INTEGER  FK(vendors.vendor_id), index
account_normalized   STRING   nullable
account_hash         STRING   not null, index
account_masked       STRING   not null
bank_name            STRING   nullable
account_type         STRING   nullable
currency             STRING   nullable
country              STRING   nullable
account_holder_name  STRING   nullable
verification_status  STRING   default="pending"
verification_reference STRING nullable
verified_at          DATETIME nullable
is_active            BOOLEAN  default=true
created_at           DATETIME default=utcnow
updated_at           DATETIME default=utcnow, onupdate=utcnow
```

**Indexes:**  
- Primary keys: auto-indexed  
- `users.email` (unique), `invoices.file_hash` (unique), `vendors.public_key_fingerprint` (unique)  
- `invoices.vendor_id`, `analysis_results.invoice_id`, `vendor_bank_bindings.vendor_id`, `vendor_bank_bindings.account_hash`  
- No composite indexes, no partial indexes, no full-text indexes.  
- No Alembic migration files present — tables created via `Base.metadata.create_all()` on startup.

### Authentication and Authorization

- **Mechanism:** Server-side session via `starlette.middleware.sessions.SessionMiddleware`
- **Cookie:** `session` cookie, signed with `itsdangerous`, `SameSite=lax`, `https_only=False`
- **Session secret:** `os.getenv("SESSION_SECRET", "dev-secret-change-me")` — currently `"dev-secret-change-me"` (see [backend/.env](backend/.env):8)
- **Session storage:** Stateless — session data is in the signed cookie itself (not server-side store)
- **Session contains:** `{"user_id": int}`
- **`get_current_user`** ([dependencies.py:12](backend/dependencies.py#L12)): reads `user_id` from session, opens its own `SessionLocal()` DB session (not from DI), fetches user, closes DB.
- **Authorization model:** Flat — authenticated = authorized. No roles, no permissions, no resource ownership checks on vendors (vendors are global).
- **Session expiry:** Not configured — no `max_age` set on `SessionMiddleware`.

### File/Image Upload and Storage

- **Upload path:** `backend/invoices/<uuid4><original_extension>`
- **Format:** Original file preserved as-is (no conversion)
- **Allowed types:** `application/pdf`, `image/png`, `image/jpeg`, `image/jpg`
- **Deduplication:** SHA256 hash checked against `invoices.file_hash` (unique)
- **Preview renders:** `backend/uploads/rendered/preview_<8hexchars>_<filename>.png`
- **Size limits:** None — no `Content-Length` check, no `max_size` guard anywhere
- **Access control:** Files served via unauthenticated static routes `/preview_cache/*` and `/rendered/*`

---

## 3. AI/ML PIPELINE — EXACTLY HOW IT WORKS

### Ollama Integration

**Configuration** ([semantic_extraction_service.py:132-134](backend/services/semantic_extraction_service.py#L132)):
```python
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "120"))
```

**Model:** `qwen2.5:3b` — 3-billion parameter instruction-tuned model. Not a document-specific model.  
**Task:** Invoice field extraction from raw text.  
**Transport:** HTTP POST to `/api/generate` using a persistent `requests.Session()` object.

### Full Verification Pipeline (Ordered)

1. Text extraction ([invoice.py:634-643](backend/routers/invoice.py#L634))
2. PDF signature verification ([invoice.py:646](backend/routers/invoice.py#L646))
3. Vendor identity resolution ([invoice.py:654-659](backend/routers/invoice.py#L654))
4. LLM semantic extraction — Ollama/Qwen2.5:3b ([invoice.py:662](backend/routers/invoice.py#L662))
5. Regex fallback extraction ([invoice.py:663](backend/routers/invoice.py#L663))
6. Field merge (semantic-first) ([invoice.py:664](backend/routers/invoice.py#L664))
7. Bank account assembly + validation ([invoice.py:667-711](backend/routers/invoice.py#L667))
8. IBAN external verification (openiban.com) ([invoice.py:715-721](backend/routers/invoice.py#L715))
9. Bank account hash matching against vendor bindings ([invoice.py:724-730](backend/routers/invoice.py#L724))
10. Image render ([invoice.py:735-743](backend/routers/invoice.py#L735))
11. Forensic analysis ([invoice.py:746-750](backend/routers/invoice.py#L746))
12. AI anomaly analysis — LayoutLMv3 + IsolationForest ([invoice.py:753-758](backend/routers/invoice.py#L753))
13. Rules checks ([invoice.py:761-767](backend/routers/invoice.py#L761))
14. AI artifact detection ([invoice.py:770](backend/routers/invoice.py#L770))
15. Highlight aggregation ([invoice.py:773-777](backend/routers/invoice.py#L773))
16. DB write ([invoice.py:789-801](backend/routers/invoice.py#L789))

### Prompt Template (Verbatim)

From [semantic_extraction_service.py:24-130](backend/services/semantic_extraction_service.py#L24):

```
You are an intelligent invoice field extraction engine.

Your job is to extract structured invoice data from raw invoice text.

Return ONLY a valid JSON object.
No explanations.
No markdown.
No text before or after JSON.
If a field is missing, return null.

Do NOT rely only on explicit keywords.
Use document structure, layout patterns, numeric patterns, and contextual meaning.

Extraction Guidelines:

1. invoice_number:
   - May appear as Order ID, Invoice ID, Reference ID
   - Usually a short alphanumeric identifier near the top.
   ...

10. bank_account:
    - CANADIAN ACCOUNTS: combine as "institution-transit-account"
      Example: Institution No. 003 / Transit No. 00123 / Account No. 1234567
      Output: "bank_account": "003-00123-1234567"
    - US ACCOUNTS: combine as "routing-account"
      Example: "011401533-1111222233330000"
    - IBAN: Return as-is without spaces.

Return EXACTLY this JSON schema:
{schema}

Invoice text:
{invoice_text}
```

**Inference parameters** ([semantic_extraction_service.py:179-189](backend/services/semantic_extraction_service.py#L179)):
```python
{
    "model": "qwen2.5:3b",
    "stream": False,
    "format": "json",
    "keep_alive": "10m",
    "options": {
        "temperature": 0,
        "num_ctx": 2048,
        "num_thread": 8,
    },
}
```

### Preprocessing

- Text truncated to first 3,500 characters ([semantic_extraction_service.py:165](backend/services/semantic_extraction_service.py#L165))
- No cleaning of special characters, no encoding normalization
- Schema inlined as JSON string in prompt

### Postprocessing

([semantic_extraction_service.py:212-267](backend/services/semantic_extraction_service.py#L212))

1. If response is a `str`: strip markdown code fences, attempt `json.loads()`
2. If that fails: regex extract `{...}` from response, retry `json.loads()`
3. If still fails: return empty extraction dict (all nulls)
4. If response is already a `dict`: use directly
5. Field mapping: `total_amount` accepts both `"total_amount"` and `"total"` keys
6. All values converted to `str` and stripped
7. Values of `"null"` (as string) are excluded

### Confidence Scoring

The LLM produces no confidence score. Confidence in the system comes from the anomaly detector:

- `raw_score` = `-IsolationForest.decision_function(embedding)` ([analysis_service.py:58](backend/services/analysis_service.py#L58))
- `normalized_score` = sigmoid: `1 / (1 + exp(-raw_score))` ([analysis_service.py:59](backend/services/analysis_service.py#L59))
- Risk thresholds ([risk_policy.py](ai_pipeline/interpretation/risk_policy.py)):
  - `score >= 0.7` → HIGH, review required
  - `score >= 0.4` → MEDIUM, review required
  - `score < 0.4` → LOW, no review
- Override: if `distance_z >= 2.5` → force HIGH ([analysis_service.py:72-74](backend/services/analysis_service.py#L72))
- `distance` = Euclidean distance from the 768-dim centroid of training embeddings

### What Happens When Ollama Is Unreachable or Times Out

([semantic_extraction_service.py:194-198](backend/services/semantic_extraction_service.py#L194)):
```python
try:
    resp = _session.post(OLLAMA_URL, json=payload, timeout=OLLAMA_TIMEOUT)
except Exception as exc:
    print("❌ OLLAMA CONNECTION FAILED:", exc)
    return result   # ← all-null extraction dict
```

The pipeline **continues** with an empty extraction (all fields null). No error is returned to the user. The analysis proceeds with no semantic fields, which means bank verification will fail silently with `"vendor_unknown"` status.

### Token Usage and Context Window

- `num_ctx: 2048` tokens for Qwen2.5:3b
- Prompt template overhead: ~400 tokens
- Invoice text: up to 3,500 characters (≈700–900 tokens)
- Total: ~1,100–1,300 tokens per call (well within 2,048 limit)
- No streaming, no batching

### Model Loading and Preloading

- LayoutLMv3Processor and LayoutLMv3Model loaded **at module import time** ([layoutlm_features.py:11-19](ai_pipeline/advanced/layoutlm_features.py#L11))
- This means the 350MB+ model loads when `ai_pipeline` is first imported by `analysis_service.py`
- Dynamic imports used: `from advanced.pipeline_layoutlm import process_invoice_layoutlm` inside `run_ai_analysis()` ([analysis_service.py:38-42](backend/services/analysis_service.py#L38))
- **No preloading** — first analysis request triggers model load

### Response Caching

- No caching of Ollama responses
- Image renders cached in-memory in `image_service.py` (keyed by file path + mtime + size)
- Layout model cached via `@lru_cache(maxsize=1)` in [image_extractor.py:38](backend/extraction/image_extractor.py#L38)
- Ollama `keep_alive: "10m"` keeps the model in VRAM for 10 minutes between requests

---

## 4. PERFORMANCE PROFILE

### Critical Path (Slowest Operation: `POST /invoices/{id}/analyze`)

Sequential bottlenecks (every step blocks the next):

1. **PDF text extraction** (PyPDF2): 0.05–0.5s depending on PDF size
2. **PDF signature verification** (pyHanko, repeated): 0.5–3s (network if CRL checked — but CRL is disabled)
3. **Ollama LLM call** (Qwen2.5:3b): 5–60s depending on GPU/CPU availability, cold vs warm
4. **PDF-to-image render** (pdf2image/Poppler): 1–3s for first page at 200 DPI
5. **LayoutLMv3 inference** (torch): 3–10s CPU, <1s GPU. **Model must be loaded first (~5–15s cold start)**
6. **Forensics analysis** (OpenCV ELA, noise): 1–5s
7. **DB writes**: ~0.05–0.2s (Supabase, remote)

**Total estimated end-to-end on CPU (cold):** 20–90 seconds per analysis request.  
**Total on warm GPU:** 8–20 seconds per analysis request.

### Every Source of Lag

| Source | File:Line | Description |
|--------|-----------|-------------|
| Ollama LLM call | [semantic_extraction_service.py:195](backend/services/semantic_extraction_service.py#L195) | 120s timeout, synchronous blocking HTTP |
| LayoutLMv3 model load | [layoutlm_features.py:11-19](ai_pipeline/advanced/layoutlm_features.py#L11) | Cold start: HuggingFace model load into RAM/GPU (~350MB) |
| PDF-to-image conversion | [analysis_service.py:51](backend/services/analysis_service.py#L51) | Calls Poppler subprocess via pdf2image |
| Forensics ELA computation | [forensics_service.py] | JPEG recompression + per-pixel diff on full-resolution image |
| Signature verification (repeated) | [invoice.py:646](backend/routers/invoice.py#L646) | pyHanko full PDF parse, repeated in both upload AND analyze |
| Text extraction (repeated) | [invoice.py:634](backend/routers/invoice.py#L634) | PyPDF2 extraction, repeated in both upload AND analyze |
| Remote DB queries | `conn_db.py:24` | Supabase is remote (Canada Central); every query has RTT |
| Sync `get_current_user` DB open | [dependencies.py:17-19](backend/dependencies.py#L17) | Opens a new session per request, outside DI lifecycle |

### Database Query Analysis

- No slow-query logging configured
- No connection pool tuning beyond SQLAlchemy defaults (pool size=5, overflow=10)
- `dashboard.py` executes 5 separate COUNT queries for stats — no single aggregation query
- `get_all_invoices` uses a subquery with `MAX(created_at)` for latest analysis — potentially slow on large datasets
- Vendor search uses `ilike(f"%{vendor_name_query}%")` — full table scan, no full-text index
- `stats/landing` runs `db.query(Invoice).count()` and `db.query(Vendor).count()` separately — no auth, runs on every page load

### Synchronous Blocking Operations

The entire Uvicorn server runs as a **single-worker, single-process ASGI app**. The Ollama HTTP call, LayoutLMv3 inference, pdf2image, and all forensics run synchronously. They block the event loop for the full duration of the request, meaning a single concurrent analysis request can stall all other requests.

### Memory Usage Patterns

- LayoutLMv3-base model: ~350MB RAM/VRAM (loaded once at module import)
- IsolationForest anomaly model loaded from pickle on **every** `run_ai_analysis()` call ([analysis_service.py:44-45](backend/services/analysis_service.py#L44)) — no caching
- pdf2image returns full PIL images in memory; not explicitly freed
- No memory limits on image processing (`Image.MAX_IMAGE_PIXELS` not set in `image_extractor.py`)

---

## 5. COMPLETE FEATURE INVENTORY

| Feature | Status | Notes |
|---------|--------|-------|
| User registration | Working | Email uniqueness enforced |
| User login (session cookie) | Working | No rate limiting |
| Password change | Working | Prevents reuse of current password |
| Password reset via security question | Working | No rate limiting, no account lockout |
| Account deletion | Working | Requires security answer |
| PDF invoice upload | Working | Dedup by SHA256 |
| Image invoice upload (PNG/JPEG) | Working | No size limit |
| PDF signature detection | Working | Via pyHanko |
| PDF signature verification (self-signed) | Partially working | Returns valid=True for all exceptions (see §7) |
| PDF signature verification (CA-signed) | Working | Requires allow_fetching=True for full CRL |
| LLM field extraction (Ollama/Qwen) | Working (PDF) | Silent fallback to empty on failure |
| Regex field extraction (fallback) | Working | Limited patterns |
| Canadian bank account parsing | Working | 3-part: institution-transit-account |
| US bank account parsing | Working | routing-account, checksum validated |
| IBAN parsing + mod-97 validation | Working | via bank_validation_service.py |
| External IBAN verification | Working | Calls openiban.com, 5s timeout |
| Plaid bank account linking | Working (sandbox) | Sandbox only; mock fallback when Plaid unreachable |
| Vendor registration | Working | Optional certificate |
| Vendor certificate fingerprinting | Working | SHA256 of DER-encoded cert |
| Manual bank binding | Working | IBAN+US validated, CA format-only |
| Vendor bank account hash matching | Working | HMAC-SHA256 comparison |
| LayoutLMv3 embedding extraction | Working (PDF only) | First page only, requires Tesseract + Poppler |
| IsolationForest anomaly scoring | Working (PDF only) | Trained on 3 sample invoices only |
| Forensic ELA analysis | Working | Calibrated on 1,323-invoice dataset (claimed) |
| Forensic noise analysis | Working | |
| Forensic font analysis | Working | |
| Forensic copy-move detection | Effectively disabled | Weight=0.0 (demoted in calibration) |
| Forensic DCT analysis | Effectively disabled | Weight=0.0 (demoted in calibration) |
| AI artifact (AI-text) detection | Working | Linguistic heuristics only |
| Highlight bundle generation | Working | Aggregates all signals |
| Invoice preview rendering | Working | PDF→PNG, cached |
| Dashboard statistics | Working | Per-user |
| Paginated invoice list | Working | |
| Vendor list | Working | Returns ALL vendors (not user-scoped) |
| AI analysis for image invoices | **Skipped** | Returns `{"status": "skipped"}` |
| Signature verification for images | **Not applicable** | Returns `"not_applicable"` |
| Multi-page PDF analysis | **First page only** | LayoutLMv3 and pdf2image limited to page 1 |
| Model retraining | **Manual only** | `deployment/train_reference_model.py`, not integrated |
| Audit log | **Not present** | No immutable event log exists |
| Email notifications | **Not present** | |
| Webhook integration | **Not present** | |
| Batch processing | **Not present** | |
| API key authentication | **Not present** | Session-only |

---

## 6. EVERY LIMITATION

### What It Cannot Do

1. **Image invoices get no AI analysis.** The LayoutLMv3 pipeline is PDF-only. Images get `{"status": "skipped"}`. Forensics still runs.
2. **Multi-page PDFs: only page 1 analyzed.** LayoutLMv3, pdf2image, and image_service all use `first_page=1, last_page=1`.
3. **No model retraining pipeline.** The IsolationForest was trained on 3 sample PDFs (see `ai_pipeline/sample_invoices/`). The `train_reference_model.py` script must be run manually.
4. **No email/SMS notifications.** No alerting when high-risk invoices are detected.
5. **No bulk processing.** One invoice at a time per request.
6. **Vendors are not user-scoped.** `GET /vendors/` returns all vendors from all users. Any authenticated user can see all registered vendors.
7. **No webhook/callback support.** Long-running analysis (20–90s) happens synchronously; no async job queue.
8. **Canadian banking validation is format-only.** `validate_account()` for `country == "CA"` always returns `{"valid": True}` ([bank_validation_service.py:71-75](backend/services/bank_validation_service.py#L71)).
9. **No currency conversion or amount normalization.** Amounts stored as raw strings from LLM/regex.
10. **No KYC, AML, or sanctions screening.** No integration with compliance databases.
11. **No GDPR data subject request handling.** Account deletion exists but no export/portability.
12. **No audit trail.** Financial verification decisions are written to `analysis_results` but there is no immutable, append-only audit log.

### Hard Scaling Limits

- **Single Uvicorn worker** — one slow analysis blocks all other requests
- **Ollama `num_thread: 8`** — limits parallelism within a single LLM request
- **No connection pooling beyond SQLAlchemy defaults** (pool_size=5)
- **File storage on local disk** — no distributed storage (S3, GCS)
- **No horizontal scaling** — no load balancer, no session store (cookies are stateless but single-origin)

### What Will Crash or Produce Wrong Results

- Invoices in non-English languages — Tesseract defaults to English, LLM may hallucinate
- PDFs with only scanned images (no text layer) — `extract_pdf_content` returns empty string; LLM gets no text
- Invoices with amounts in non-Western formats (e.g., "1.000,00" European style) — `_parse_amount` will fail
- Very large PDFs (>100 pages) — no page limit guard; memory exhaustion possible
- Binary or encrypted PDFs — PyPDF2 raises exception, silently swallowed at [invoice.py:642](backend/routers/invoice.py#L642)

---

## 7. EVERY BREAKPOINT AND FAILURE MODE

### Silent Failures (Swallowed Exceptions)

| Location | Code | What Is Hidden |
|----------|------|----------------|
| [invoice.py:642](backend/routers/invoice.py#L642) | `except Exception: pass` | Text extraction failure. Analysis continues with `extracted_text=""` |
| [image_extractor.py:76-78](backend/extraction/image_extractor.py#L76) | `except Exception: return []` | Layout detection failure returns empty layout silently |
| [image_extractor.py:112-114](backend/extraction/image_extractor.py#L112) | `except Exception: continue` | Per-table OCR failure silently skipped |
| [rules_service.py:65-69](backend/services/rules_service.py#L65) | `except Exception: text_parts.append("")` | Per-page PDF extraction failure swallowed |
| [invoice.py:761-767](backend/routers/invoice.py#L761) | `except Exception as exc: rules_result = {"status": "error", ...}` | Rules failure returned as structured error (better, but logged nowhere) |
| [semantic_extraction_service.py:194-198](backend/services/semantic_extraction_service.py#L194) | `except Exception as exc: print(...); return result` | Ollama connection failure returns all-null extraction |
| [forensics_service.py] | Multiple try/except blocks | Various forensic signal failures return 0.0 |

### Critical Logic Bug: Signature Verifier Accepts All Self-Signed Certs as Valid

([signature_verifier.py:38-49](backend/integrity/signature_verifier.py#L38)):
```python
except Exception as e:
    # Self-signed or untrusted certs land here
    cert = sig.signer_cert
    fingerprint = cert.sha256.hex() if cert else None
    return {
        "valid": True,       # ← ALWAYS TRUE on exception
        "trusted": False,
        "intact": True,      # ← ASSUMED INTACT, NOT VERIFIED
        "fingerprint": fingerprint,
        "reason": "self_signed_or_untrusted"
    }
```
**Any exception during signature validation** (network error, malformed cert, invalid PDF) returns `valid=True`, `intact=True`. A fraudulent signature that triggers a parsing error will be reported as valid.

### Ollama Down

1. `_session.post()` throws `ConnectionError` or `Timeout` ([semantic_extraction_service.py:194-198](backend/services/semantic_extraction_service.py#L194))
2. Exception caught, `print("❌ OLLAMA CONNECTION FAILED:", exc)` to stdout
3. Returns empty extraction (all null fields)
4. Analysis continues — vendor bank verification returns "vendor_unknown", AI anomaly pipeline still runs
5. **No error returned to user** — analysis appears successful but all semantic fields are null

### High Load

With a single Uvicorn worker and no async task queue, concurrent analysis requests queue on the Python event loop. A single 60-second Ollama call effectively locks all other requests. FastAPI is ASGI but the Ollama call and LayoutLMv3 inference are synchronous blocking — they block the event loop thread.

### Malformed Input

- **Corrupt PDF:** PyPDF2 may raise `PdfReadError`, caught at [invoice.py:642](backend/routers/invoice.py#L642), text set to `""`
- **Zero-byte file:** Caught at [invoice.py:554-555](backend/routers/invoice.py#L554)
- **PDF with embedded JavaScript/macros:** Not detected, passed to PyPDF2 and pdf2image
- **Extremely large file:** No size limit. A 1GB PDF is accepted, read fully into memory, written to disk
- **ZIP bomb disguised as JPEG:** MIME type checked by client Content-Type header, not by magic bytes

### Race Conditions

- **Session race:** `request.session.clear()` then `request.session["user_id"] = user.id` in login ([login.py:25-26](backend/routers/auth/login.py#L25)) — not truly atomic, but mitigated by cookie being single-request
- **get_current_user opens its own DB session** ([dependencies.py:17-23](backend/dependencies.py#L17)): creates a `SessionLocal()` that is separate from the `Session = Depends(get_db)` session. Same request may use two separate DB connections.

### Hardcoded Values That Break in Different Environments

| Location | Hardcoded Value | Impact |
|----------|----------------|--------|
| [main.py:73](backend/main.py#L73) | `allow_origins=["http://localhost:3000"]` | CORS blocked if frontend on different host/port |
| [main.py:68](backend/main.py#L68) | `https_only=False` | Sessions not secure in production |
| [bank_utils.py:7](backend/services/bank_utils.py#L7) | `BANK_HASH_SECRET = os.getenv("BANK_HASH_SECRET", "dev-bank-secret")` | HMAC secret defaults to `"dev-bank-secret"` — not in `.env` |
| [main.py:66](backend/main.py#L66) | `SESSION_SECRET` defaults to `"dev-secret-change-me"` | Weak session signing |
| [analysis_service.py:23](backend/services/analysis_service.py#L23) | `"brew install tesseract"` in error message | macOS-specific developer message |
| [docker-compose.yml:30](docker-compose.yml#L30) | `NEXT_PUBLIC_API_BASE_URL: http://localhost:8000` | Frontend cannot reach backend if on different host |
| [vendor.py:36](backend/routers/vendor.py#L36) | `DEV_MODE_OVERRIDE_BANK` | Production accounts can be overridden |
| [risk_policy.py:3-4](ai_pipeline/interpretation/risk_policy.py#L3) | `LOW_RISK = 0.4`, `HIGH_RISK = 0.7` | Risk thresholds not configurable |

### Timeout Configurations

| Timeout | Value | Location |
|---------|-------|----------|
| Ollama LLM call | 120 seconds | [semantic_extraction_service.py:134](backend/services/semantic_extraction_service.py#L134) |
| Plaid API call | 15 seconds | [plaid_service.py:113](backend/services/plaid_service.py#L113) |
| OpenIBAN API call | 5 seconds | [iban_registry_service.py:24](backend/services/iban_registry_service.py#L24) |
| DB connection pool | SQLAlchemy default (30s checkout timeout) | [conn_db.py:24](backend/conn_db.py#L24) |
| FastAPI request | No timeout configured | — |

### What Has No Error Handling At All

- `extract_pdf_content` ([pdf_extractor.py:4-18](backend/extraction/pdf_extractor.py#L4)): no try/except around `PdfReader()` or page iteration — any corrupt PDF raises unhandled exception
- `LayoutLMv3Model.from_pretrained()` and `LayoutLMv3Processor.from_pretrained()` ([layoutlm_features.py:11-18](ai_pipeline/advanced/layoutlm_features.py#L11)): no error handling — HuggingFace download failure crashes the import
- `pickle.load(f)` ([analysis_service.py:44-45](backend/services/analysis_service.py#L44)): no error handling for malformed pickle file

---

## 8. CODE QUALITY SNAPSHOT

### Dead Code

| Item | File | Notes |
|------|------|-------|
| `baseline/` directory | `ai_pipeline/baseline/` | 4 files (explain.py, features.py, pipeline.py, run_pipeline.py) — no import or call from production code |
| `ai_pipeline/utils/visualize.py` | — | Visualization utility, not imported anywhere |
| `ai_pipeline/deployment/analyze_invoice.py` | — | Standalone script, not used by backend |
| `ai_pipeline/invoice_gen.py` | — | Invoice generator, not imported by backend |
| `backend/integrity/crypto_verifier.py` | — | File exists, not imported anywhere |
| `backend/integrity/hash_utils.py` | — | File exists, not imported anywhere |
| `backend/services/auth_service.py` | — | Top-level auth_service.py exists; services are in `services/auth/` subdirectory |
| `backend/utils/bank_hashing.py` | — | Only re-exports from `services/bank_utils.py`; not imported by production code |
| `_ = invoice_currency` | [invoice.py:353](backend/routers/invoice.py#L353) | Currency variable fetched and immediately discarded |
| `run_pipeline_layoutlm.py` | `ai_pipeline/advanced/` | Standalone script, not imported |

### Duplicated Logic

| Duplication | Location |
|-------------|----------|
| `_validate_us_routing_checksum()` | Implemented in both `services/bank_utils.py:44` and `services/bank_validation_service.py:32` |
| `get_db()` | Defined in both `conn_db.py:39` and `dependencies.py:5` — both imported |
| Text extraction called twice | Upload ([invoice.py:567-570](backend/routers/invoice.py#L567)) and analyze ([invoice.py:634-643](backend/routers/invoice.py#L634)) both call `extract_pdf_content()` on the same file |
| Signature verification called twice | Upload and analyze both call `evaluate_integrity()` |
| `detect_account_type()` called twice | [invoice.py:692](backend/routers/invoice.py#L692) and [invoice.py:708](backend/routers/invoice.py#L708) back-to-back |

### Type Safety

- Python 3.11 union types used (`str | None`) throughout — good
- No `mypy` configuration present
- Pydantic v2 used for request validation — good
- Response models not used on most endpoints (raw `dict` returns) — no response validation
- JSON columns in DB (`crypto_json`, `ai_json`, `rules_json`, `semantic_json`) have no schema validation
- `payload: dict` as parameter type in `register_vendor_bank_binding` ([vendor.py:177](backend/routers/vendor.py#L177)) — unvalidated raw dict

### Test Coverage

- **1 test file total:** `ai_pipeline/tests/test_layoutlm.py` — not a proper test, just prints embedding shape
- **No pytest/unittest tests** for any backend router, service, or utility
- **No frontend tests** (no jest, no playwright, no vitest configured)
- **0% coverage** on all authentication, invoice processing, vendor matching, forensics, and rules logic
- No test fixtures, no mocks, no CI test runner

### Logging

What IS logged:
- `print("========== DB CONFIG ==========")` + DB host/name on startup ([main.py:33-36](backend/main.py#L33))
- `print("DATABASE_URL=...")` on startup ([main.py:84](backend/main.py#L84))
- `print("DB_HOST=...")` on startup ([main.py:85](backend/main.py#L85))
- `print("================= LLM DEBUG =================")` + model name + text preview on every LLM call ([semantic_extraction_service.py:169-172](backend/services/semantic_extraction_service.py#L169))
- `print("SENDING REQUEST TO:", OLLAMA_URL)` on every LLM call ([semantic_extraction_service.py:192](backend/services/semantic_extraction_service.py#L192))
- `print("STATUS CODE:", ...)` on every LLM call ([semantic_extraction_service.py:200](backend/services/semantic_extraction_service.py#L200))
- `print("RESPONSE TYPE/CONTENT:", ...)` on every LLM call ([semantic_extraction_service.py:209-210](backend/services/semantic_extraction_service.py#L209))
- `print("FINAL EXTRACTED FIELDS:", ...)` on every LLM call ([semantic_extraction_service.py:269](backend/services/semantic_extraction_service.py#L269))
- `print("RAW ROUTING/ACCOUNT/INSTITUTION/TRANSIT/MERGED:", ...)` on every analysis ([invoice.py:686-690](backend/routers/invoice.py#L686))
- `print("⚠️ Invalid bank format:", ...)` on every analysis ([invoice.py:706](backend/routers/invoice.py#L706))
- `print("====== VERIFY DEBUG ======")` + normalized accounts + hashes on every bank verification ([vendor_bank_service.py:109-121](backend/integrity/vendor_bank_service.py#L109))
- `print("⚠️ DEV MODE: Overriding Plaid account...")` ([vendor.py:347](backend/routers/vendor.py#L347))
- `print("🚀 PLAID STORED ACCOUNT:")` + routing + account + normalized ([vendor.py:358-361](backend/routers/vendor.py#L358))
- `print("🧪 MATCHING INVOICE INPUT:", ...)` twice in Plaid exchange ([vendor.py:382](backend/routers/vendor.py#L382), [vendor.py:409](backend/routers/vendor.py#L409))
- `logger.warning(...)` in ai_artifact_service.py and highlight_service.py (proper structured logging)
- `logger.getLogger("veripay.forensics")` in forensics_service.py (proper)

What is NOT logged:
- Authentication events (logins, failures, logouts)
- File upload events
- Analysis decisions (risk levels, review flags)
- Vendor registration events
- Bank binding events
- Any HTTP request/response logging
- Any errors that get swallowed by bare `except Exception: pass`

### Input Validation

Validated:
- Password strength (8+ chars, upper, lower, digit, special) — [password_validator.py](backend/utils/password_validator.py)
- File MIME type (4 types accepted) — [invoice.py:547-548](backend/routers/invoice.py#L547)
- Empty file check — [invoice.py:554-555](backend/routers/invoice.py#L554)
- Account identifier format (IBAN mod-97, US routing checksum) — [bank_validation_service.py](backend/services/bank_validation_service.py)
- Pydantic schemas on auth endpoints

Not validated:
- File size (no limit)
- File magic bytes (content not verified against declared MIME type)
- PDF page count (no limit)
- Invoice filename length or characters
- Vendor name length or characters
- `payload: dict` body in `register_vendor_bank_binding` — any JSON accepted
- LLM output schema (only parsed as JSON; values not range-checked)
- `security_answer` strength (accepts single character)

### Secrets in the Codebase

| Secret | Location | Value | Exposure |
|--------|----------|-------|----------|
| Supabase DB password | [backend/.env:1](backend/.env#L1) | `veripay!1234567890` | Local file (in .gitignore) |
| Supabase DB URL with credentials | [backend/.env:1](backend/.env#L1) | Full connection string | Local file |
| Plaid Client ID | [backend/.env:10](backend/.env#L10) | `69af30a9dce634000d97f386` | Local file; Sandbox env |
| Plaid Secret | [backend/.env:11](backend/.env#L11) | `41f50f38c22f385696df6a10f57b71` | Local file; Sandbox env |
| Session secret | [backend/.env:8](backend/.env#L8) | `dev-secret-change-me` | Weak hardcoded default |
| BANK_HASH_SECRET | Not in .env | Default: `"dev-bank-secret"` | Hardcoded in [bank_utils.py:7](backend/services/bank_utils.py#L7) |

Note: `.gitignore` correctly excludes `backend/.env`, so these are NOT in version control. `BANK_HASH_SECRET` is not in `.env` at all — the default `"dev-bank-secret"` is always used.

### TODO/FIXME/HACK Comments (All of Them)

| File:Line | Comment |
|-----------|---------|
| [models/invoice.py:12](backend/models/invoice.py#L12) | `# 🔥 ADD THIS` — comment on user_id FK (leftover from when it was added) |
| [models/invoice.py:34](backend/models/invoice.py#L34) | `# 🔥 relationship` — comment on vendor relationship |
| [main.py:46](backend/main.py#L46) | `# STATIC FILE SERVING (🔥 CRITICAL FIX)` — leftover urgency comment |
| [main.py:68](backend/main.py#L68) | `# change to True in production` — `https_only=False` acknowledged |
| [dashboard.py:133](backend/routers/dashboard.py#L133) | `# 🔥 THIS IS KEY` — comment on user_id filter |
| [dashboard.py:163](backend/routers/dashboard.py#L163) | `# 🔥 Base query (ONLY current user)` |
| [stats.py:23](backend/routers/stats.py#L23) | `"fraud_signals": 0  # temporary` — placeholder hardcoded |
| [vendor.py:343-345](backend/routers/vendor.py#L343) | `# Plaid sandbox uses fixed test accounts like: ...` |
| [bank_validation_service.py:71](backend/services/bank_validation_service.py#L71) | `# For now: basic structure already validated` — CA validation is a stub |
| [iban_registry_service.py:20](backend/services/iban_registry_service.py#L20) | `# Example free API (can swap later)` |
| [iban_registry_service.py:20](backend/services/iban_registry_service.py#L20) | `# (no key required)` |

### Code Organization

- Reasonably structured: routers → services → utils hierarchy
- `services/auth/` split duplicated with top-level `services/auth_service.py`
- `backend/utils/bank_hashing.py` is a thin re-export of `services/bank_utils.py`
- `ai_pipeline/` is a separate module with its own structure, accessed by path manipulation (`sys.path.append`) in `analysis_service.py`
- `baseline/` directory in `ai_pipeline/` is dead code from an earlier version
- `.DS_Store` files committed in `backend/services/`, `frontend/src/`, `frontend/public/`

---

## 9. COMPLETE DEPENDENCY LIST

### Backend Python (from requirements.txt — UTF-16 encoded)

| Package | Pinned Version | Notes |
|---------|---------------|-------|
| annotated-doc | 0.0.4 | Obscure package, minimal use |
| annotated-types | 0.7.0 | |
| anyio | 4.12.1 | |
| asn1crypto | 1.5.1 | |
| bcrypt | 5.0.0 | |
| certifi | 2026.1.4 | |
| cffi | 2.0.0 | |
| charset-normalizer | 3.4.4 | |
| click | 8.3.1 | |
| colorama | 0.4.6 | |
| cryptography | 46.0.3 | Heavy C extension |
| email-validator | >=2.0.0 | **Unpinned minor/patch** |
| fastapi | 0.128.0 | |
| greenlet | 3.3.0 | |
| h11 | 0.16.0 | |
| idna | 3.11 | |
| itsdangerous | 2.1.2 | Session signing |
| lxml | 6.0.2 | |
| matplotlib | 3.9.2 | Dev/training only, loaded in production |
| numpy | 1.26.4 | |
| oscrypto | 1.3.0 | |
| packaging | 25.0 | |
| pdf2image | 1.17.0 | |
| pdfplumber | unpinned | **No version pinned** |
| Pillow | 12.1.0 | |
| psycopg2-binary | 2.9.11 | |
| pycparser | 2.23 | |
| pydantic | 2.12.5 | |
| pydantic_core | 2.41.5 | |
| pyHanko | 0.32.0 | |
| pyhanko-certvalidator | 0.29.0 | |
| pymupdf | unpinned | **No version pinned** |
| PyPDF2 | 3.0.1 | **Deprecated** — maintainers recommend pypdf |
| pytesseract | 0.3.13 | |
| python-dotenv | 1.2.1 | |
| python-multipart | 0.0.21 | |
| PyYAML | 6.0.3 | |
| requests | 2.32.5 | |
| scikit-learn | 1.5.2 | |
| SQLAlchemy | 2.0.45 | |
| starlette | 0.50.0 | |
| torch | 2.3.1 | **~2GB install, CPU-only if no CUDA** |
| torchvision | 0.18.1 | |
| transformers | 4.48.0 | **~500MB install** |
| typing-inspection | 0.4.2 | |
| typing_extensions | 4.15.0 | |
| tzdata | 2025.3 | |
| tzlocal | 5.3.1 | |
| uritools | 6.0.1 | |
| urllib3 | 2.6.3 | |
| uvicorn | 0.40.0 | |
| layoutparser | unpinned | **No version pinned; supply chain risk** |
| layoutparser[layoutmodels] | unpinned | **No version pinned** |
| opencv-python | unpinned | **No version pinned** |
| alembic | unpinned | **No version pinned** |

**Critical notes:**
- `requirements.txt` is **UTF-16 encoded** — requires `iconv` workaround in Dockerfile to install
- `PyPDF2` is deprecated (superseded by `pypdf`)
- `torch==2.3.1` installs ~2GB on Linux (CPU version); GPU version larger
- `layoutparser`, `opencv-python`, `alembic`, `pdfplumber`, `pymupdf` have **no version pins** — supply chain risk
- `matplotlib` has no use in production backend — carried over from training scripts
- `BANK_HASH_SECRET` not in `.env` — using default `"dev-bank-secret"`

### Frontend Node.js

| Package | Version |
|---------|---------|
| next | 16.1.4 |
| react | 19.2.3 |
| react-dom | 19.2.3 |
| @radix-ui/react-avatar | ^1.1.11 |
| @radix-ui/react-dialog | ^1.1.15 |
| @radix-ui/react-dropdown-menu | ^2.1.16 |
| @radix-ui/react-label | ^2.1.8 |
| @radix-ui/react-progress | ^1.1.8 |
| @radix-ui/react-select | ^2.2.6 |
| @radix-ui/react-separator | ^1.1.8 |
| @radix-ui/react-slot | ^1.2.4 |
| @radix-ui/react-switch | ^1.2.6 |
| @radix-ui/react-toast | ^1.2.15 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| framer-motion | ^12.34.3 |
| lucide-react | ^0.563.0 |
| next-themes | ^0.4.6 |
| tailwind-merge | ^3.4.0 |
| tailwindcss-animate | ^1.0.7 |

### External Models

| Model | Source | Size | Version |
|-------|--------|------|---------|
| qwen2.5:3b | Ollama Registry | ~2GB | Latest at pull time (unpinned) |
| microsoft/layoutlmv3-base | HuggingFace Hub | ~350MB | `from_pretrained` (unpinned) |
| Tesseract OCR | System package | ~30MB | Whatever apt installs |
| PubLayNet layout model | layoutparser CDN | ~100MB | `lp://PubLayNet/faster_rcnn_R_50_FPN_3x/config` |

### Saved Model Files

| File | Size | Description |
|------|------|-------------|
| `ai_pipeline/saved_models/anomaly_model.pkl` | Small | IsolationForest trained on 3 sample PDFs |
| `ai_pipeline/saved_models/embedding_stats.json` | 62KB | 768-dim centroid + distance stats from training |

The centroid in `embedding_stats.json` has `mean_distance: 3.35`, `std_distance: 1.69`, `max_distance: 8.28` — computed from the 3 sample PDFs in `ai_pipeline/sample_invoices/`.

---

## 10. INFRASTRUCTURE AND DEPLOYMENT STATE

### Current Deployment

Docker Compose on a single host machine. Four services:

| Service | Image | Port | Notes |
|---------|-------|------|-------|
| veripay-backend | Custom (python:3.11-slim) | 8000 | Uvicorn + FastAPI |
| veripay-frontend | Custom (node:20-bookworm-slim) | 3000 | Next.js dev server |
| veripay_ollama | ollama/ollama:latest | 11434 | LLM inference server |
| ollama_init | ollama/ollama:latest | N/A | One-shot: pulls qwen2.5:3b |

### Docker Analysis

**backend/Dockerfile:**
```dockerfile
FROM python:3.11-slim
RUN apt-get install build-essential libgl1 libglib2.0-0 poppler-utils tesseract-ocr
RUN iconv -f UTF-16 -t UTF-8 /tmp/requirements.txt | tr -d '\r' > /tmp/requirements.utf8.txt
    && pip install --upgrade pip && pip install -r /tmp/requirements.utf8.txt
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Issues:
- `build-essential` included (GCC, make, etc.) — unnecessary in production, inflates image size significantly
- Running as `root` — no `USER` directive
- `pip install --upgrade pip` in build step — may pull incompatible pip version
- `iconv` workaround required because `requirements.txt` is UTF-16 encoded (Windows encoding artifact)
- No `HEALTHCHECK` instruction
- `COPY . .` not used — instead docker-compose mounts `./backend:/app/backend` as a volume, so the COPY in Dockerfile is overridden at runtime

**docker-compose.yml critical issues:**
```yaml
command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload  # dev mode
volumes:
  - ./backend:/app/backend   # source code writable in container
```
- `--reload` flag: watches files and auto-restarts — development mode only
- Source volumes mounted: any code change on host immediately takes effect in container
- `env_file: backend/.env` loads credentials into container environment

**frontend/Dockerfile:**
```dockerfile
FROM node:20-bookworm-slim
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
```
- Runs Next.js **development server** (`npm run dev`) — not a production build
- `COPY . .` copies entire frontend directory including potential `.next/` cache

**Ollama:**
- `ollama/ollama:latest` — unpinned version, may break on update
- `ollama_init` depends on `ollama` with `service_started` (not `service_healthy`) — race condition: Ollama server may not be accepting connections when init runs
- `init_ollama_model.sh` polls `ollama list` every 2 seconds until it responds, then pulls `qwen2.5:3b`
- `ollama_data` volume persists model across restarts

### CI/CD

**None.** No `.github/workflows/`, no `Jenkinsfile`, no `gitlab-ci.yml`, no `Makefile` with test targets. No automated testing, building, or deployment.

### Health Checks

None defined in any Dockerfile or docker-compose.yml.

### Monitoring and Alerting

None. No Prometheus, no Grafana, no Sentry, no Datadog, no CloudWatch.

### Backup Strategy

None. The Supabase database is managed by Supabase (has its own backup schedule). Local invoice files in `backend/invoices/` are not backed up. Pickle model files are not backed up.

### SSL/TLS

- `https_only=False` in SessionMiddleware ([main.py:68](backend/main.py#L68))
- No TLS termination visible in docker-compose (no nginx, no Traefik)
- `NEXT_PUBLIC_API_BASE_URL: http://localhost:8000` — plain HTTP
- Supabase connection uses `sslmode=require` ([conn_db.py:19-23](backend/conn_db.py#L19)) — DB traffic is encrypted

---

## 11. SECURITY SNAPSHOT

### Authentication Mechanism

Server-side session via signed cookies. Cookie contains `{"user_id": int}` signed with `SESSION_SECRET`. The default secret is `"dev-secret-change-me"`. Cookie is `SameSite=lax`, `https_only=False`. No expiry/max_age configured — sessions last until browser closes (or cookie cleared).

### Authorization

Flat: authenticated = authorized. Exceptions:
- Invoices are user-scoped (filtered by `user_id`) ✓
- Vendors are **NOT** user-scoped — all authenticated users see all vendors ✗
- Bank bindings accessible by any authenticated user with a vendor_id ✗
- No roles, no permissions, no resource ownership on vendors/bindings

### API Security

- **No rate limiting** anywhere — login, password reset, file upload, LLM calls are all unlimited
- **No CSRF protection** explicit — relies on `SameSite=lax` (sufficient for most cases, but not all)
- **No API key auth** — only session cookies
- **`GET /stats/landing`** requires no authentication — exposes aggregate counts

### Data Encryption

- **At rest:** No application-level encryption. Database managed by Supabase (encrypted at rest by provider). Local invoice files stored unencrypted.
- **In transit:** DB connection: `sslmode=require` ✓. App-to-browser: HTTP (no TLS). App-to-Ollama: HTTP over Docker network. App-to-Plaid: HTTPS ✓. App-to-openiban.com: HTTPS ✓.

### Injection Protection

| Type | Status | Notes |
|------|--------|-------|
| SQL injection | Protected | SQLAlchemy ORM with parameterized queries |
| XSS | Partial | Next.js escapes JSX by default; no CSP header |
| CSRF | Partial | SameSite=lax; no explicit CSRF token |
| Command injection | Protected | No shell=True subprocess calls visible |
| Path traversal | Present risk | `file_path` stored as absolute path; not web-accessible directly |
| Pickle deserialization RCE | **Present** | `pickle.load(f)` on `anomaly_model.pkl` ([analysis_service.py:44-45](backend/services/analysis_service.py#L44)) |

### File Upload Security

| Check | Status |
|-------|--------|
| MIME type validation | Present (4 types) |
| Magic bytes validation | **Missing** |
| File size limit | **Missing** |
| Antivirus scanning | **Missing** |
| Decompression bomb protection | **Missing** (`Image.MAX_IMAGE_PIXELS` not set) |
| PDF bomb protection | **Missing** (no page count limit) |
| Executable detection | **Missing** |
| Storage outside webroot | **Mixed** — files in `backend/invoices/` (not directly served), but `backend/uploads/rendered/` IS served via `/rendered/*` static route |

### Session Management

- Stateless signed cookie (no server-side session store)
- No session expiry configured
- Logout: `request.session.clear()` clears cookie value, but old signed cookie is technically valid until it expires (no expiry configured → never expires per cookie spec)
- Login: `request.session.clear()` then set — old session invalidated by clearing cookie content
- No concurrent session limit

### CORS Configuration

```python
CORSMiddleware(
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
- Hardcoded to `localhost:3000` only
- `allow_credentials=True` with specific origin — correct pattern
- `allow_methods=["*"]` and `allow_headers=["*"]` — permissive

### Security Headers

No security headers configured beyond what FastAPI provides by default:
- No `Content-Security-Policy`
- No `X-Frame-Options`
- No `X-Content-Type-Options`
- No `Strict-Transport-Security`
- No `Referrer-Policy`
- No `Permissions-Policy`

---

## 12. NETWORK AND INTEGRATION MAP

### External Services Called by VeriPay

| Service | URL | Auth | Called From | On Failure |
|---------|-----|------|-------------|-----------|
| Supabase PostgreSQL | `aws-1-ca-central-1.pooler.supabase.com:6543` | DB password | All DB operations | Exception → 500 |
| Ollama | `http://ollama:11434/api/generate` | None | `semantic_extraction_service.py` | Silent empty extraction |
| Plaid API | `https://sandbox.plaid.com` | Client ID + Secret | `plaid_service.py` | Mock fallback if `OPEN_BANKING_FALLBACK_TO_MOCK=true` |
| openiban.com | `https://openiban.com/validate/{iban}` | None (free) | `iban_registry_service.py` | `{"success": False, "reason": "..."}` |
| HuggingFace Hub | `https://huggingface.co` | None (public model) | `layoutlm_features.py` at import | Import failure, crashes service |

### Internal Network (Docker)

| Connection | Protocol | Port |
|-----------|---------|------|
| Browser → Frontend | HTTP | 3000 |
| Browser → Backend | HTTP | 8000 |
| Backend → Ollama | HTTP | 11434 |
| ollama_init → Ollama | HTTP | 11434 |
| All containers → Supabase | PostgreSQL/SSL | 6543 |

All containers share a Docker Compose default network. Ollama port 11434 is exposed to host.

### DNS and Domain Configuration

No custom domain configured. All services run on `localhost`. No reverse proxy, no TLS termination.

---

## 13. SUMMARY TABLE

| Area | Status | Severity | Key Details |
|------|--------|----------|-------------|
| **Project Identity** | Documented | — | Invoice fraud detection + bank account verification platform |
| **Architecture** | Functional but fragile | Medium | Single-process, single-worker, no queue, no LB |
| **Database** | Working | Medium | No migrations dir; tables auto-created; no composite indexes; no soft delete |
| **Authentication** | Working but weak | High | Session cookie, no expiry, no rate limiting, weak default secret |
| **Authorization** | Incomplete | High | Vendors are global, not user-scoped; no roles |
| **AI/ML Pipeline (Ollama)** | Working | Medium | Silent failure when down; 120s timeout blocks event loop |
| **AI/ML Pipeline (LayoutLMv3)** | Working (PDF only) | Medium | Trained on 3 invoices; pickle deserialization; PDF only |
| **Forensics** | Working | Low | copy-move and DCT disabled (weight=0); calibration claims 1,323 invoices |
| **AI Artifact Detection** | Working | Low | Heuristic linguistic analysis only; no ground-truth calibration |
| **Bank Account Verification** | Working | Medium | BANK_HASH_SECRET uses hardcoded default; CA validation is a stub |
| **Plaid Integration** | Sandbox only | Medium | Mock fallback active; DEV_MODE_OVERRIDE_BANK in production code |
| **IBAN Verification** | Working | Low | Depends on free public API (openiban.com); no SLA |
| **PDF Signature Verification** | Buggy | **Critical** | Exceptions return `valid=True`; CRL/OCSP disabled |
| **File Upload** | Working but unsafe | **Critical** | No size limit; no magic bytes check; no antivirus |
| **Secrets Management** | Weak | **Critical** | BANK_HASH_SECRET missing from .env; SESSION_SECRET is dev default |
| **Logging** | Debug print spam | High | 15+ debug prints in production; no structured logging; no audit trail |
| **Error Handling** | Silent failures | High | `except Exception: pass` on text extraction; Ollama failure silent |
| **Rate Limiting** | None | **Critical** | Auth endpoints, LLM calls, file uploads all unprotected |
| **Input Validation** | Partial | High | No file size limit; no magic bytes; CA bank validation is stub |
| **Test Coverage** | ~0% | High | 1 non-test test file; no backend tests |
| **CORS** | Restrictive | Medium | Hardcoded `localhost:3000`; will break in deployment |
| **HTTPS/TLS** | None | **Critical** | `https_only=False`; plain HTTP in docker-compose |
| **Security Headers** | None | High | No CSP, no HSTS, no X-Frame-Options |
| **Pickle Deserialization** | Present | **Critical** | `pickle.load()` on model file with no integrity check |
| **Encryption at Rest** | None (app-level) | High | Invoice files unencrypted; PII in plaintext DB |
| **Docker Configuration** | Dev mode in production | High | `--reload`, source volume mounts, dev server for frontend |
| **CI/CD** | None | Medium | No automated testing, no deployment pipeline |
| **Monitoring** | None | High | No metrics, no alerting, no error tracking |
| **Dead Code** | Present | Low | baseline/, crypto_verifier.py, hash_utils.py, auth_service.py, etc. |
| **Dependencies** | 4 unpinned packages | Medium | layoutparser, opencv-python, alembic, pdfplumber unpinned |
| **Performance** | Blocking I/O | High | All ML inference synchronous, blocks event loop |
| **Vendor Scoping** | Missing | High | `GET /vendors/` returns all users' vendors |
| **Compliance** | Not addressed | High | No KYC, AML, GDPR, PCI-DSS implementation |
| **Audit Trail** | None | **Critical** | No immutable log of financial verification decisions |
