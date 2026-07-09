import os

from app import app

if __name__ == "__main__":
    debug_raw = os.getenv("FLASK_DEBUG", "0").strip().lower()
    debug_enabled = debug_raw in {"1", "true", "yes", "on"}
    try:
        port = int(os.getenv("PORT", "5000"))
    except ValueError:
        port = 5000

    if debug_enabled:
        # Dev mode: use Flask's built-in server with hot-reload
        app.run(host="0.0.0.0", debug=True, port=port)
    else:
        # Production mode: use Waitress (no warning, multi-threaded)
        from waitress import serve
        print(f" * Serving on http://127.0.0.1:{port} (Waitress)")
        print(f" * Press Ctrl+C to stop")
        serve(app, host="0.0.0.0", port=port, threads=8)
