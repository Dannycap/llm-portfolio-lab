# LLM Portfolio Lab (with working Outlook page)

## 1) Backend (FastAPI)

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Mac/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 10000 --reload
```

Backend serves:
- `GET /api/portfolio-series`
- `GET /api/outlook` (reads `backend/outlook.json`)
- `GET /api/health`

## 2) Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

By default, `next.config.js` proxies `/api/*` to `http://localhost:10000`.

If your backend is on a different URL (Render, etc), set:

```bash
# Windows (PowerShell)
$env:NEXT_PUBLIC_API_BASE="https://YOUR-BACKEND-URL"
npm run dev

# Mac/Linux
NEXT_PUBLIC_API_BASE="https://YOUR-BACKEND-URL" npm run dev
```

Then open:
- Dashboard: `http://localhost:3000/`
- Holdings: `http://localhost:3000/holdings`
- Outlook: `http://localhost:3000/outlook`
