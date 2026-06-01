import os
import stripe
from flask import Blueprint, request, jsonify, session, redirect, make_response
from models import User
from extensions import db
from sqlalchemy import text

billing_blueprint = Blueprint('billing', __name__)

# Configure Stripe API keys with development fallbacks
STRIPE_API_KEY = os.getenv("STRIPE_API_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
STRIPE_PRICE_PRO = os.getenv("STRIPE_PRICE_PRO", "price_pro_mock_123").strip()
STRIPE_PRICE_PREMIUM = os.getenv("STRIPE_PRICE_PREMIUM", "price_premium_mock_456").strip()

if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY

def _corsify(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

@billing_blueprint.route("/billing/checkout", methods=["POST", "OPTIONS"])
def billing_checkout():
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user_id = session.get('user_id')
    # Support Authorization Header fallback for Chrome extension context
    auth_header = request.headers.get("Authorization", "")
    if not user_id and auth_header.startswith("Bearer "):
        # Simple bearer validation fallback (assuming token contains user_id for dev)
        try:
            token = auth_header.split()[1]
            # Simple conversion for development testing
            if token.isdigit():
                user_id = int(token)
        except Exception:
            pass

    if not user_id:
        # Fallback to user 1 for extension/development testing if none in context
        user_id = 1

    user = db.session.get(User, user_id)
    if not user:
        return _corsify(jsonify({"error": "User not found"})), 404

    payload = request.get_json(silent=True) or {}
    plan_tier = str(payload.get("plan", "pro")).lower().strip()
    if plan_tier not in ["pro", "premium"]:
        return _corsify(jsonify({"error": "Invalid pricing plan selected"})), 400

    # Stripe pricing Price IDs
    target_price_id = STRIPE_PRICE_PREMIUM if plan_tier == "premium" else STRIPE_PRICE_PRO

    # If Stripe is not fully configured, fall back to automatic developer sandbox checkouts
    if not STRIPE_API_KEY or STRIPE_API_KEY.startswith("sk_test_placeholder"):
        # Simulated Developer Sandbox Checkout
        # Automatically upgrade the user locally in the DB and return a success mock status
        user.plan = plan_tier
        user.subscription_active = True
        user.api_credits = 9999 if plan_tier == "premium" else 500
        db.session.commit()
        
        sandbox_url = f"http://127.0.0.1:5000/?sandbox_checkout_success=true&plan={plan_tier}"
        return _corsify(jsonify({
            "url": sandbox_url,
            "sandbox": True,
            "message": f"Successfully activated plan '{plan_tier}' in Developer Sandbox mode!"
        }))

    try:
        # Build success & cancel redirection URLs
        base_url = request.url_root.rstrip('/')
        success_url = f"{base_url}/?checkout_success=true&plan={plan_tier}"
        cancel_url = f"{base_url}/?checkout_cancelled=true"

        # Create Stripe Checkout Session
        checkout_session = stripe.checkout.Session.create(
            customer_email=user.email,
            payment_method_types=['card'],
            line_items=[
                {
                    'price': target_price_id,
                    'quantity': 1,
                },
            ],
            mode='subscription',
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                'user_id': str(user.id),
                'plan': plan_tier
            }
        )
        return _corsify(jsonify({"url": checkout_session.url, "sandbox": False}))
    except Exception as e:
        return _corsify(jsonify({"error": f"Stripe Checkout initiation failed: {str(e)}"})), 500


@billing_blueprint.route("/billing/webhook", methods=["POST"])
def billing_webhook():
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature')

    # Allow a local simulated event webhook call for developer validation
    dev_simulate = request.headers.get('X-Simulate-Webhook') == "true"
    if dev_simulate and (not STRIPE_API_KEY or dev_simulate):
        try:
            event_data = request.get_json(silent=True) or {}
            event_type = event_data.get("type")
            
            if event_type == "checkout.session.completed":
                session_obj = event_data.get("data", {}).get("object", {})
                meta = session_obj.get("metadata", {})
                user_id = meta.get("user_id")
                plan_tier = meta.get("plan", "pro")
                
                if user_id:
                    user = db.session.get(User, int(user_id))
                    if user:
                        user.plan = plan_tier
                        user.subscription_active = True
                        user.stripe_customer_id = session_obj.get("customer", "cus_mock_123")
                        user.api_credits = 9999 if plan_tier == "premium" else 500
                        db.session.commit()
                        return jsonify({"ok": True, "details": f"Simulated user {user_id} upgrade to {plan_tier} complete"})
            
            return jsonify({"ok": True, "message": "Simulated event unhandled or user missing"})
        except Exception as exc:
            db.session.rollback()
            return jsonify({"error": str(exc)}), 400

    if not sig_header or not STRIPE_WEBHOOK_SECRET:
        return jsonify({"error": "Webhook secret or signature missing"}), 400

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        return jsonify({"error": "Invalid payload"}), 400
    except stripe.error.SignatureVerificationError:
        return jsonify({"error": "Invalid signature"}), 400

    # Handle Stripe Webhook Events
    event_type = event.get("type")
    
    if event_type == "checkout.session.completed":
        session_obj = event.get("data", {}).get("object", {})
        meta = session_obj.get("metadata", {})
        user_id = meta.get("user_id")
        plan_tier = meta.get("plan", "pro")
        customer_id = session_obj.get("customer")
        
        if user_id:
            user = db.session.get(User, int(user_id))
            if user:
                user.plan = plan_tier
                user.subscription_active = True
                user.stripe_customer_id = customer_id
                user.api_credits = 9999 if plan_tier == "premium" else 500
                db.session.commit()
                
    elif event_type in ["customer.subscription.updated", "customer.subscription.deleted"]:
        subscription = event.get("data", {}).get("object", {})
        customer_id = subscription.get("customer")
        status = subscription.get("status")
        
        if customer_id:
            user = User.query.filter_by(stripe_customer_id=customer_id).first()
            if user:
                if event_type == "customer.subscription.deleted" or status in ["unpaid", "canceled", "incomplete_expired"]:
                    user.plan = "free"
                    user.subscription_active = False
                    user.api_credits = 2
                else:
                    user.subscription_active = True
                db.session.commit()

    return jsonify({"success": True})


@billing_blueprint.route("/billing/portal", methods=["GET"])
def billing_portal():
    user_id = session.get('user_id')
    if not user_id:
        return redirect("/login")

    user = db.session.get(User, user_id)
    if not user or not user.stripe_customer_id:
        return redirect("/#inputSection")

    if not STRIPE_API_KEY or STRIPE_API_KEY.startswith("sk_test_placeholder"):
        # Simulated Developer Sandbox Portal
        # Demote user back to free plan
        user.plan = "free"
        user.subscription_active = False
        user.api_credits = 2
        db.session.commit()
        return redirect("/?sandbox_portal_demoted=true")

    try:
        base_url = request.url_root.rstrip('/')
        portal_session = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=base_url,
        )
        return redirect(portal_session.url)
    except Exception:
        return redirect("/#inputSection")
