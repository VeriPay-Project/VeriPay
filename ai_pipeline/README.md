# AI-Assisted Invoice Integrity Verification Pipeline

This project implements an AI-assisted invoice verification system designed to detect
anomalous, manipulated, or AI-generated invoices and support issuer-payee binding
workflows.

The system combines:
- LayoutLMv3 document embeddings
- Unsupervised anomaly detection using Isolation Forest
- Explainable interpretation logic
- Deployment-ready single-invoice analysis

This repository focuses on the AI pipeline and interpretation layer of a larger secure
invoice verification system.

---

## Project Structure

```text
ai_pipeline/
├── advanced/       # LayoutLMv3-based AI pipeline
├── baseline/       # OCR + handcrafted feature baseline
├── deployment/     # Deployment-ready inference
├── interpretation/ # Explanation & risk logic
└── utils/          # Shared utilities
sample_invoices/    # Demo invoice dataset (PDFs)
saved_models/       # Trained models & statistics
tests/              # Model verification tests
```

## Environment Setup

Create a virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate
```

Install Python dependencies:

```bash
pip install torch torchvision transformers
pip install scikit-learn numpy pillow pytesseract pdf2image matplotlib
```

System dependencies (macOS):

```bash
brew install poppler tesseract
```

## Usage Workflow

Step 1: Verify LayoutLMv3 setup

Run the test script to ensure embeddings are generated correctly.

```bash
python tests/test_layoutlm.py
```

Expected result: embedding vector of size 768; no runtime errors.

Step 2: Batch anomaly detection (research mode)

Compare multiple invoices and rank them by anomaly score.

```bash
python -m advanced.run_pipeline_layoutlm
```

Step 3: Train reference model (deployment mode)

Extract embeddings and train the Isolation Forest detector.

```bash
python -m deployment.train_reference_model
```

Saves: anomaly_model.pkl and embedding_stats.json.

Step 4: Analyze a single invoice (final system mode)

Run a real-world analysis on a specific file.

```bash
python -m deployment.analyze_invoice sample_invoices/example_invoice.pdf
```

## Risk Interpretation Policy

| Score Range | Risk Level | Action |
| --- | --- | --- |
| < 0.4 | LOW | Auto-approve |
| 0.4 - 0.7 | MEDIUM | Manual review |
| >= 0.7 | HIGH | Investigate or block |

Note: risk thresholds are policy decisions, not AI decisions.

## Design and Methodology

### Explainability Design

Explanations are generated via:
- Embedding distance from a reference centroid
- Z-score deviation from known invoices
- Language templates mapped to deviation ranges

### Learning Paradigm

- Unsupervised learning: no fraud labels required
- Pattern recognition: model learns structural patterns rather than explicit fraud rules

### Academic Scope

This repository focuses on AI-assisted detection and the justification layer.
Cryptographic verification, Open Banking APIs, and dashboards are conceptually
integrated but outside the scope of this codebase.

## Optional Extensions

- Open Banking API integration (Plaid, Flinks, TrueLayer)
- Blockchain-based immutable audit logs
- Multi-tenant SaaS deployment
- Vendor-specific reference models
