from flask import current_app
from extensions import db
from models import TrackerApplication, TrackerApplicationEvent, TrackerBoard
from sqlalchemy import func, or_

def _build_application_filters(query, status=None, search=None, source=None, applied_from=None):
  if status:
    query = query.filter(TrackerApplication.status == status)

  if search:
    search_term = f"%{search}%"
    query = query.filter(or_(
      TrackerApplication.title.ilike(search_term),
      TrackerApplication.company.ilike(search_term),
      TrackerApplication.location.ilike(search_term)
    ))

  if source:
    query = query.filter(func.lower(TrackerApplication.source) == func.lower(source))

  if applied_from:
    query = query.filter(TrackerApplication.applied_date >= applied_from)

  return query


def _to_dict(app_model):
  if not app_model:
    return None
  return {
    "id": app_model.id,
    "user_id": app_model.user_id,
    "board_id": app_model.board_id,
    "title": app_model.title,
    "company": app_model.company,
    "location": app_model.location,
    "job_url": app_model.job_url,
    "source": app_model.source,
    "status": app_model.status,
    "applied_date": app_model.applied_date,
    "dedupe_key": app_model.dedupe_key,
    "notes": app_model.notes,
    "archived": app_model.archived,
    "created_at": app_model.created_at.isoformat() if app_model.created_at else None,
    "updated_at": app_model.updated_at.isoformat() if app_model.updated_at else None,
  }


def get_application_by_dedupe_key(dedupe_key, user_id):
  with current_app.app_context():
    app_model = TrackerApplication.query.filter_by(dedupe_key=dedupe_key, user_id=user_id).first()
    return _to_dict(app_model)


def create_application(
  application,
  user_id,
  event_type="created",
  event_note="Application added to tracker"
):
  with current_app.app_context():
    app_model = TrackerApplication(
      user_id=user_id,
      board_id=application.get("board_id", 1),
      title=application["title"],
      company=application["company"],
      location=application.get("location", ""),
      job_url=application.get("job_url", ""),
      source=application.get("source", ""),
      status=application["status"],
      applied_date=application["applied_date"],
      dedupe_key=application["dedupe_key"],
      notes=application.get("notes", ""),
      archived=application.get("archived", False)
    )
    db.session.add(app_model)
    db.session.flush()

    event = TrackerApplicationEvent(
      application_id=app_model.id,
      event_type=event_type,
      event_note=event_note
    )
    db.session.add(event)
    db.session.commit()

    return _to_dict(app_model)


def list_applications(user_id, status=None, search=None, source=None, applied_from=None, board_id=None, archived=False):
  with current_app.app_context():
    query = TrackerApplication.query.filter_by(user_id=user_id, archived=archived)
    if board_id:
      query = query.filter_by(board_id=board_id)
    query = _build_application_filters(query, status, search, source, applied_from)
    query = query.order_by(TrackerApplication.created_at.desc(), TrackerApplication.id.desc())
    
    apps = query.all()
    return [_to_dict(a) for a in apps]


def list_sources(user_id, board_id=None, archived=False):
  with current_app.app_context():
    query = db.session.query(TrackerApplication.source)\
      .filter(TrackerApplication.user_id == user_id)\
      .filter(TrackerApplication.archived == archived)\
      .filter(TrackerApplication.source != None)\
      .filter(func.trim(TrackerApplication.source) != '')
    if board_id:
      query = query.filter(TrackerApplication.board_id == board_id)
    sources = query.distinct().order_by(TrackerApplication.source.asc()).all()
    return [s[0] for s in sources if s[0]]


def update_application_status(application_id, status, user_id, event_note=None):
  with current_app.app_context():
    app_model = TrackerApplication.query.filter_by(id=application_id, user_id=user_id).first()
    if not app_model:
      return None

    app_model.status = status
    
    note = event_note if event_note else f"Moved to {status}"
    event = TrackerApplicationEvent(
      application_id=app_model.id,
      event_type="status_changed",
      event_note=note
    )
    db.session.add(event)
    db.session.commit()

    return _to_dict(app_model)


