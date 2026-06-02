import json
import re
import urllib.request
import urllib.parse
from datetime import datetime
from flask import Blueprint, render_template, request, jsonify, abort, session, redirect
from extensions import db
from models import User, SharedResume, ResumeAnalytics

share_blueprint = Blueprint('share', __name__)

def resolve_ip_location(ip):
    """
    Query a public free API to resolve IP to location (City, Country).
    Falls back to dev tags or Unknown Location.
    """
    if not ip or ip in ('127.0.0.1', 'localhost', '::1'):
        return "Localhost (Dev)"
    
    # Try resolving via ip-api.com
    try:
        url = f"http://ip-api.com/json/{ip}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data.get('status') == 'success':
                city = data.get('city')
                country = data.get('country')
                if city and country:
                    return f"{city}, {country}"
                elif country:
                    return country
    except Exception as e:
        print(f"IP GeoIP resolution failed for {ip}: {e}")
        
    return "Unknown Location"

@share_blueprint.route("/share/<slug>", methods=["GET"])
def public_resume_view(slug):
    # Find active shared resume
    shared = SharedResume.query.filter_by(custom_slug=slug).first()
    if not shared or not shared.is_active:
        abort(404)
    
    # Track analytics hit
    try:
        # Determine client IP (considering forwarders/proxies)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.remote_addr
            
        user_agent = request.headers.get("User-Agent", "Unknown Browser")
        referrer = request.headers.get("Referer", "Direct link / Bookmark")
        
        location = resolve_ip_location(ip)
        
        hit = ResumeAnalytics(
            shared_resume_id=shared.id,
            ip_address=ip,
            location=location,
            user_agent=user_agent,
            referrer=referrer
        )
        db.session.add(hit)
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        print(f"Failed to record resume view analytics: {ex}")
        
    # Deserialize resume data
    try:
        resume_data = json.loads(shared.resume_data_json)
    except Exception:
        abort(500)
        
    return render_template("share_view.html", resume=resume_data, slug=slug)

@share_blueprint.route("/share-dashboard", methods=["GET"])
def share_dashboard():
    user_id = session.get('user_id')
    if not user_id:
        return redirect("/login")
        
    user = db.session.get(User, user_id)
    if not user:
        return redirect("/login")
        
    # Get all shared links for this user
    shared_links = SharedResume.query.filter_by(user_id=user.id).order_by(SharedResume.created_at.desc()).all()
    
    # Prepare list with click counts
    links_data = []
    for link in shared_links:
        analytics_count = ResumeAnalytics.query.filter_by(shared_resume_id=link.id).count()
        links_data.append({
            "id": link.id,
            "custom_slug": link.custom_slug,
            "is_active": link.is_active,
            "created_at": link.created_at.strftime("%Y-%m-%d %H:%M"),
            "views": analytics_count
        })
        
    return render_template("share_dashboard.html", links=links_data)

@share_blueprint.route("/share/api/create", methods=["POST"])
def share_create():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json(silent=True) or {}
    slug = data.get("slug", "").strip()
    resume_data = data.get("resume_data")
    
    if not slug:
        return jsonify({"error": "Custom URL slug is required."}), 400
    if not resume_data:
        return jsonify({"error": "Resume data is required."}), 400
        
    # Standardize slug (slugify format)
    slug = re.sub(r'[^a-zA-Z0-9\-]', '', slug.replace(' ', '-')).lower()
    if len(slug) < 3:
        return jsonify({"error": "URL slug must be at least 3 alphanumeric characters."}), 400
        
    # Check if slug is already taken by another link
    existing = SharedResume.query.filter_by(custom_slug=slug).first()
    if existing and existing.user_id != user_id:
        return jsonify({"error": f"URL slug '{slug}' is already taken. Please choose a different one."}), 409
        
    try:
        resume_data_str = json.dumps(resume_data)
        
        if existing:
            # Update existing link
            existing.resume_data_json = resume_data_str
            existing.created_at = datetime.utcnow() # Reset update date
            existing.is_active = True
            db.session.commit()
            return jsonify({
                "message": "Public resume updated successfully!",
                "slug": slug,
                "url": f"/share/{slug}"
            })
        else:
            # Create new shared link
            new_share = SharedResume(
                user_id=user_id,
                custom_slug=slug,
                resume_data_json=resume_data_str,
                is_active=True
            )
            db.session.add(new_share)
            db.session.commit()
            return jsonify({
                "message": "Public resume shared successfully!",
                "slug": slug,
                "url": f"/share/{slug}"
            })
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500

@share_blueprint.route("/share/api/toggle", methods=["POST"])
def share_toggle():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json(silent=True) or {}
    link_id = data.get("id")
    
    if not link_id:
        return jsonify({"error": "Link ID is required."}), 400
        
    link = db.session.get(SharedResume, link_id)
    if not link or link.user_id != user_id:
        return jsonify({"error": "Shared link not found."}), 404
        
    try:
        link.is_active = not link.is_active
        db.session.commit()
        return jsonify({
            "message": "Link toggled successfully!",
            "is_active": link.is_active
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@share_blueprint.route("/share/api/analytics/<int:link_id>", methods=["GET"])
def share_analytics(link_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    link = db.session.get(SharedResume, link_id)
    if not link or link.user_id != user_id:
        return jsonify({"error": "Link not found"}), 404
        
    # Gather logs
    analytics = ResumeAnalytics.query.filter_by(shared_resume_id=link.id).order_by(ResumeAnalytics.viewed_at.desc()).all()
    
    # Process analytics for charts
    view_history = []
    locations = {}
    referrers = {}
    
    for hit in analytics:
        date_str = hit.viewed_at.strftime("%Y-%m-%d")
        view_history.append(date_str)
        
        loc = hit.location or "Unknown Location"
        locations[loc] = locations.get(loc, 0) + 1
        
        ref = hit.referrer or "Direct link / Bookmark"
        # Simplify referrer URL for clean display
        if ref.startswith("http"):
            try:
                parsed = urllib.parse.urlparse(ref)
                ref = parsed.netloc
            except Exception:
                pass
        referrers[ref] = referrers.get(ref, 0) + 1

    # Date counts
    from collections import Counter
    history_counts = dict(Counter(view_history))
    sorted_history = sorted([{"date": d, "views": c} for d, c in history_counts.items()], key=lambda x: x["date"])
    
    top_locations = sorted([{"location": l, "count": c} for l, c in locations.items()], key=lambda x: x["count"], reverse=True)[:5]
    top_referrers = sorted([{"referrer": r, "count": c} for r, c in referrers.items()], key=lambda x: x["count"], reverse=True)[:5]
    
    recent_logs = []
    for hit in analytics[:15]:
        recent_logs.append({
            "timestamp": hit.viewed_at.strftime("%Y-%m-%d %H:%M:%S"),
            "ip": hit.ip_address or "Unknown",
            "location": hit.location or "Unknown",
            "referrer": hit.referrer or "Direct link / Bookmark",
            "user_agent": hit.user_agent[:60] + "..." if hit.user_agent and len(hit.user_agent) > 60 else (hit.user_agent or "Unknown")
        })
        
    return jsonify({
        "slug": link.custom_slug,
        "total_views": len(analytics),
        "history": sorted_history,
        "top_locations": top_locations,
        "top_referrers": top_referrers,
        "recent_logs": recent_logs
    })
