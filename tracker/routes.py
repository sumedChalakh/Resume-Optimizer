from datetime import date, timedelta
from hmac import compare_digest

from flask import Blueprint, jsonify, make_response, render_template, request, session

from .config import (
  TRACKER_STATUSES,
  get_extension_token,
  get_ingest_cors_origin,
  get_ingest_min_confidence,
  get_status_set,
)
from .repository import (
  create_application,
  delete_application,
  flow_overview,
  get_application_by_dedupe_key,
  list_applications,
  list_sources,
  update_application_status,
  list_boards,
  create_board,
  rename_board,
  delete_board,
  archive_application,
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
  response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
  return response


def _extract_bearer_token():
  auth_header = (request.headers.get("Authorization") or "").strip()
  if auth_header.lower().startswith("bearer "):
    return auth_header[7:].strip()
  fallback = (request.headers.get("X-Tracker-Token") or "").strip()
  return fallback


def _get_user_id():
  return session.get('user_id')


@tracker_blueprint.get("/tracker")
def tracker_board():
  return render_template("tracker_board.html", statuses=TRACKER_STATUSES)


@tracker_blueprint.get("/tracker/api/health")
def tracker_health():
  return jsonify({
    "ok": True,
    "module": "tracker",
    "phase": 4,
    "database_type": "sqlalchemy",
    "tracker_features": [
      "board",
      "ingest",
      "insights",
      "flow",
      "filters",
      "exports",
      "auth"
    ],
  })


@tracker_blueprint.get("/tracker/api/applications")
def tracker_list_applications():
  user_id = _get_user_id()
  if not user_id:
    return jsonify({"error": "Unauthorized"}), 401

  status = (request.args.get("status") or "").strip().lower()
  search = (request.args.get("q") or "").strip()
  source = (request.args.get("source") or "").strip()
  days = (request.args.get("days") or "all").strip().lower()

  board_id_raw = request.args.get("board_id")
  board_id = int(board_id_raw) if board_id_raw and board_id_raw.isdigit() else None
  archived = request.args.get("archived") == "true"

  if status and status not in get_status_set():
    return jsonify({"error": "Invalid status filter"}), 400

  try:
    applied_from = _resolve_applied_from(days)
  except ValueError as exc:
    return jsonify({"error": str(exc)}), 400

  apps = list_applications(
    user_id=user_id,
    status=status or None,
    search=search or None,
    source=source or None,
    applied_from=applied_from,
    board_id=board_id,
    archived=archived,
  )
  
  from .repository import dashboard_counts
  counts_db = dashboard_counts(user_id=user_id, board_id=board_id, archived=archived)
  counts = {st: counts_db.get(st, 0) for st in TRACKER_STATUSES}
  
  sources = list_sources(user_id=user_id, board_id=board_id, archived=archived)
  return jsonify({
    "applications": apps,
    "counts": counts,
    "statuses": TRACKER_STATUSES,
    "source_options": sources,
  })


@tracker_blueprint.get("/tracker/api/flow")
def tracker_flow_data():
  user_id = _get_user_id()
  if not user_id:
    return jsonify({"error": "Unauthorized"}), 401

  source = (request.args.get("source") or "").strip()
  days = (request.args.get("days") or "all").strip().lower()

  board_id_raw = request.args.get("board_id")
  board_id = int(board_id_raw) if board_id_raw and board_id_raw.isdigit() else None

  try:
    applied_from = _resolve_applied_from(days)
  except ValueError as exc:
    return jsonify({"error": str(exc)}), 400

  flow_data = flow_overview(
    TRACKER_STATUSES,
    user_id=user_id,
    source=source or None,
    applied_from=applied_from,
    board_id=board_id,
  )
  return jsonify(flow_data)


@tracker_blueprint.post("/tracker/api/applications")
def tracker_create_application():
  user_id = _get_user_id()
  if not user_id:
    return jsonify({"error": "Unauthorized"}), 401

  payload = request.get_json(silent=True) or {}

  try:
    cleaned = validate_and_normalize(payload)
  except ValueError as exc:
    return jsonify({"error": str(exc)}), 400

  existing = get_application_by_dedupe_key(cleaned["dedupe_key"], user_id)
  if existing:
    return jsonify({"error": "Application already tracked", "application": existing}), 409

  created = create_application(cleaned, user_id)
  return jsonify({"application": created}), 201


@tracker_blueprint.patch("/tracker/api/applications/<int:application_id>/status")
def tracker_patch_status(application_id):
  user_id = _get_user_id()
  if not user_id:
    return jsonify({"error": "Unauthorized"}), 401

  payload = request.get_json(silent=True) or {}
  status = str(payload.get("status", "")).strip().lower()

  if status not in get_status_set():
    return jsonify({"error": "Invalid status"}), 400

  updated = update_application_status(application_id, status, user_id)
  if not updated:
    return jsonify({"error": "Application not found"}), 404

  return jsonify({"application": updated})


@tracker_blueprint.delete("/tracker/api/applications/<int:application_id>")
def tracker_delete_application(application_id):
  user_id = _get_user_id()
  if not user_id:
    return jsonify({"error": "Unauthorized"}), 401

  deleted = delete_application(application_id, user_id)

  if not deleted:
    return jsonify({"error": "Application not found"}), 404

  return jsonify({"ok": True, "deleted_id": application_id})


@tracker_blueprint.route("/tracker/api/ingest", methods=["OPTIONS"])
def tracker_ingest_options():
  return _corsify(make_response("", 204))


@tracker_blueprint.post("/tracker/api/ingest")
def tracker_ingest_application():
  configured_token = get_extension_token()

  if not configured_token:
    response = jsonify({"error": "Server ingest token is not configured"})
    return _corsify(response), 503

  request_token = _extract_bearer_token()
  if not request_token or not compare_digest(request_token, configured_token):
    response = jsonify({"error": "Unauthorized ingest token"})
    return _corsify(response), 401

  user_id = _get_user_id()
  if not user_id:
    user_id = 1 # Fallback to user 1 for extension payloads without session

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

  existing = get_application_by_dedupe_key(application["dedupe_key"], user_id)
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
    user_id,
    event_type="auto_ingest",
    event_note=event_note,
  )
  response = jsonify({
    "status": "created",
    "application": created,
    "confidence": confidence,
  })
  return _corsify(response), 201


