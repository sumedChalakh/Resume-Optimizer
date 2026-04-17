import os

TRACKER_DB_ENV = "TRACKER_DB_PATH"
TRACKER_EXTENSION_TOKEN_ENV = "TRACKER_EXTENSION_TOKEN"
TRACKER_INGEST_CORS_ORIGIN_ENV = "TRACKER_INGEST_CORS_ORIGIN"
TRACKER_INGEST_MIN_CONFIDENCE_ENV = "TRACKER_INGEST_MIN_CONFIDENCE"
DEFAULT_DB_DIR = "data"
DEFAULT_DB_FILE = "tracker.db"

TRACKER_STATUSES = (
  "saved",
  "applied",
  "screen",
  "interview",
  "offer",
  "rejected",
)


def get_status_set():
  return set(TRACKER_STATUSES)


def get_db_path(base_dir):
  env_override = os.getenv(TRACKER_DB_ENV, "").strip()
  if env_override:
    return env_override

  db_dir = os.path.join(base_dir, DEFAULT_DB_DIR)
  return os.path.join(db_dir, DEFAULT_DB_FILE)


def get_extension_token():
  return os.getenv(TRACKER_EXTENSION_TOKEN_ENV, "").strip()


def get_ingest_cors_origin():
  return os.getenv(TRACKER_INGEST_CORS_ORIGIN_ENV, "*").strip() or "*"


def get_ingest_min_confidence():
  raw = os.getenv(TRACKER_INGEST_MIN_CONFIDENCE_ENV, "0.7").strip()
  try:
    parsed = float(raw)
  except ValueError:
    parsed = 0.7
  return max(0.0, min(parsed, 1.0))
