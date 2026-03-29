# VeriPay - macOS Run Guide

## Backend (FastAPI)
Go to Backend > .env
Update DB_USER= with your machine username

```bash
cd /Users/meetsolanki/Void/study_material/c4990/veripay/VeriPay/backend
python3 -m venv ../venv
source ../venv/bin/activate
pip install -r ../requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

## Frontend (Next.js)
```bash
cd /Users/meetsolanki/Void/study_material/c4990/veripay/VeriPay/frontend
npm install
npm run dev -- --hostname localhost --port 3000
```

## AI/Analysis System Dependencies
```bash
brew install tesseract poppler
```

## Open in Browser
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
