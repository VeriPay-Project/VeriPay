# VeriPay - Windows Run Guide

## Backend (FastAPI)
Go to Backend > .env
Update DB_USER= with your machine username

```powershell
cd C:\Users\meetsolanki\Void\study_material\c4990\veripay\VeriPay\backend
py -m venv ..\venv
..\venv\Scripts\activate
pip install -r ..\requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

## Frontend (Next.js)
```powershell
cd C:\Users\meetsolanki\Void\study_material\c4990\veripay\VeriPay\frontend
npm install
npm run dev -- --hostname localhost --port 3000
```

## AI/Analysis System Dependencies
Install:
- Tesseract OCR: https://github.com/UB-Mannheim/tesseract/wiki
- Poppler (Windows build): https://github.com/oschwartz10612/poppler-windows/releases/

Add both to PATH, then verify:
```powershell
tesseract --version
pdftoppm -h
```

## Open in Browser
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
