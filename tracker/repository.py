from .database import get_connection


def get_application_by_dedupe_key(dedupe_key, base_dir=None):
  with get_connection(base_dir) as conn:
    row = conn.execute(
      "SELECT * FROM applications WHERE dedupe_key = ?",
      (dedupe_key,),
    ).fetchone()
  return dict(row) if row else None


def create_application(application, base_dir=None):
  with get_connection(base_dir) as conn:
    cursor = conn.execute(
      """
      INSERT INTO applications (
        title, company, location, job_url, source, status, applied_date, dedupe_key, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      """,
      (
        application["title"],
        application["company"],
        application.get("location", ""),
        application.get("job_url", ""),
        application.get("source", ""),
        application["status"],
        application["applied_date"],
        application["dedupe_key"],
        application.get("notes", ""),
      ),
    )
    app_id = cursor.lastrowid

    conn.execute(
      """
      INSERT INTO application_events (application_id, event_type, event_note)
      VALUES (?, ?, ?)
      """,
      (app_id, "created", "Application added to tracker"),
    )

    row = conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)).fetchone()
  return dict(row)


def list_applications(status=None, search=None, base_dir=None):
  query = "SELECT * FROM applications"
  where = []
  params = []

  if status:
    where.append("status = ?")
    params.append(status)

  if search:
    where.append("(title LIKE ? OR company LIKE ? OR location LIKE ?)")
    like_value = f"%{search}%"
    params.extend([like_value, like_value, like_value])

  if where:
    query += " WHERE " + " AND ".join(where)

  query += " ORDER BY created_at DESC, id DESC"

  with get_connection(base_dir) as conn:
    rows = conn.execute(query, tuple(params)).fetchall()

  return [dict(row) for row in rows]


def update_application_status(application_id, status, base_dir=None):
  with get_connection(base_dir) as conn:
    conn.execute(
      """
      UPDATE applications
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      """,
      (status, application_id),
    )

    conn.execute(
      """
      INSERT INTO application_events (application_id, event_type, event_note)
      VALUES (?, ?, ?)
      """,
      (application_id, "status_changed", f"Moved to {status}"),
    )

    row = conn.execute("SELECT * FROM applications WHERE id = ?", (application_id,)).fetchone()

  return dict(row) if row else None


def dashboard_counts(base_dir=None):
  with get_connection(base_dir) as conn:
    rows = conn.execute(
      """
      SELECT status, COUNT(*) AS count
      FROM applications
      GROUP BY status
      """
    ).fetchall()

  return {row["status"]: row["count"] for row in rows}
