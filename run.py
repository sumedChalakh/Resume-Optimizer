from app import create_app
app = create_app()
import os

if __name__ == "__main__":
    debug_raw = os.getenv("FLASK_DEBUG", "0").strip().lower()
    debug_enabled = debug_raw in {"1", "true", "yes", "on"}
    try:
        port = int(os.getenv("PORT", "5000"))
    except ValueError:
        port = 5000
        
    app.run(host="0.0.0.0", debug=debug_enabled, port=port)
