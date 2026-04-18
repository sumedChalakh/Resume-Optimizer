# ⚡ ATS Resume Optimizer

An AI-powered resume optimization web app built with Python (Flask) + Anthropic/OpenRouter.

## 📁 Project Structure

```
ats_optimizer/
├── app.py                  # Flask backend + AI APIs + DOCX export
├── requirements.txt        # Main dependency file
├── req.txt                 # Mirror dependency file (same content)
├── .env                    # Local API keys (not committed)
├── .env.example            # Safe template for env vars
├── templates/
│   └── index.html          # Main UI template
└── static/
    ├── css/style.css       # App styling
    └── js/main.js          # Frontend logic
```

## 🚀 Setup & Run (Local)

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

or

```bash
pip install -r req.txt
```

### 2. Configure API keys

Create `.env` in project root:

```bash
OPENROUTER_API_KEY_BACKUP=optional
GITHUB_PAT=optional
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=openrouter/auto
HUGGINGFACE_API_KEY=optional
HUGGINGFACE_API_KEY_BACKUP=optional
ANTHROPIC_API_KEY=optional
```

Priority used by app:
- Uses `OPENROUTER_API_KEY_BACKUP` first (if configured)
- Then uses `GITHUB_PAT` (GitHub Models)
- Then uses `OPENROUTER_API_KEY`
- Then uses `HUGGINGFACE_API_KEY`
- Then uses `HUGGINGFACE_API_KEY_BACKUP`
- Uses `ANTHROPIC_API_KEY` last (if configured)

### 3. Run the app
```bash
python app.py
```

### 4. Open in browser
Visit: http://localhost:5000

## 🌐 Deploy As A Real Website (Render)

Use this once, then your app can run online continuously.

### 1. Push project to GitHub
```bash
git init
git add .
git commit -m "deploy setup"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Create a Render Web Service
- Go to https://render.com
- New + -> Web Service -> Connect your GitHub repo
- Build Command:
```bash
pip install -r requirements.txt
```
- Start Command:
```bash
gunicorn app:app
```

### 3. Add Environment Variables in Render
Add the same keys you use in `.env`:
- `OPENROUTER_API_KEY_BACKUP`
- `GITHUB_PAT`
- `OPENROUTER_API_KEY`
- `HUGGINGFACE_API_KEY`
- `HUGGINGFACE_API_KEY_BACKUP`
- `ANTHROPIC_API_KEY` (optional)
- `FLASK_DEBUG=0`
- `TRACKER_DB_PATH=/var/data/tracker.db` (recommended for persistence)

### 4. Deploy
- Click Deploy.
- Render gives you a public URL like `https://your-app.onrender.com`.
- You can open that URL anytime without running VS Code.

### 5. Update Later Only When Needed
- Make code changes locally.
- Commit + push to GitHub.
- Render auto-redeploys.

## 📤 Resume Upload

You can now upload resume files directly in the Resume panel:
- PDF (`.pdf`)
- DOCX (`.docx`)
- TXT (`.txt`)

Note: `.doc` option is shown in picker, but backend supports modern formats (`.docx/.pdf/.txt`) for reliable parsing.

## 🧭 Application Tracker (Phase 1 + Phase 2 + Phase 3)

Tracker routes:
- Board UI: /tracker
- API list/create/update/delete: /tracker/api/applications
- Auto-ingest endpoint (extension): /tracker/api/ingest
- Flow chart data API: /tracker/api/flow
- Health API (phase + features): /tracker/api/health

**Database Support:**
- SQLite only (local and deployed)
- Uses `TRACKER_DB_PATH` when configured, otherwise defaults to `data/tracker.db`

Phase 2 auto-add uses a browser extension (LinkedIn + major ATS):
- Extension source folder: `browser_extension/`
- Configure in `.env`:
    - TRACKER_EXTENSION_TOKEN
    - TRACKER_INGEST_CORS_ORIGIN
    - TRACKER_INGEST_MIN_CONFIDENCE

Quick setup:
1. Set `TRACKER_EXTENSION_TOKEN` in your backend environment.
2. Load unpacked extension from `browser_extension` in Chrome/Brave.
3. In extension popup, set:
     - Tracker Base URL (local or deployed)
     - Ingest Token (same as backend token)
4. Apply on LinkedIn/Indeed/Naukri/Workday (or supported ATS page) and verify card appears in /tracker.

Phase 3 adds:
- Insights dashboard with conversion percentages, ghost rate, response/wait metrics
- Sankey flow chart with forward-only transitions
- Date range + source filters for board, metrics, and flow chart
- CSV/JSON export for currently filtered applications
- Source breakdown chips in Insights

Production note:
- Use a persistent DB path via `TRACKER_DB_PATH` on Render. Without persistent storage, tracker records can be lost after restarts/redeploys.

Detailed guide: `docs/TRACKER_PHASE2_EXTENSION.md`

## ✨ Features

- **ATS Score** — Visual score ring showing match percentage (0–100%)
- **Keyword Analysis** — Matched vs missing keywords from the JD
- **AI-Optimized Resume** — Rewritten bullet points with strong action verbs
- **Skills Regrouping** — Categorized and JD-prioritized skills
- **3 Improvement Suggestions** — Actionable tips to boost chances further
- **Export to .docx** — Download your optimized resume as a Word document
- **Copy to Clipboard** — Copy plain text version instantly
- **Resume Upload** — Extract and load text from PDF/DOCX/TXT
- **Hyperlinked DOCX Output** — Clickable email, LinkedIn, GitHub, and project links

## 🔧 Customization

- To change the AI model, edit `model=` in `app.py` (default: `claude-opus-4-5`)
- To change OpenRouter model, edit `OPENROUTER_MODEL` in `.env`
- To adjust max tokens, edit `max_tokens=` in `app.py`
- To change the port, set environment variable `PORT`

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| flask | Web framework |
| anthropic | Claude API client |
| python-docx | Word document export |
| pypdf | PDF text extraction for upload |
| python-dotenv | .env support for Flask runtime |
| gunicorn | Production web server for deployment |
