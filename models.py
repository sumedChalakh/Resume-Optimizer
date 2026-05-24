from datetime import datetime
from extensions import db
from flask_login import UserMixin


class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), default='user', nullable=False)


class TrackerApplication(db.Model):
    __tablename__ = 'applications'
    __table_args__ = (db.UniqueConstraint('user_id', 'dedupe_key', name='_user_dedupe_uc'),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    company = db.Column(db.String(200), nullable=False)
    location = db.Column(db.String(200), default='')
    job_url = db.Column(db.String(500), default='')
    source = db.Column(db.String(100), default='')
    status = db.Column(db.String(50), nullable=False, default='applied')
    applied_date = db.Column(db.String(50), nullable=False)
    dedupe_key = db.Column(db.String(100), nullable=False)
    notes = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, server_default=db.func.current_timestamp())
    updated_at = db.Column(db.DateTime, server_default=db.func.current_timestamp(), onupdate=db.func.current_timestamp())

    user = db.relationship('User', backref=db.backref('applications', lazy=True, cascade="all, delete-orphan"))


class TrackerApplicationEvent(db.Model):
    __tablename__ = 'application_events'
    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey('applications.id', ondelete="CASCADE"), nullable=False)
    event_type = db.Column(db.String(100), nullable=False)
    event_note = db.Column(db.Text, default='')
    event_at = db.Column(db.DateTime, server_default=db.func.current_timestamp())

    application = db.relationship('TrackerApplication', backref=db.backref('events', lazy=True, cascade="all, delete-orphan"))
