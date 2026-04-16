# Tracker Phase 1 Structure (No app.py edits)

## Goal
Build a safe, modular Application Tracker MVP in separate files first.

## New Module Layout
- tracker/config.py: statuses and DB path settings
- tracker/database.py: SQLite connection and table creation
- tracker/service.py: input validation and dedupe key generation
- tracker/repository.py: DB queries and updates
- tracker/routes.py: Flask Blueprint routes (`/tracker` and `/tracker/api/*`)
- tracker/__init__.py: module exports

## UI Files
- templates/tracker_board.html: tracker board page
- static/css/tracker.css: tracker page styles
- static/js/tracker.js: add/list/update behavior

## API Endpoints (Phase 1)
- GET /tracker/api/health
- GET /tracker/api/applications
- POST /tracker/api/applications
- PATCH /tracker/api/applications/<id>/status

## Data Model (SQLite)
Table: applications
- id
- title
- company
- location
- job_url
- source
- status
- applied_date
- dedupe_key (UNIQUE)
- notes
- created_at
- updated_at

Table: application_events
- id
- application_id
- event_type
- event_note
- event_at

## Integration Step (later, single safe change)
When you approve, add this in app startup:
1. from tracker import tracker_blueprint, ensure_database
2. ensure_database()
3. app.register_blueprint(tracker_blueprint)

No existing optimizer route needs to be changed.

## Why this structure
- Keeps tracker concerns isolated from ATS optimizer logic
- Easy to test and evolve to extension sync in Phase 2
- Prevents accidental breakage in app.py during MVP build
