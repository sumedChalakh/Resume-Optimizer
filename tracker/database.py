import os
import sqlite3
from contextlib import contextmanager

from .config import get_db_path


def _resolve_db_path(base_dir=None):
  if base_dir is None:
    base_dir = os.getcwd()
  db_path = get_db_path(base_dir)
  os.makedirs(os.path.dirname(db_path), exist_ok=True)
  return db_path


@contextmanager
def get_connection(base_dir=None):
  db_path = _resolve_db_path(base_dir)
  conn = sqlite3.connect(db_path)
  conn.row_factory = sqlite3.Row
  try:
    yield conn
    conn.commit()
  finally:
    conn.close()


def ensure_database(base_dir=None):
  with get_connection(base_dir) as conn:
    conn.execute(
      """
      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        location TEXT DEFAULT '',
        job_url TEXT DEFAULT '',
        source TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'applied',
        applied_date TEXT NOT NULL,
        dedupe_key TEXT NOT NULL UNIQUE,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
      """
    )

    conn.execute(
      """
      CREATE TABLE IF NOT EXISTS application_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        event_note TEXT DEFAULT '',
        event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
      )
      """
    )

    conn.execute(
      """
      CREATE INDEX IF NOT EXISTS idx_applications_status
      ON applications(status)
      """
    )

    conn.execute(
      """
      CREATE INDEX IF NOT EXISTS idx_applications_company_title
      ON applications(company, title)
      """
    )
