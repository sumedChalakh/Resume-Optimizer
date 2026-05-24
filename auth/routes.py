import os
import secrets

import requests
from flask import Blueprint, request, jsonify, session, render_template, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from models import User
from extensions import db

auth_blueprint = Blueprint('auth', __name__)

GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_OAUTH_SCOPE = "openid email profile"


def _google_oidc_config():
    response = requests.get(GOOGLE_DISCOVERY_URL, timeout=15)
    response.raise_for_status()
    return response.json()


def _google_redirect_uri():
    return url_for("auth.google_callback", _external=True)


@auth_blueprint.post('/auth/signup')
def auth_signup():
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not name or not email or not password:
        return jsonify({"error": "Missing fields"}), 400

    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({"error": "Email already registered"}), 409

    new_user = User(
        name=name,
        email=email,
        password_hash=generate_password_hash(password)
    )
    db.session.add(new_user)
    db.session.commit()

    session['user_id'] = new_user.id
    return jsonify({"ok": True, "user": {"id": new_user.id, "name": new_user.name, "email": new_user.email}})


@auth_blueprint.post('/auth/login')
def auth_login():
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password. This account may not be registered."}), 401

    session['user_id'] = user.id
    return jsonify({"ok": True, "user": {"id": user.id, "name": user.name, "email": user.email}})


@auth_blueprint.post('/auth/logout')
def auth_logout():
    session.pop('user_id', None)
    return jsonify({"ok": True})


@auth_blueprint.get('/auth/session')
def auth_session():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"authenticated": False})
    user = db.session.get(User, user_id)
    if not user:
        session.pop('user_id', None)
        return jsonify({"authenticated": False})
    return jsonify({"authenticated": True, "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role}})


@auth_blueprint.get('/api/admin/dashboard-stats')
def admin_dashboard_stats():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    user = db.session.get(User, user_id)
    if not user or user.role != 'admin':
        return jsonify({"error": "Forbidden"}), 403

    from models import TrackerApplication

    total_users = User.query.count()
    total_apps = TrackerApplication.query.count()
    recent_users = User.query.order_by(User.id.desc()).limit(5).all()

    return jsonify({
        "total_users": total_users,
        "total_applications": total_apps,
        "recent_users": [{"id": u.id, "name": u.name, "email": u.email, "role": u.role} for u in recent_users]
    })


@auth_blueprint.get('/login')
def login_page():
    return render_template("login.html")


@auth_blueprint.get('/auth/google/login')
def google_login():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return redirect(url_for('auth.login_page'))

    config = _google_oidc_config()
    state = secrets.token_urlsafe(32)
    session['google_oauth_state'] = state

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": _google_redirect_uri(),
        "response_type": "code",
        "scope": GOOGLE_OAUTH_SCOPE,
        "state": state,
        "prompt": "select_account",
    }
    authorization_url = requests.Request(
        "GET",
        config["authorization_endpoint"],
        params=params,
    ).prepare().url
    return redirect(authorization_url)


@auth_blueprint.get('/auth/google/callback')
def google_callback():
    if request.args.get('error'):
        return redirect(url_for('auth.login_page'))

    expected_state = session.pop('google_oauth_state', None)
    if not expected_state or request.args.get('state') != expected_state:
        return redirect(url_for('auth.login_page'))

    code = request.args.get('code', '').strip()
    if not code or not GOOGLE_CLIENT_SECRET:
        return redirect(url_for('auth.login_page'))

    try:
        config = _google_oidc_config()
        token_response = requests.post(
            config["token_endpoint"],
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": _google_redirect_uri(),
                "grant_type": "authorization_code",
            },
            timeout=15,
        )
        token_response.raise_for_status()
        token_data = token_response.json()

        access_token = token_data.get('access_token')
        if not access_token:
            return redirect(url_for('auth.login_page'))

        userinfo_response = requests.get(
            config["userinfo_endpoint"],
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        userinfo_response.raise_for_status()
        profile = userinfo_response.json()

        email = str(profile.get('email', '')).strip().lower()
        if not email or not profile.get('email_verified'):
            return redirect(url_for('auth.login_page'))

        display_name = (
            str(profile.get('name') or profile.get('given_name') or '').strip()
            or email.split('@', 1)[0]
        )

        user = User.query.filter_by(email=email).first()
        if user is None:
            user = User(
                name=display_name,
                email=email,
                password_hash=generate_password_hash(secrets.token_urlsafe(32)),
            )
            db.session.add(user)
            db.session.commit()

        session['user_id'] = user.id
        return redirect('/')
    except (requests.RequestException, ValueError, KeyError):
        db.session.rollback()
        return redirect(url_for('auth.login_page'))
