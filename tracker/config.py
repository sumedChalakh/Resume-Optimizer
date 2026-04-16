import os

TRACKER_DB_ENV = "TRACKER_DB_PATH"
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
