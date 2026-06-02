# ⚡ ATS Resume Optimizer

**Live Demo:** [https://resume-optimizer-jpz7.onrender.com/](https://resume-optimizer-jpz7.onrender.com/)

An advanced, enterprise-grade AI-powered resume optimization and job application telemetry web application built with Python (Flask) and SQLite. It leverages a chain-of-thought multi-model AI fallback framework (supporting Anthropic, OpenRouter, HuggingFace, and GitHub Models) to analyze resumes against Job Descriptions (JDs), calculate ATS scores, and restructure layouts.

The application includes a comprehensive job-hunting CRM tracker (featuring Kanban boards, insights, and a browser extension), a secure public short-link resume hosting portal with real-time visitor geotracking, and an administrator panel monitoring user action telemetry.

---

## ✨ Core Feature Modules

### 📝 Resume Optimization & AI Engine
- **Multi-Format Ingestion:** Seamless text extraction from PDF (`.pdf`), Word (`.docx`), and plain text (`.txt`) documents.
- **ATS Compatibility Scoring:** Computes overall fit percentages based on keyword coverage, skills matches, phrasing quality, and domain alignment.
- **Targeted AI Bullet Rewriting:** Restructures bullet points using high-yield action verbs and quantifiable business impact metrics while preserving original entries.
- **AI Mock Interview Simulator:** Runs mixed, coding, negotiation, or system design interview practice rounds with detailed critique scorecards and STAR story restructuring.
- **Dynamic Skill Gap Analyzer:** Extracts critical gaps between your background and the target role, mapping custom learning pathways.

### 🔗 Public Resume URL Sharing & Visitor Analytics
- **Custom Short-Link Hosting:** Allows candidates to host their optimized resume snapshot on a secure public view page (e.g. `/share/alex-dev`) without requiring recruiter login.
- **Recruiter Action Geotracking:** Logs recruiter visits, capturing timestamp, client IP, geolocated city/country, referring netloc, and browser user agent.
- **Live Analytics Control Panel (`/share-dashboard`):** Real-time candidate dashboard showing:
  - Total Views, Top Visitor Location, Primary Inbound Channel.
  - Interactive Views Timeline Chart (animated via Chart.js).
  - Geographic distribution progress bars and referrer breakdown blocks.
  - Recent Visitor Logs tables with exact request parameter breakdowns.
- **Theme Preferences:** Supports light/dark mode transitions and high-contrast browser print layouts.

### 🧭 Job Application CRM Tracker
- **Kanban Board Board Layout:** Visual drag-and-drop column board tracking applications from Wishlist through Applied, Interview, Offer, and Rejected.
- **1-Click Browser Ingest Extension:** Save job postings directly from LinkedIn, Indeed, Naukri, and Workday using the unpacked Chrome/Brave extension.
- **Funnel Analytics (Sankey Diagrams):** Renders interactive Sankey flow charts detailing conversion rates, ghost rates, response latency, and volume metrics.

### 🛡️ Administrator Panel & Activity Telemetry
- **Telemetry Action Loggers:** Automatically records user actions across the platform to track:
  - `resumes_created`: Counts uploads and text extractions.
  - `resumes_optimized`: Counts AI optimization runs.
  - `resumes_downloaded`: Tracks exports to DOCX, PDF, and LaTeX packages.
  - `mock_interviews`: Monitors interview prep sessions started.
- **Admin Management Portal:** Dedicated dashboard listing all user accounts with their respective activity totals, role badges, and registration details.

---

## 🤖 AI Provider Fallback Framework
Ensures uninterrupted availability by automatically cascading failed requests through a prioritized chain of AI endpoints:
1. `OPENROUTER_API_KEY_BACKUP` (Using custom fallback models list)
2. `GITHUB_PAT` (GitHub Models utilizing `gpt-4o-mini`)
3. `OPENROUTER_API_KEY` (Directing to `deepseek-r1:free` or `llama-3.3-70b-instruct`)
4. `HUGGINGFACE_API_KEY` (`meta-llama/Llama-3.1-8B-Instruct`)
5. `HUGGINGFACE_API_KEY_BACKUP`
6. `ANTHROPIC_API_KEY` (Fallback to Claude if configured)

---

## 📁 Project Structure

```text
ats_optimizer/
├── app.py                  # Main Flask application, AI orchestrations, DOCX parser
├── extensions.py           # Flask-SQLAlchemy db instance, BCrypt, Login configurations
├── models.py               # Database schemas (Users, Boards, Tracker, Shares, Analytics)
├── share_resume.py         # Blueprint handling short links, analytics logs, and GeoIP
├── latex_resume.py         # Blueprint compiling LaTeX layouts and PDF exports
├── resume_template.tex     # Classic LaTeX template stylesheet
├── tracker/                # Kanban routes, Sankey charts, and extension endpoints
├── auth/                   # Authentication controller, signup/login, and Admin panel APIs
├── templates/              # Jinja2 HTML templates
│   ├── index.html          # Main Optimizer interface and Admin panel
│   ├── share_dashboard.html# Public resumes list and Chart.js analytics pane
│   ├── share_view.html     # Reader-friendly responsive public resume sheet
│   └── tracker_board.html  # Kanban tracking CRM interface
├── static/                 # Static CSS stylesheets and JS bundles (main.js, tracker.js)
├── browser_extension/      # Unpacked extension files for Chrome/Brave browser
├── requirements.txt        # Python dependency manifest
└── Procfile                # Render web service start scripts
```

---

## 🚀 Setup & Run (Local Development)

### 1. Prerequisite Installations
Ensure Python 3.10+ and standard tools are installed. If LaTeX PDF compilation is required locally, install TeX Live (on Linux) or MiKTeX (on Windows) and add `pdflatex` to your PATH.

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Environment Settings
Create a `.env` file in the root directory:

```ini
# --- Core API Configuration ---
SECRET_KEY=generate-a-secure-random-phrase
FLASK_DEBUG=1
PORT=5000

# --- Telemetry and DB ---
TRACKER_DB_PATH=data/tracker.db
TRACKER_EXTENSION_TOKEN=your-browser-extension-ingest-token

# --- AI APIs (Configure at least one for fallbacks) ---
OPENROUTER_API_KEY=your-openrouter-token
GITHUB_PAT=your-github-personal-access-token
HUGGINGFACE_API_KEY=your-huggingface-token
ANTHROPIC_API_KEY=your-anthropic-token
```

### 4. Database Setup & Initialization
The application runs automatic schemas migration on startup. Launch the Flask server:
```bash
python app.py
```
Upon startup, the database context checks and alters the tables dynamically, initializing:
- The `users` table with activity metrics columns.
- The `shared_resumes` and `resume_analytics` tables.
- A default hunt board for any registered users.

---

## 🌐 API Reference Manual

### Public Resumes API (`share_resume.py`)
- **`GET /share/<slug>`**: Serves the hosted resume snapshot and logs recruiter visit metadata (GeoIP, referrers).
- **`GET /share-dashboard`**: Renders the URL manager board (requires user login).
- **`POST /share/api/create`**: Generates or updates a public slug snapshot. Expects `{"slug": "string", "resume_data": {}}`.
- **`POST /share/api/toggle`**: Toggles shared link active status. Expects `{"id": integer}`.
- **`GET /share/api/analytics/<link_id>`**: Returns detailed log timelines, referrer charts, and top locations in JSON.

### Admin Telemetry API (`auth/routes.py`)
- **`GET /api/admin/dashboard-stats`**: Secure admin-only stats. Exposes counts for all users:
  ```json
  {
    "total_users": 15,
    "total_applications": 142,
    "recent_users": [
      {
        "id": 2,
        "name": "Jane Doe",
        "email": "jane@example.com",
        "role": "user",
        "resumes_created": 3,
        "resumes_optimized": 8,
        "resumes_downloaded": 5,
        "mock_interviews": 2
      }
    ]
  }
  ```

---

## 🔧 Production Deployments (Render)

### 1. persistent Disk setup
To prevent losing your SQLite database (`tracker.db`) when Render rebuilds/restarts containers, mount a Persistent Disk:
- **Mount Path:** `/var/data`
- **Size:** 1 GB (sufficient for years of logging)
- **Environment Var:** Set `TRACKER_DB_PATH=/var/data/tracker.db` in your Render Dashboard.

### 2. build and Run commands
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `gunicorn app:app`

---

## 📦 Principal Packages Used
- **Flask / Gunicorn**: Web engine core.
- **Flask-SQLAlchemy**: ORM database driver mapping models.
- **python-docx / pypdf**: Parsing, generating, and downloading Word and PDF files.
- **Chart.js / Plotly**: Live graphs and interactive application flow Sankey funnels.
