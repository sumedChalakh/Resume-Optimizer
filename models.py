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
    resume_text = db.Column(db.Text, nullable=True)
    plan = db.Column(db.String(50), default='free', nullable=False)
    stripe_customer_id = db.Column(db.String(255), nullable=True)
    subscription_active = db.Column(db.Boolean, default=False, nullable=False)
    api_credits = db.Column(db.Integer, default=2, nullable=False)
    
    # Activity metrics telemetry
    resumes_created = db.Column(db.Integer, default=0, nullable=False)
    resumes_optimized = db.Column(db.Integer, default=0, nullable=False)
    resumes_downloaded = db.Column(db.Integer, default=0, nullable=False)
    mock_interviews = db.Column(db.Integer, default=0, nullable=False)


class TrackerBoard(db.Model):
    __tablename__ = 'boards'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.current_timestamp())

    user = db.relationship('User', backref=db.backref('boards', lazy=True, cascade="all, delete-orphan"))


class TrackerApplication(db.Model):
    __tablename__ = 'applications'
    __table_args__ = (db.UniqueConstraint('user_id', 'dedupe_key', name='_user_dedupe_uc'),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    board_id = db.Column(db.Integer, db.ForeignKey('boards.id'), nullable=False, default=1)
    title = db.Column(db.String(200), nullable=False)
    company = db.Column(db.String(200), nullable=False)
    location = db.Column(db.String(200), default='')
    job_url = db.Column(db.String(500), default='')
    source = db.Column(db.String(100), default='')
    status = db.Column(db.String(50), nullable=False, default='applied')
    applied_date = db.Column(db.String(50), nullable=False)
    dedupe_key = db.Column(db.String(100), nullable=False)
    notes = db.Column(db.Text, default='')
    archived = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, server_default=db.func.current_timestamp())
    updated_at = db.Column(db.DateTime, server_default=db.func.current_timestamp(), onupdate=db.func.current_timestamp())

    user = db.relationship('User', backref=db.backref('applications', lazy=True, cascade="all, delete-orphan"))
    board = db.relationship('TrackerBoard', backref=db.backref('applications', lazy=True, cascade="all, delete-orphan"), foreign_keys=[board_id])


class TrackerApplicationEvent(db.Model):
    __tablename__ = 'application_events'
    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey('applications.id', ondelete="CASCADE"), nullable=False)
    event_type = db.Column(db.String(100), nullable=False)
    event_note = db.Column(db.Text, default='')
    event_at = db.Column(db.DateTime, server_default=db.func.current_timestamp())

    application = db.relationship('TrackerApplication', backref=db.backref('events', lazy=True, cascade="all, delete-orphan"))


class InterviewSession(db.Model):
    __tablename__ = 'interview_sessions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete="CASCADE"), nullable=False)
    job_title = db.Column(db.String(150), nullable=False)
    interview_type = db.Column(db.String(50), default='Mixed', nullable=False)
    difficulty = db.Column(db.String(50), default='Mid', nullable=False)
    score = db.Column(db.Integer, nullable=True)
    feedback = db.Column(db.Text, nullable=True)
    history = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('interview_sessions', lazy=True, cascade="all, delete-orphan"))


class SharedResume(db.Model):
    __tablename__ = 'shared_resumes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete="CASCADE"), nullable=False)
    custom_slug = db.Column(db.String(100), unique=True, index=True, nullable=False)
    resume_data_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    user = db.relationship('User', backref=db.backref('shared_resumes', lazy=True, cascade="all, delete-orphan"))


class ResumeAnalytics(db.Model):
    __tablename__ = 'resume_analytics'
    id = db.Column(db.Integer, primary_key=True)
    shared_resume_id = db.Column(db.Integer, db.ForeignKey('shared_resumes.id', ondelete="CASCADE"), nullable=False)
    viewed_at = db.Column(db.DateTime, default=datetime.utcnow)
    ip_address = db.Column(db.String(100), nullable=True)
    location = db.Column(db.String(255), default='Unknown Location', nullable=False)
    user_agent = db.Column(db.Text, nullable=True)
    referrer = db.Column(db.Text, nullable=True)

    shared_resume = db.relationship('SharedResume', backref=db.backref('analytics', lazy=True, cascade="all, delete-orphan"))