def delete_application(application_id, user_id):
  with current_app.app_context():
    app_model = TrackerApplication.query.filter_by(id=application_id, user_id=user_id).first()
    if not app_model:
      return False

    db.session.delete(app_model)
    db.session.commit()
    return True


def dashboard_counts(user_id, board_id=None, archived=False):
  with current_app.app_context():
    query = db.session.query(TrackerApplication.status, func.count(TrackerApplication.id))\
      .filter(TrackerApplication.user_id == user_id)\
      .filter(TrackerApplication.archived == archived)
    if board_id:
      query = query.filter(TrackerApplication.board_id == board_id)
    counts = query.group_by(TrackerApplication.status).all()
    return {row[0]: row[1] for row in counts}


def flow_overview(statuses, user_id, source=None, applied_from=None, board_id=None):
  with current_app.app_context():
    node_counts = {status: 0 for status in statuses}
    links = {}
    status_order = {status: idx for idx, status in enumerate(statuses)}

    query = TrackerApplication.query.filter_by(user_id=user_id, archived=False)
    if board_id:
      query = query.filter_by(board_id=board_id)
    query = _build_application_filters(query, status=None, search=None, source=source, applied_from=applied_from)
    
    app_models = query.all()
    app_ids = [a.id for a in app_models]
    app_status_map = {a.id: a.status for a in app_models}

    for a in app_models:
      if a.status in node_counts:
        node_counts[a.status] += 1

    if app_ids:
      events = TrackerApplicationEvent.query.filter(
        TrackerApplicationEvent.application_id.in_(app_ids),
        TrackerApplicationEvent.event_type == 'status_changed'
      ).order_by(TrackerApplicationEvent.application_id.asc(), TrackerApplicationEvent.id.asc()).all()
    else:
      events = []

    events_by_app = {}
    for event in events:
      app_id = event.application_id
      note = str(event.event_note or "").strip().lower()
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
      {"source": src, "target": tgt, "value": value}
      for (src, tgt), value in sorted(links.items(), key=lambda item: item[1], reverse=True)
      if value > 0
    ]

    return {
      "nodes": [{"id": s, "label": s.capitalize(), "count": node_counts[s]} for s in statuses],
      "links": link_items,
    }


def _board_to_dict(board):
  if not board:
    return None
  return {
    "id": board.id,
    "user_id": board.user_id,
    "name": board.name,
    "created_at": board.created_at.isoformat() if board.created_at else None
  }

def list_boards(user_id):
  with current_app.app_context():
    boards = TrackerBoard.query.filter_by(user_id=user_id).order_by(TrackerBoard.id.asc()).all()
    return [_board_to_dict(b) for b in boards]

def create_board(user_id, name):
  with current_app.app_context():
    board = TrackerBoard(user_id=user_id, name=name)
    db.session.add(board)
    db.session.commit()
    return _board_to_dict(board)

def rename_board(board_id, name, user_id):
  with current_app.app_context():
    board = TrackerBoard.query.filter_by(id=board_id, user_id=user_id).first()
    if not board:
      return None
    board.name = name
    db.session.commit()
    return _board_to_dict(board)

def delete_board(board_id, user_id):
  with current_app.app_context():
    board = TrackerBoard.query.filter_by(id=board_id, user_id=user_id).first()
    if not board:
      return False
      
    count = TrackerBoard.query.filter_by(user_id=user_id).count()
    if count <= 1:
      raise ValueError("Cannot delete the only active board.")

    TrackerApplication.query.filter_by(board_id=board_id, user_id=user_id).delete()
    db.session.delete(board)
    db.session.commit()
    return True

def archive_application(application_id, archived, user_id):
  with current_app.app_context():
    app_model = TrackerApplication.query.filter_by(id=application_id, user_id=user_id).first()
    if not app_model:
      return None
    app_model.archived = archived
    
    event = TrackerApplicationEvent(
      application_id=app_model.id,
      event_type="archived" if archived else "restored",
      event_note="Application archived" if archived else "Application restored to active board"
    )
    db.session.add(event)
    db.session.commit()
    return _to_dict(app_model)