@tracker_blueprint.post("/tracker/api/parse-email")
def tracker_parse_email():
  user_id = _get_user_id()
  if not user_id:
    return jsonify({"error": "Unauthorized"}), 401

  from extensions import db
  from models import User
  user = db.session.get(User, user_id)
  if user and user.plan == "free":
    return jsonify({
      "error": "Upgrade Required",
      "message": "Simulated email parse status tracking is restricted to Pro & Premium levels. Please upgrade your plan to unlock automated CRM updates!",
      "tier_restricted": True
    }), 403

  payload = request.get_json(silent=True) or {}
  subject = str(payload.get("subject", "")).strip()
  body = str(payload.get("body", "")).strip()
  sender = str(payload.get("sender", "")).strip()

  if not subject or not body:
    return jsonify({"error": "Email subject and body are required"}), 400

  parsed_data = None
  provider = "fallback"

  # 1. Try to use active AI LLM model first
  try:
    from app import generate_model_response
    import json
    
    prompt = f"""You are an AI recruiting assistant. Your task is to analyze an incoming recruitment email (subject, sender, body) and extract:
1. The company name (e.g. "Google", "Stripe", "Netflix").
2. The current recruitment stage mapping to one of these exact statuses:
   - "saved" (use only if no active application exists and they are just discussing matching opportunities)
   - "applied" (use if it is a standard confirmation of application submission, e.g., "Thank you for applying")
   - "screen" (use if they want to schedule a quick initial chat, HR screening, online assessment, or test)
   - "interview" (use if they invite the candidate for full interviews, technical rounds, loops, panel rounds, or on-sites)
   - "offer" (use if they extend an official job offer or are discussing offer details/compensation)
   - "rejected" (use if they reject the application or state they are not moving forward)
3. A short, high-level summary of the email (1-2 sentences max).
4. The estimated role/job title from the email.

Response format: Return ONLY a valid JSON object with the following keys, and nothing else (no markdown wrappers, no backticks, no comments):
{{
  "company": "Company Name",
  "status": "applied" | "screen" | "interview" | "offer" | "rejected" | "saved",
  "job_title": "Job Title or Null",
  "summary": "Short explanation of the update."
}}"""

    user_message = f"Sender: {sender}\nSubject: {subject}\nBody:\n{body}"
    raw_response, model_prov = generate_model_response(user_message, system_prompt=prompt)
    
    # Strip any markdown triple backticks
    clean_raw = raw_response.strip()
    if clean_raw.startswith("```"):
      # remove first line
      lines = clean_raw.splitlines()
      if lines[0].startswith("```"):
        lines = lines[1:]
      if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
      clean_raw = "\n".join(lines).strip()
      
    parsed_json = json.loads(clean_raw)
    
    # Validate keys and status
    valid_statuses = get_status_set()
    parsed_status = str(parsed_json.get("status", "applied")).strip().lower()
    if parsed_status not in valid_statuses:
      parsed_status = "applied"
      
    parsed_data = {
      "company": str(parsed_json.get("company", "Company")).strip(),
      "status": parsed_status,
      "job_title": parsed_json.get("job_title"),
      "summary": str(parsed_json.get("summary", "")).strip()
    }
    provider = f"ai ({model_prov})"
  except Exception as exc:
    print(f"Email parser AI failed, using robust rule-based fallback: {exc}")

  # 2. Hybrid Keyword Fallback Parser
  if not parsed_data:
    import re
    subject_lower = subject.lower()
    body_lower = body.lower()
    sender_lower = sender.lower()
    
    # Determine Status
    status = "applied"
    
    if any(k in subject_lower or k in body_lower for k in [
      "not moving forward", "unfortunate", "pursue other", "thank you for your interest",
      "decided to move", "other candidates", "regret to inform", "not selected", "unable to move", "decided not to"
    ]):
      status = "rejected"
    elif any(k in subject_lower or k in body_lower for k in [
      "offer letter", "official offer", "pleased to offer", "compensation details",
      "verbal offer", "offer details"
    ]):
      status = "offer"
    elif any(k in subject_lower or k in body_lower for k in [
      "interview invite", "technical interview", "panel interview", "schedule an interview",
      "invite you to interview", "round 1", "round 2", "onsite interview", "on-site loop", "chat with the team"
    ]):
      status = "interview"
    elif any(k in subject_lower or k in body_lower for k in [
      "technical screening", "hr chat", "screening call", "quick chat", "phone screen",
      "online assessment", "hackerrank", "coderpad", "codility", "assessment link", "coding test"
    ]):
      status = "screen"
    elif any(k in subject_lower or k in body_lower for k in [
      "application received", "thank you for applying", "confirming receipt", "successfully submitted",
      "applied to"
    ]):
      status = "applied"
      
    # Extract Company
    company = "Company"
    domain_match = re.search(r"@([a-zA-Z0-9.-]+)\.[a-zA-Z]{2,}", sender_lower)
    if domain_match:
      domain = domain_match.group(1)
      if domain not in ["gmail", "yahoo", "outlook", "hotmail", "protonmail", "mail", "icloud", "zoho", "googlemail"]:
        parts = domain.split(".")
        if len(parts) > 1 and parts[0] in ["mail", "careers", "jobs", "recruiting", "talent", "member", "notifications"]:
          company = parts[1].capitalize()
        else:
          company = parts[0].capitalize()
          
    if company == "Company":
      # Try to extract from subject line
      for word in subject.split():
        clean_word = re.sub(r"[^\w]", "", word)
        if clean_word.lower() not in ["application", "update", "status", "at", "for", "the", "recruitment", "careers", "jobs", "your", "with", "interview", "offer"]:
          company = clean_word
          break
          
    summary = f"Parsed recruitment email: '{subject}'"
    if status == "rejected":
      summary = f"Received application update from {company}. Not moving forward at this time."
    elif status == "offer":
      summary = f"Exciting news! Official offer details received from {company}."
    elif status == "interview":
      summary = f"Invited to schedule the next interview rounds with {company}."
    elif status == "screen":
      summary = f"Invited to complete an assessment or initial screening chat for {company}."
    elif status == "applied":
      summary = f"Confirmed application receipt from {company}."
      
    job_title = None
    job_keywords = ["engineer", "developer", "designer", "scientist", "manager", "analyst", "consultant", "lead"]
    for line in (subject + "\n" + body).splitlines():
      if any(keyword in line.lower() for keyword in job_keywords):
        job_title = line.strip()[:60]
        break
        
    parsed_data = {
      "company": company,
      "status": status,
      "job_title": job_title,
      "summary": summary
    }

  # 3. Match against user's applications in database
  apps = list_applications(user_id=user_id)
  matched_app = None
  
  parsed_company_lower = parsed_data["company"].lower()
  
  for a in apps:
    app_company_lower = str(a.get("company", "")).lower()
    if parsed_company_lower in app_company_lower or app_company_lower in parsed_company_lower:
      matched_app = a
      break
      
  updated_app = None
  if matched_app:
    # Update the status in database
    event_note = f"Email Parse Match ({provider}): {parsed_data['summary']}\nSubject: {subject}"
    updated_app = update_application_status(
      application_id=matched_app["id"],
      status=parsed_data["status"],
      user_id=user_id,
      event_note=event_note
    )
    
  return jsonify({
    "matched": bool(matched_app),
    "application": updated_app,
    "parsed": parsed_data,
    "provider": provider
  }), 200


