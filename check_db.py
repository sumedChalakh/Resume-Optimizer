import sys
from app import app, db
from sqlalchemy import text

try:
    with app.app_context():
        with db.engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("DATABASE CONNECTION SUCCESSFUL")
            print("URL:", app.config['SQLALCHEMY_DATABASE_URI'])
except Exception as e:
    print("DATABASE CONNECTION FAILED")
    print("Error:", str(e))
