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
ANTHROPIC_API_KEY=your-anthropic-key
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=openrouter/auto
HUGGINGFACE_API_KEY=optional
HUGGINGFACE_API_KEY_BACKUP=optional
```

Priority used by app:
- Uses `ANTHROPIC_API_KEY` if provided
- Falls back to `OPENROUTER_API_KEY` if Anthropic key is absent

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
