import io
from docx import Document
from pypdf import PdfReader


def extract_resume_text(file_storage, max_upload_bytes=8 * 1024 * 1024):
    filename = (getattr(file_storage, "filename", None) or "").strip()
    if not filename:
        raise ValueError("Missing file name")

    lower_name = filename.lower()
    file_bytes = file_storage.read()
    if not file_bytes:
        raise ValueError("Uploaded file is empty")
    if len(file_bytes) > max_upload_bytes:
        max_mb = max(1, max_upload_bytes // (1024 * 1024))
        raise ValueError(f"Uploaded file is too large. Maximum size is {max_mb} MB")

    if lower_name.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="ignore").strip()

    if lower_name.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(file_bytes))
        extracted = []
        for page in reader.pages:
            extracted.append(page.extract_text() or "")
        return "\n".join(extracted).strip()

    if lower_name.endswith(".docx"):
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text and p.text.strip()).strip()

    if lower_name.endswith(".doc"):
        raise ValueError(".doc format is not supported. Please upload .docx, .pdf, or .txt")

    raise ValueError("Unsupported file type. Please upload .pdf, .docx, or .txt")
