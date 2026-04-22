# VeriPay

## Short overview

**VeriPay** is a web application that helps organizations upload invoices (PDF or image files), extract key information using AI-assisted document understanding, and verify whether an invoice is trustworthy using anomaly detection, vendor validation, and document integrity checks.

It combines rule-based validation, LayoutLMv3-based document understanding, Isolation Forest anomaly detection, and optional LLM-assisted extraction via Ollama.

---

## Problem it solves

Manual invoice verification is:

* Slow
* Error-prone
* Vulnerable to fraud

VeriPay provides:

* Automated invoice analysis
* Vendor and bank verification
* Audit-ready tracking
* A structured review workflow

---

## Who this project is for

| Audience               | Why they use VeriPay              |
| ---------------------- | --------------------------------- |
| Developers / students  | Learn full-stack + AI integration |
| Finance teams          | Review invoices with risk signals |
| Security-focused teams | Detect fraud and anomalies        |

---

## Key features

* 🔐 User authentication (session-based)
* 📄 Invoice upload (PDF, PNG, JPG)
* 🧠 AI anomaly detection (Isolation Forest + LayoutLM)
* 🏦 Vendor + bank verification
* 📊 Dashboard with stats and recent invoices
* 📝 Human review system
* 📁 Audit logs
* 🤖 Optional LLM extraction via Ollama

---

## Tech stack

| Technology             | Role              |
| ---------------------- | ----------------- |
| Next.js / React        | Frontend          |
| TypeScript             | Frontend typing   |
| Tailwind CSS           | UI styling        |
| FastAPI                | Backend API       |
| SQLAlchemy             | ORM               |
| PostgreSQL             | Database          |
| Alembic                | Migrations        |
| PyTorch / Transformers | AI models         |
| scikit-learn           | Anomaly detection |
| Ollama                 | Local LLM         |
| Docker Compose         | Full system setup |

---

## Project structure

```text
VeriPay/
├── backend/         # FastAPI backend
├── frontend/        # Next.js frontend
├── ai_pipeline/     # ML models
├── docker-compose.yml
└── README.md
```

---

## Installation guide (Docker)

### 1. Install Docker

Install **Docker Desktop** and ensure it is running.

---

### 2. Clone the repository

```bash
git clone https://github.com/VeriPay-Project/VeriPay.git
cd VeriPay
```

---

### 3. Run the project

```bash
docker compose up --build
```

This starts:

* Frontend → http://localhost:3000
* Backend → http://localhost:8000
* Ollama → http://localhost:11434

---

### 4. Open the app

```
http://localhost:3000
```

---

### 5. Stop the project

```bash
docker compose down
```

---

## How it works

1. User uploads invoice
2. Backend extracts text + layout
3. AI models analyze structure and anomalies
4. Vendor and bank validation runs
5. Results are stored and shown in dashboard

---

## API

Base URL:

```
http://localhost:8000
```

Interactive docs:

```
http://localhost:8000/docs
```

---

## Example workflow

1. Register or login
2. Create vendor
3. Upload invoice
4. Run analysis
5. Review results
6. Approve or escalate

---

## Database

* PostgreSQL stores:

  * Users
  * Invoices
  * Vendors
  * Analysis results
  * Audit logs

---

## Common issues

| Issue              | Fix                         |
| ------------------ | --------------------------- |
| Docker not running | Start Docker Desktop        |
| Slow first run     | Models are loading (normal) |
| API not responding | Check backend logs          |
| No data showing    | Ensure user is logged in    |

---

## Future improvements

* Advanced fraud scoring
* Real-time analytics
* Multi-tenant support
* Cloud deployment

---

## License

MIT License

---

## Contact

Maintained as part of a university capstone project.
