# ⚡ ATS Resume Optimizer

**Live Demo:** [https://resume-optimizer-jpz7.onrender.com/](https://resume-optimizer-jpz7.onrender.com/)

An advanced, AI-powered resume optimization web application built with Python (Flask). It leverages multiple AI providers (Anthropic, OpenRouter, HuggingFace, GitHub Models) to tailor resumes to specific Job Descriptions (JDs), maximizing ATS (Applicant Tracking System) compatibility. The project also features a comprehensive Application Tracker with a Kanban board, analytics, and a browser extension for 1-click tracking.

---

## ✨ Comprehensive Feature List

### 📝 Resume Optimization Engine
- **Multi-Format Resume Upload:** Extract and load text directly from PDF (`.pdf`), Word (`.docx`), and plain text (`.txt`).
- **Targeted AI Rewriting:** Rewrites bullet points with strong action verbs, quantifiable metrics, and seamless keyword integration based on the provided JD.
- **ATS Score Calculation:** Visual score ring showing match percentage (0–100%) broken down by keyword match, skills completeness, bullet quality, etc.
- **Keyword Analysis:** Compares matched vs. missing keywords from the JD.
- **Skills Regrouping:** Categorizes and prioritizes skills aligned with the target role.
- **Smart Formatting Output:**
  - **Export to `.docx`:** Download the optimized resume as a hyperlinked Word document.
  - **LaTeX to PDF Export:** Generate professional PDF resumes using LaTeX templates (`resume_template.tex` / `latex_resume.py`).
  - **Copy to Clipboard:** One-click copy plain text version.
- **Cover Letter Generation:** Automatically writes a targeted, ATS-friendly cover letter (max 4 paragraphs) customized to the company, role, and your top strengths.
- **3 Improvement Suggestions:** Actionable, personalized tips to further boost your chances.

### 🧭 Application Tracker (Phase 1, 2, & 3)
A fully-fledged applicant tracking CRM to manage your job hunt.
- **Phase 1 (Kanban Board):** Visual board (`/tracker`) with drag-and-drop columns (Wishlist, Applied, Interview, Offer, Rejected). SQLite-backed.
- **Phase 2 (Browser Extension):** Auto-ingest jobs directly from LinkedIn, Indeed, Naukri, and Workday using the unpacked extension in `browser_extension/`. Features 1-click saving via API.
- **Phase 3 (Insights Dashboard):** Advanced metrics including conversion percentages, ghost rates, and response times. Features a Sankey flow chart for application funnel visualization, source breakdowns, and CSV/JSON data export.

### 🤖 Robust Multi-Model AI API Fallback System
Ensures the app always works even if one API goes down or hits rate limits. Priority chain:
1. `OPENROUTER_API_KEY_BACKUP`
2. `GITHUB_PAT` (GitHub Models: `gpt-4o-mini`)
3. `OPENROUTER_API_KEY` (`deepseek/deepseek-r1:free` or fallback to `llama-3.3-70b-instruct`)
4. `HUGGINGFACE_API_KEY` (`meta-llama/Llama-3.1-8B-Instruct`)
5. `HUGGINGFACE_API_KEY_BACKUP`
6. `ANTHROPIC_API_KEY` (`claude-opus` or similar, if configured)

---

## 📁 Full Project Structure

```text
ats_optimizer/
├── app.py                  # Main Flask application, AI logic, DOCX/Text parsing
├── latex_resume.py         # Blueprint for generating LaTeX/PDF resumes
├── resume_template.tex     # LaTeX template for PDF generation
├── tracker/                # Application Tracker module & API blueprints
├── browser_extension/      # Chrome/Brave extension for 1-click job tracking
├── data/                   # SQLite database directory for the Tracker
├── docs/                   # Detailed documentation (Tracker Phase structures)
├── templates/              # HTML Templates (index.html, tracker_board.html, etc.)
├── static/                 # Static assets (CSS, JS)
├── clean.py / patch.py     # Utility scripts for codebase maintenance
├── requirements.txt        # Main dependency file
├── req.txt                 # Mirror dependency file
├── .env                    # Local API keys (not committed)
└── Procfile                # Render deployment configuration
```

---

## 🚀 Setup & Run (Local Development)

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Create a `.env` file in the project root:

```ini
# --- AI Providers (Configure at least one) ---
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_API_KEY_BACKUP=optional
GITHUB_PAT=optional
HUGGINGFACE_API_KEY=optional
HUGGINGFACE_API_KEY_BACKUP=optional
ANTHROPIC_API_KEY=optional

# --- Models (Optional Overrides) ---
OPENROUTER_MODEL=openrouter/auto
GITHUB_MODEL=gpt-4o-mini

# --- Tracker Extension ---
TRACKER_EXTENSION_TOKEN=your-secure-token
TRACKER_INGEST_CORS_ORIGIN=*
TRACKER_DB_PATH=data/tracker.db
```

### 3. Run the App
```bash
python app.py
```

### 4. Access the App
- Optimizer: [http://localhost:5000](http://localhost:5000)
- Tracker Board: [http://localhost:5000/tracker](http://localhost:5000/tracker)

---

## 🧩 Setting up the Browser Extension (Phase 2)
1. Ensure `TRACKER_EXTENSION_TOKEN` is set in your backend `.env`.
2. Open Chrome/Brave and navigate to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `browser_extension/` folder.
5. Click the extension icon in your toolbar and configure:
   - **Tracker Base URL:** `http://localhost:5000` (or your deployed URL)
   - **Ingest Token:** The exact token from your `.env`
6. Visit a job posting on LinkedIn or supported ATS and click "Save to Tracker"!

---

## 🌐 Deploying to Render (Production)

Your live website runs on Render. Here is how to replicate or update it.

### 1. Push project to GitHub
```bash
git init
git add .
git commit -m "Deploy setup"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Create a Render Web Service
- Go to [https://render.com](https://render.com)
- Click **New +** -> **Web Service** -> Connect your GitHub repo.
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `gunicorn app:app`

### 3. Add Environment Variables in Render
Add the same keys you use locally:
- `OPENROUTER_API_KEY`, `GITHUB_PAT`, etc.
- `TRACKER_EXTENSION_TOKEN` (Crucial for your extension to work with the live site)
- `FLASK_DEBUG=0`
- `TRACKER_DB_PATH=/var/data/tracker.db` (**CRITICAL:** Setup a Render Persistent Disk mounted at `/var/data` to prevent database loss on redeploys).

### 4. Deploy & Update
- Click Deploy. Render provides a URL (e.g., `https://resume-optimizer-jpz7.onrender.com/`).
- Future updates: Make changes locally, `git commit`, and `git push`. Render auto-rebuilds.

---

## 🔧 Customization & Advanced Settings
- **AI Models:** Tweak model parameters inside `app.py` or `.env` (`OPENROUTER_MODEL`, etc.).
- **Port Settings:** Change the default port by setting the `PORT` environment variable.
- **Upload Limits:** Max file upload size defaults to 8MB. Override with `MAX_UPLOAD_BYTES` in `.env`.

## 📦 Core Dependencies
- **Flask / Gunicorn:** Web framework and production server.
- **Anthropic / Requests:** AI API clients.
- **python-docx / pypdf:** Document parsing and generation.
- **python-dotenv:** Environment variable management.
