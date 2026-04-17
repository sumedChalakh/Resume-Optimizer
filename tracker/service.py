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


def _pick(payload, *keys, default=""):
  for key in keys:
    if key in payload and payload[key] is not None:
      return payload[key]
  return default


def normalize_external_payload(payload):
  """Map browser-extension payload shape into tracker app shape."""
  if not isinstance(payload, dict):
    raise ValueError("Payload must be a JSON object")

  confidence_raw = _pick(payload, "confidence", default=0.0)
  try:
    confidence = float(confidence_raw)
  except (TypeError, ValueError):
    confidence = 0.0
  confidence = max(0.0, min(confidence, 1.0))

  apply_signal = _normalize_text(_pick(payload, "apply_signal", "signal", default="")).lower()
  confirmed_by_user = bool(_pick(payload, "confirmed_by_user", default=False))

  mapped = {
    "title": _normalize_text(_pick(payload, "title", "job_title", "role")),
    "company": _normalize_text(_pick(payload, "company", "company_name", "employer")),
    "location": _normalize_text(_pick(payload, "location", default="")),
    "job_url": _normalize_text(_pick(payload, "job_url", "url", "job_link", default="")),
    "source": _normalize_text(_pick(payload, "source", "platform", default="Browser Extension")),
    "status": "applied",
    "applied_date": _normalize_text(_pick(payload, "applied_date", "date", default="")) or date.today().isoformat(),
    "notes": _normalize_text(_pick(payload, "notes", default="")),
  }

  if mapped["source"]:
    mapped["source"] = f"{mapped['source']} (auto)"

  normalized = validate_and_normalize(mapped)
  return {
    "application": normalized,
    "confidence": confidence,
    "apply_signal": apply_signal,
    "confirmed_by_user": confirmed_by_user,
  }
