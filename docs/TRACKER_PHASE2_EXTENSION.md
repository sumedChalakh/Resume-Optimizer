# Tracker Phase 2: Auto Add via Browser Extension

## What is included
- Secure backend ingest endpoint: `POST /tracker/api/ingest`
- Token authentication for extension calls
- Confidence threshold gate before auto-save
- LinkedIn content detector (submit success signals)
- Extension popup for base URL + token settings

## Backend env setup
Add these to `.env` (or Render env vars):

TRACKER_EXTENSION_TOKEN=your-long-random-token
TRACKER_INGEST_CORS_ORIGIN=*
TRACKER_INGEST_MIN_CONFIDENCE=0.7

Notes:
- `TRACKER_EXTENSION_TOKEN` must match extension popup value.
- Use a strong token, do not share it.

## Load extension in Chrome/Brave
1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select folder: `browser_extension`
5. Open extension popup and configure:
   - Tracker Base URL: `http://127.0.0.1:5000` (local) or your Render URL
   - Ingest Token: same as `TRACKER_EXTENSION_TOKEN`
   - Enable auto add: checked

## Auto-add behavior
- Extension watches LinkedIn Jobs apply flow.
- On detected submit success, it sends payload to `/tracker/api/ingest`.
- Server outcomes:
  - `201 created`: added to tracker
  - `200 duplicate`: already exists
  - `202 needs_confirmation`: low confidence detection
  - `401`: bad token

## Quick local test
1. Run app:
   - `./resume/Scripts/python.exe app.py` on Windows PowerShell as `\.\resume\Scripts\python.exe app.py`
2. Open LinkedIn Jobs and complete an Easy Apply submit.
3. Open tracker page `/tracker` and verify new card appears in Applied.

## Current scope
- Implemented: LinkedIn-first auto-detection.
- Next expansion (Phase 2.1): Greenhouse, Lever, Workday detectors.
