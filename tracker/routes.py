import os
from datetime import date, timedelta

from flask import Blueprint, jsonify, make_response, render_template, request

from .config import (
  TRACKER_STATUSES,
  get_extension_token,
  get_db_path,
  get_ingest_cors_origin,
  get_ingest_min_confidence,
  is_db_path_explicitly_configured,
  get_status_set,
)
from .database import ensure_database
from .repository import (
  create_application,
  delete_application,
  flow_overview,
  get_application_by_dedupe_key,
  list_applications,
  list_sources,
  update_application_status,
)
from .service import normalize_external_payload, validate_and_normalize


tracker_blueprint = Blueprint("tracker", __name__)


def _resolve_applied_from(days_value):
  days_raw = str(days_value or "").strip().lower()
  if not days_raw or days_raw == "all":
    return None

  if not days_raw.isdigit():
    raise ValueError("Invalid days filter")

  days = int(days_raw)
  if days <= 0:
    raise ValueError("Invalid days filter")

  threshold = date.today() - timedelta(days=days - 1)
  return threshold.isoformat()


def _build_counts_from_apps(apps):
  counts = {status: 0 for status in TRACKER_STATUSES}
  for app in apps:
    status = str(app.get("status") or "").strip().lower()
    if status in counts:
      counts[status] += 1
  return counts


def _corsify(response):
  origin = get_ingest_cors_origin()
  response.headers["Access-Control-Allow-Origin"] = origin
  response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Tracker-Token"
  response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
  return response


def _extract_bearer_token():
  auth_header = (request.headers.get("Authorization") or "").strip()
  if auth_header.lower().startswith("bearer "):
    return auth_header[7:].strip()
  fallback = (request.headers.get("X-Tracker-Token") or "").strip()
  return fallback


@tracker_blueprint.get("/tracker")
def tracker_board():
  return render_template("tracker_board.html", statuses=TRACKER_STATUSES)


@tracker_blueprint.get("/tracker/api/health")
def tracker_health():
  ensure_database()
  base_dir = os.getcwd()
  db_path = get_db_path(base_dir)
  explicit_db_path = is_db_path_explicitly_configured()
  return jsonify({
    "ok": True,
    "module": "tracker",
    "phase": 3,
    "db_path": db_path,
    "db_persistence_configured": explicit_db_path,
    "warnings": ([] if explicit_db_path else ["TRACKER_DB_PATH is not set; tracker data may be lost after redeploy or restart."]),
    "tracker_features": [
      "board",
      "ingest",
      "insights",
      "flow",
      "filters",
      "exports",
    ],
  })


@tracker_blueprint.get("/tracker/api/applications")
def tracker_list_applications():
  ensure_database()
  status = (request.args.get("status") or "").strip().lower()
  search = (request.args.get("q") or "").strip()
  source = (request.args.get("source") or "").strip()
  days = (request.args.get("days") or "all").strip().lower()

  if status and status not in get_status_set():
    return jsonify({"error": "Invalid status filter"}), 400

  try:
    applied_from = _resolve_applied_from(days)
  except ValueError as exc:
    return jsonify({"error": str(exc)}), 400

  apps = list_applications(
    status=status or None,
    search=search or None,
    source=source or None,
    applied_from=applied_from,
  )
  counts = _build_counts_from_apps(apps)
  sources = list_sources()
  return jsonify({
    "applications": apps,
    "counts": counts,
    "statuses": TRACKER_STATUSES,
    "source_options": sources,
  })


@tracker_blueprint.get("/tracker/api/flow")
def tracker_flow_data():
  ensure_database()
  source = (request.args.get("source") or "").strip()
  days = (request.args.get("days") or "all").strip().lower()

  try:
    applied_from = _resolve_applied_from(days)
  except ValueError as exc:
    return jsonify({"error": str(exc)}), 400

  flow_data = flow_overview(
    TRACKER_STATUSES,
    source=source or None,
    applied_from=applied_from,
  )
  return jsonify(flow_data)


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


@tracker_blueprint.delete("/tracker/api/applications/<int:application_id>")
def tracker_delete_application(application_id):
  ensure_database()
  deleted = delete_application(application_id)

  if not deleted:
    return jsonify({"error": "Application not found"}), 404

  return jsonify({"ok": True, "deleted_id": application_id})


@tracker_blueprint.route("/tracker/api/ingest", methods=["OPTIONS"])
def tracker_ingest_options():
  return _corsify(make_response("", 204))


@tracker_blueprint.post("/tracker/api/ingest")
def tracker_ingest_application():
  ensure_database()
  configured_token = get_extension_token()

  if not configured_token:
    response = jsonify({"error": "Server ingest token is not configured"})
    return _corsify(response), 503

  request_token = _extract_bearer_token()
  if not request_token or request_token != configured_token:
    response = jsonify({"error": "Unauthorized ingest token"})
    return _corsify(response), 401

  payload = request.get_json(silent=True) or {}
  try:
    normalized = normalize_external_payload(payload)
  except ValueError as exc:
    response = jsonify({"error": str(exc)})
    return _corsify(response), 400

  application = normalized["application"]
  confidence = normalized["confidence"]
  apply_signal = normalized["apply_signal"]
  confirmed_by_user = normalized["confirmed_by_user"]
  min_confidence = get_ingest_min_confidence()

  if not apply_signal and not confirmed_by_user:
    response = jsonify({
      "error": "Missing apply confirmation signal",
      "needs_confirmation": True,
    })
    return _corsify(response), 422

  if confidence < min_confidence and not confirmed_by_user:
    response = jsonify({
      "status": "needs_confirmation",
      "confidence": confidence,
      "threshold": min_confidence,
      "application_preview": application,
    })
    return _corsify(response), 202

  existing = get_application_by_dedupe_key(application["dedupe_key"])
  if existing:
    response = jsonify({
      "status": "duplicate",
      "application": existing,
      "confidence": confidence,
    })
    return _corsify(response), 200

  event_note = f"Auto-ingested from extension; signal={apply_signal or 'manual_confirmed'}; confidence={confidence:.2f}"
  created = create_application(
    application,
    event_type="auto_ingest",
    event_note=event_note,
  )
  response = jsonify({
    "status": "created",
    "application": created,
    "confidence": confidence,
  })
  return _corsify(response), 201
