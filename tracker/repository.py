from .database import get_connection


def _build_application_filters(status=None, search=None, source=None, applied_from=None):
  where = []
  params = []

  if status:
    where.append("status = ?")
    params.append(status)

  if search:
    where.append("(title LIKE ? OR company LIKE ? OR location LIKE ?)")
    like_value = f"%{search}%"
    params.extend([like_value, like_value, like_value])

  if source:
    where.append("LOWER(source) = LOWER(?)")
    params.append(source)

  if applied_from:
    where.append("applied_date >= ?")
    params.append(applied_from)

  return where, params


def get_application_by_dedupe_key(dedupe_key, base_dir=None):
  with get_connection(base_dir) as conn:
    cursor = conn.cursor()
    cursor.execute(
      "SELECT * FROM applications WHERE dedupe_key = ?",
      (dedupe_key,),
    )
    row = cursor.fetchone()
    cursor.close()
  return dict(row) if row else None


def create_application(
  application,
  base_dir=None,
  event_type="created",
  event_note="Application added to tracker",
):
  with get_connection(base_dir) as conn:
    cursor = conn.cursor()
    cursor.execute(
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

    cursor.execute(
      """
      INSERT INTO application_events (application_id, event_type, event_note)
      VALUES (?, ?, ?)
      """,
      (app_id, event_type, event_note),
    )

    cursor.execute("SELECT * FROM applications WHERE id = ?", (app_id,))
    row = cursor.fetchone()
    cursor.close()
  return dict(row)


def list_applications(status=None, search=None, source=None, applied_from=None, base_dir=None):
  query = "SELECT * FROM applications"
  where, params = _build_application_filters(
    status=status,
    search=search,
    source=source,
    applied_from=applied_from,
  )

  if where:
    query += " WHERE " + " AND ".join(where)

  query += " ORDER BY created_at DESC, id DESC"

  with get_connection(base_dir) as conn:
    cursor = conn.cursor()
    cursor.execute(query, tuple(params) if params else ())
    rows = cursor.fetchall()
    cursor.close()

  return [dict(row) for row in rows]


def list_sources(base_dir=None):
  with get_connection(base_dir) as conn:
    cursor = conn.cursor()
    cursor.execute(
      """
      SELECT DISTINCT source
      FROM applications
      WHERE TRIM(COALESCE(source, '')) <> ''
      ORDER BY source COLLATE NOCASE ASC
      """
    )
    rows = cursor.fetchall()
    cursor.close()

  return [row["source"] for row in rows if row["source"]]


def update_application_status(application_id, status, base_dir=None):
  with get_connection(base_dir) as conn:
    cursor = conn.cursor()
    cursor.execute(
      """
      UPDATE applications
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      """,
      (status, application_id),
    )

    cursor.execute(
      """
      INSERT INTO application_events (application_id, event_type, event_note)
      VALUES (?, ?, ?)
      """,
      (application_id, "status_changed", f"Moved to {status}"),
    )

    cursor.execute("SELECT * FROM applications WHERE id = ?", (application_id,))
    row = cursor.fetchone()
    cursor.close()

  return dict(row) if row else None


def delete_application(application_id, base_dir=None):
  with get_connection(base_dir) as conn:
    cursor = conn.cursor()
    cursor.execute(
      "SELECT id FROM applications WHERE id = ?",
      (application_id,),
    )
    existing = cursor.fetchone()

    if not existing:
      cursor.close()
      return False

    cursor.execute(
      "DELETE FROM application_events WHERE application_id = ?",
      (application_id,),
    )
    cursor.execute(
      "DELETE FROM applications WHERE id = ?",
      (application_id,),
    )
    cursor.close()

  return True


def dashboard_counts(base_dir=None):
  with get_connection(base_dir) as conn:
    cursor = conn.cursor()
    cursor.execute(
      """
      SELECT status, COUNT(*) AS count
      FROM applications
      GROUP BY status
      """
    )
    rows = cursor.fetchall()
    cursor.close()

  return {row["status"]: row["count"] for row in rows}


def flow_overview(statuses, source=None, applied_from=None, base_dir=None):
  node_counts = {status: 0 for status in statuses}
  links = {}
  status_order = {status: idx for idx, status in enumerate(statuses)}

  where, params = _build_application_filters(
    source=source,
    applied_from=applied_from,
  )

  app_query = "SELECT id, status FROM applications"
  if where:
    app_query += " WHERE " + " AND ".join(where)

  with get_connection(base_dir) as conn:
    cursor = conn.cursor()
    cursor.execute(app_query, tuple(params) if params else ())
    app_rows = cursor.fetchall()

    app_ids = [row["id"] for row in app_rows]
    if app_ids:
      placeholders = ",".join(["?"] * len(app_ids))
      cursor.execute(
        f"""
        SELECT application_id, event_note
        FROM application_events
        WHERE event_type = 'status_changed'
          AND application_id IN ({placeholders})
        ORDER BY application_id ASC, id ASC
        """,
        tuple(app_ids),
      )
      event_rows = cursor.fetchall()
    else:
      event_rows = []
    cursor.close()

  app_status_map = {row["id"]: row["status"] for row in app_rows}

  for row in app_rows:
    status = row["status"]
    if status in node_counts:
      node_counts[status] += 1

  events_by_app = {}
  for row in event_rows:
    app_id = row["application_id"]
    note = str(row["event_note"] or "").strip().lower()
    if not note.startswith("moved to "):
      continue

    destination = note.replace("moved to ", "", 1).strip()
    if destination not in node_counts:
      continue

    events_by_app.setdefault(app_id, []).append(destination)

  for app_id, destinations in events_by_app.items():
    previous = "applied"
    for destination in destinations:
      if previous == destination:
        continue

      # Keep Sankey as a clean funnel: only count forward progression.
      if status_order.get(destination, -1) <= status_order.get(previous, -1):
        previous = destination
        continue

      key = (previous, destination)
      links[key] = links.get(key, 0) + 1
      previous = destination

    current_status = app_status_map.get(app_id)
    if (
      current_status in node_counts
      and current_status != previous
      and status_order.get(current_status, -1) > status_order.get(previous, -1)
    ):
      key = (previous, current_status)
      links[key] = links.get(key, 0) + 1

  link_items = [
    {"source": source, "target": target, "value": value}
    for (source, target), value in sorted(links.items(), key=lambda item: item[1], reverse=True)
    if value > 0
  ]

  return {
    "nodes": [{"id": status, "label": status.capitalize(), "count": node_counts[status]} for status in statuses],
    "links": link_items,
  }