@tracker_blueprint.get("/tracker/api/boards")
def tracker_list_boards():
  user_id = _get_user_id()
  if not user_id:
    return jsonify({"error": "Unauthorized"}), 401
  return jsonify({"boards": list_boards(user_id)})


@tracker_blueprint.post("/tracker/api/boards")
def tracker_create_board():
  user_id = _get_user_id()
  if not user_id:
    return jsonify({"error": "Unauthorized"}), 401
  
  payload = request.get_json(silent=True) or {}
  name = str(payload.get("name", "")).strip()
  if not name:
    return jsonify({"error": "Board name is required"}), 400
    
  board = create_board(user_id, name)
  return jsonify({"board": board}), 201


@tracker_blueprint.patch("/tracker/api/boards/<int:board_id>")
def tracker_rename_board(board_id):
  user_id = _get_user_id()
  if not user_id:
    return jsonify({"error": "Unauthorized"}), 401
    
  payload = request.get_json(silent=True) or {}
  name = str(payload.get("name", "")).strip()
  if not name:
    return jsonify({"error": "Board name is required"}), 400
    
  board = rename_board(board_id, name, user_id)
  if not board:
    return jsonify({"error": "Board not found"}), 404
  return jsonify({"board": board})


@tracker_blueprint.delete("/tracker/api/boards/<int:board_id>")
def tracker_delete_board(board_id):
  user_id = _get_user_id()
  if not user_id:
    return jsonify({"error": "Unauthorized"}), 401
    
  try:
    deleted = delete_board(board_id, user_id)
    if not deleted:
      return jsonify({"error": "Board not found"}), 404
    return jsonify({"ok": True, "deleted_id": board_id})
  except ValueError as exc:
    return jsonify({"error": str(exc)}), 400


