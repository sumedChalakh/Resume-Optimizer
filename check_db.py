import sys
from app import create_app
from extensions import db
from sqlalchemy import text

app = create_app()
try:
    with app.app_context():
        with db.engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("DATABASE CONNECTION SUCCESSFUL")
            print("URL:", app.config['SQLALCHEMY_DATABASE_URI'])
except Exception as e:
    print("DATABASE CONNECTION FAILED")
    print("Error:", str(e))
