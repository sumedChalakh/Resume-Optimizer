from app import app
import json

client = app.test_client()

payload = {
    "latex_data": {
        "full_name": "Sumed Chalakh",
        "email": "sumedchalakh028@gmail.com",
        "phone": "+91 8129693532",
        "location": "Nagpur, MH",
        "linkedin": "linkedin.com/in/sumedchalakh",
        "github": "github.com/sumedchalakh",
        "summary": "ML Engineer with expertise building end-to-end production ML systems.",
        "skills": ["Languages: Python, SQL", "ML: Scikit-learn, XGBoost"],
        "experience": ["Data Scientist|Zaalima|2024|Remote|Built ML models"],
        "projects": [],
        "education": [],
        "certifications": []
    }
}

resp = client.post("/export-latex-pdf", json=payload)
print(f"Status: {resp.status_code}")
print(f"Content-Type: {resp.headers.get('Content-Type')}")
print(f"Fallback: {resp.headers.get('X-Latex-Fallback')}")
print(f"Size: {len(resp.data)} bytes")
print(f"Is PDF (starts with %PDF): {resp.data[:4] == b'%PDF'}")

# Save to file for inspection
with open("test_resume.pdf", "wb") as f:
    f.write(resp.data)
print("Saved to test_resume.pdf")