@tracker_blueprint.post("/tracker/api/applications/<int:application_id>/archive")
def tracker_archive_application(application_id):
  user_id = _get_user_id()
  if not user_id:
    return jsonify({"error": "Unauthorized"}), 401
    
  payload = request.get_json(silent=True) or {}
  archived = bool(payload.get("archived", False))
  
  updated = archive_application(application_id, archived, user_id)
  if not updated:
    return jsonify({"error": "Application not found"}), 404
  return jsonify({"application": updated})


@tracker_blueprint.route("/tracker/api/autofill-profile", methods=["GET", "OPTIONS"])
def tracker_get_autofill_profile():
  if request.method == "OPTIONS":
    return _corsify(make_response("", 204))
    
  configured_token = get_extension_token()
  request_token = _extract_bearer_token()
  
  user_id = _get_user_id()
  if not user_id and request_token and compare_digest(request_token, configured_token or ""):
    user_id = 1
    
  if not user_id:
    response = jsonify({"error": "Unauthorized"})
    return _corsify(response), 401
    
  from extensions import db
  from models import User
  
  user = db.session.get(User, user_id)
  if not user:
    response = jsonify({"error": "User not found"})
    return _corsify(response), 404
    
  if user.plan == "free":
    response = jsonify({
      "error": "Upgrade Required",
      "message": "Autofill profile sync is restricted to Pro & Premium levels. Please upgrade your plan to unlock full automated applicant options!",
      "tier_restricted": True
    })
    return _corsify(response), 403
    
  names = (user.name or "").split()
  first_name = names[0] if names else ""
  last_name = " ".join(names[1:]) if len(names) > 1 else ""
  
  profile = {
    "firstName": first_name,
    "lastName": last_name,
    "email": user.email,
    "phone": "",
    "website": "",
    "linkedin": "",
    "github": "",
    "city": "",
    "country": ""
  }
  
  response = jsonify({"profile": profile})
  return _corsify(response)


@tracker_blueprint.route("/tracker/api/match-score", methods=["POST", "OPTIONS"])
def tracker_match_score():
  if request.method == "OPTIONS":
    return _corsify(make_response("", 204))
    
  configured_token = get_extension_token()
  request_token = _extract_bearer_token()
  
  user_id = _get_user_id()
  if not user_id and request_token and compare_digest(request_token, configured_token or ""):
    user_id = 1
    
  if not user_id:
    response = jsonify({"error": "Unauthorized"})
    return _corsify(response), 401
    
  payload = request.get_json(silent=True) or {}
  jd_text = str(payload.get("jd", "")).strip()
  if not jd_text:
    response = jsonify({"error": "Job description is required"})
    return _corsify(response), 400
    
  from extensions import db
  from models import User
  
  user = db.session.get(User, user_id)
  if not user or not user.resume_text:
    response = jsonify({
      "score": 0,
      "matched": [],
      "missing": [],
      "error": "No resume uploaded yet"
    })
    return _corsify(response), 200
    
  from utils.ats_scorer import calculate_advanced_ats_score
  
  # Calculate accurate matching score using unified scorer engine
  score_details = calculate_advanced_ats_score(
      resume_text=user.resume_text,
      jd_text=jd_text,
      low_credit_mode=False
  )
  
  response = jsonify({
      "score": score_details["total"],
      "matched": score_details["keyword_analysis"]["matched_in_resume"],
      "missing": score_details["keyword_analysis"]["missing_keywords"]
  })
  return _corsify(response)


