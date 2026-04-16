from flask import Blueprint, jsonify, render_template, request

from .config import TRACKER_STATUSES, get_status_set
from .database import ensure_database
from .repository import (
  create_application,
  dashboard_counts,
  get_application_by_dedupe_key,
  list_applications,
  update_application_status,
)
from .service import validate_and_normalize


tracker_blueprint = Blueprint("tracker", __name__)


@tracker_blueprint.get("/tracker")
def tracker_board():
  return render_template("tracker_board.html", statuses=TRACKER_STATUSES)


@tracker_blueprint.get("/tracker/api/health")
def tracker_health():
  ensure_database()
  return jsonify({"ok": True, "module": "tracker", "phase": 1})


@tracker_blueprint.get("/tracker/api/applications")
def tracker_list_applications():
  ensure_database()
  status = (request.args.get("status") or "").strip().lower()
  search = (request.args.get("q") or "").strip()

  if status and status not in get_status_set():
    return jsonify({"error": "Invalid status filter"}), 400

  apps = list_applications(status=status or None, search=search or None)
  counts = dashboard_counts()
  return jsonify({"applications": apps, "counts": counts, "statuses": TRACKER_STATUSES})


@tracker_blueprint.post("/tracker/api/applications")
def tracker_create_application():
  ensure_database()
  payload = request.get_json(silent=True) or {}

  try:
    cleaned = validate_and_normalize(payload)
  except ValueError as exc:
    return jsonify({"error": str(exc)}), 400

  existing = get_application_by_dedupe_key(cleaned["dedupe_key"])
  if existing:
    return jsonify({"error": "Application already tracked", "application": existing}), 409

  created = create_application(cleaned)
  return jsonify({"application": created}), 201


@tracker_blueprint.patch("/tracker/api/applications/<int:application_id>/status")
def tracker_patch_status(application_id):
  ensure_database()
  payload = request.get_json(silent=True) or {}
  status = str(payload.get("status", "")).strip().lower()

  if status not in get_status_set():
    return jsonify({"error": "Invalid status"}), 400

  updated = update_application_status(application_id, status)
  if not updated:
    return jsonify({"error": "Application not found"}), 404

  return jsonify({"application": updated})
