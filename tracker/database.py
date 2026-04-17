import os
import sqlite3
from contextlib import contextmanager

try:
  import psycopg2
  import psycopg2.extras
  HAS_PSYCOPG2 = True
except ImportError:
  HAS_PSYCOPG2 = False

from .config import get_db_path


def _is_postgres_url():
  database_url = os.getenv("DATABASE_URL", "").strip()
  return bool(database_url and (database_url.startswith("postgres://") or database_url.startswith("postgresql://")))


def _resolve_db_path(base_dir=None):
  if base_dir is None:
    base_dir = os.getcwd()
  db_path = get_db_path(base_dir)
  os.makedirs(os.path.dirname(db_path), exist_ok=True)
  return db_path


class PostgresRow:
  def __init__(self, data):
    self._data = data

  def __getitem__(self, key):
    return self._data.get(key) if isinstance(self._data, dict) else self._data[key]

  def get(self, key, default=None):
    if isinstance(self._data, dict):
      return self._data.get(key, default)
    return default

  def __iter__(self):
    return iter(self._data.values() if isinstance(self._data, dict) else self._data)


class CursorWrapper:
  def __init__(self, cursor, is_postgres=False):
    self._cursor = cursor
    self._is_postgres = is_postgres
    self._last_insert_id = None

  def _convert_query(self, query):
    if self._is_postgres:
      return query.replace("?", "%s")
    return query

  def execute(self, query, params=None):
    converted_query = self._convert_query(query)
    if params:
      self._cursor.execute(converted_query, params)
    else:
      self._cursor.execute(converted_query)
    
    # For PostgreSQL INSERT, try to capture the ID from RETURNING clause
    if self._is_postgres and converted_query.strip().upper().startswith("INSERT"):
      try:
        result = self._cursor.fetchone()
        if result and isinstance(result, dict) and "id" in result:
          self._last_insert_id = result["id"]
          self._cursor.arraysize = 0
      except Exception:
        pass
    
    return self

  def fetchone(self):
    row = self._cursor.fetchone()
    return row

  def fetchall(self):
    rows = self._cursor.fetchall()
    return rows

  def close(self):
    self._cursor.close()

  @property
  def lastrowid(self):
    if self._is_postgres:
      return self._last_insert_id or 1
    return self._cursor.lastrowid


class ConnectionWrapper:
  def __init__(self, conn, is_postgres=False):
    self._conn = conn
    self._is_postgres = is_postgres

  def cursor(self):
    if self._is_postgres:
      cursor = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    else:
      cursor = self._conn.cursor()
    return CursorWrapper(cursor, is_postgres=self._is_postgres)

  def execute(self, query, params=None):
    cursor = self.cursor()
    result = cursor.execute(query, params)
    cursor.close()
    return result

  def commit(self):
    self._conn.commit()

  def rollback(self):
    self._conn.rollback()

  def close(self):
    self._conn.close()


@contextmanager
def get_connection(base_dir=None):
  if _is_postgres_url():
    if not HAS_PSYCOPG2:
      raise RuntimeError("psycopg2 is required for PostgreSQL support")
    database_url = os.getenv("DATABASE_URL").strip()
    conn = psycopg2.connect(database_url)
    conn.autocommit = False
    wrapped = ConnectionWrapper(conn, is_postgres=True)
    try:
      yield wrapped
      wrapped.commit()
    except Exception:
      wrapped.rollback()
      raise
    finally:
      wrapped.close()
  else:
    db_path = _resolve_db_path(base_dir)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    wrapped = ConnectionWrapper(conn, is_postgres=False)
    try:
      yield wrapped
      wrapped.commit()
    finally:
      wrapped.close()


def ensure_database(base_dir=None):
  with get_connection(base_dir) as conn:
    cursor = conn.cursor()
    if _is_postgres_url():
      cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS applications (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          company TEXT NOT NULL,
          location TEXT DEFAULT '',
          job_url TEXT DEFAULT '',
          source TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'applied',
          applied_date TEXT NOT NULL,
          dedupe_key TEXT NOT NULL UNIQUE,
          notes TEXT DEFAULT '',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
      )

      cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS application_events (
          id SERIAL PRIMARY KEY,
          application_id INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          event_note TEXT DEFAULT '',
          event_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
        )
        """
      )

      cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status)"
      )
      cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_applications_company_title ON applications(company, title)"
      )
    else:
      cursor.execute(
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

      cursor.execute(
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

      cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_applications_status
        ON applications(status)
        """
      )

      cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_applications_company_title
        ON applications(company, title)
        """
      )
    cursor.close()
