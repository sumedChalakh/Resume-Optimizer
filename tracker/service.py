import hashlib
from datetime import date

from .config import get_status_set


REQUIRED_FIELDS = ("title", "company")


def _normalize_text(value):
  return " ".join(str(value or "").strip().split())


def build_dedupe_key(payload):
  title = _normalize_text(payload.get("title", "")).lower()
  company = _normalize_text(payload.get("company", "")).lower()
  job_url = _normalize_text(payload.get("job_url", "")).lower()
  source = _normalize_text(payload.get("source", "")).lower()
  applied_date = _normalize_text(payload.get("applied_date", ""))

  raw_key = "|".join([title, company, job_url, source, applied_date])
  return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def validate_and_normalize(payload):
  if not isinstance(payload, dict):
    raise ValueError("Payload must be a JSON object")

  cleaned = {
    "title": _normalize_text(payload.get("title", "")),
    "company": _normalize_text(payload.get("company", "")),
    "location": _normalize_text(payload.get("location", "")),
    "job_url": _normalize_text(payload.get("job_url", "")),
    "source": _normalize_text(payload.get("source", "")),
    "status": _normalize_text(payload.get("status", "applied")).lower() or "applied",
    "applied_date": _normalize_text(payload.get("applied_date", "")) or date.today().isoformat(),
    "notes": _normalize_text(payload.get("notes", "")),
  }

  for field in REQUIRED_FIELDS:
    if not cleaned[field]:
      raise ValueError(f"Missing required field: {field}")

  valid_statuses = get_status_set()
  if cleaned["status"] not in valid_statuses:
    raise ValueError(f"Invalid status. Use one of: {', '.join(sorted(valid_statuses))}")

  cleaned["dedupe_key"] = build_dedupe_key(cleaned)
  return cleaned
