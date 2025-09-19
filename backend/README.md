SENTINEL Backend (Railway)

Overview
- Node/Express service to power the front-end assistant and basic orchestration endpoints.
- Stubbed logic now; swap in your LLM/workflow engine and persistence later.

Endpoints
- GET /health: Service health.
- POST /api/assistant/message: Classifies intent and returns next-step UI instructions.
- POST /api/cases: Creates a queued case (in-memory for now).
- GET /api/cases/:id: Returns case by id.

Deploy on Railway
1) Create new service → Deploy from GitHub (this repo) → Set Service Root to backend/ (monorepo setting in Railway).
2) Ensure Node is detected (Nixpacks). Command will be `npm start` using package.json.
3) Add env vars (optional now):
   - ALLOWED_ORIGINS: e.g. https://your-site.netlify.app,https://yourdomain.com
   - ADMIN_EMAIL, WEBHOOK_URL (optional)
4) Deploy and note the public URL (e.g. https://sentinel-backend.up.railway.app).

Front-End Config
- Set window.ASSISTANT_API_BASE to your Railway URL in the site (see assets/js/assistant.js).
- The assistant widget calls POST {ASSISTANT_API_BASE}/api/assistant/message and POST {ASSISTANT_API_BASE}/api/cases.

Next Steps
- Replace in-memory stores with a database (Railway Postgres or Redis).
- Add auth for staff endpoints; restrict CORS to your domains.
- Integrate provider APIs (email, SMS, scheduling) and LLM for reasoning/routing.

