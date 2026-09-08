"""
Vercel serverless function — POST /api/stripe-webhook
Handles Stripe subscription events and updates Firestore member docs.

Required Vercel env vars:
  STRIPE_SECRET_KEY        — Stripe Dashboard → API Keys → Restricted key
  STRIPE_WEBHOOK_SECRET    — Stripe Dashboard → Webhooks → Signing secret
  FIREBASE_SERVICE_ACCOUNT — base64-encoded service account JSON
"""
import os
import json
import base64
import stripe
import firebase_admin
from firebase_admin import credentials, firestore
from http.server import BaseHTTPRequestHandler

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY', '')
WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')

# Initialise Firebase Admin (once per cold start)
_db = None

def get_db():
    global _db
    if _db is None:
        sa_b64 = os.environ.get('FIREBASE_SERVICE_ACCOUNT', '')
        if not sa_b64:
            raise RuntimeError('FIREBASE_SERVICE_ACCOUNT not set')
        sa_json = json.loads(base64.b64decode(sa_b64))
        if not firebase_admin._apps:
            cred = credentials.Certificate(sa_json)
            firebase_admin.initialize_app(cred)
        _db = firestore.client()
    return _db


def _status_for_event(event_type, subscription):
    """Map Stripe event + subscription status → amig0 subscriptionStatus."""
    if event_type == 'customer.subscription.deleted':
        return 'canceled'
    stripe_status = subscription.get('status', '')
    if stripe_status in ('active', 'trialing'):
        return 'active'
    if stripe_status in ('past_due', 'unpaid'):
        return 'past_due'
    return 'canceled'


class handler(BaseHTTPRequestHandler):

    def do_POST(self):
        if not WEBHOOK_SECRET:
            return self._respond(503, 'STRIPE_WEBHOOK_SECRET not set')

        length = int(self.headers.get('Content-Length', 0))
        payload = self.rfile.read(length)
        sig     = self.headers.get('Stripe-Signature', '')

        try:
            event = stripe.Webhook.construct_event(payload, sig, WEBHOOK_SECRET)
        except stripe.error.SignatureVerificationError:
            return self._respond(400, 'Invalid signature')
        except Exception as e:
            return self._respond(400, str(e))

        event_type   = event['type']
        subscription = event['data']['object']

        if event_type not in (
            'customer.subscription.created',
            'customer.subscription.updated',
            'customer.subscription.deleted',
        ):
            return self._respond(200, 'ignored')

        # Get Firebase UID from subscription metadata or client_reference_id
        uid = (
            subscription.get('metadata', {}).get('firebase_uid') or
            subscription.get('client_reference_id') or
            ''
        )

        # Fallback: look up UID from checkout session client_reference_id
        # stored in subscription metadata at session creation time
        if not uid:
            return self._respond(200, 'no uid — skipped')

        new_status = _status_for_event(event_type, subscription)

        try:
            db = get_db()
            db.collection('amig0_members').document(uid).set(
                {
                    'subscriptionStatus':  new_status,
                    'stripeSubscriptionId': subscription.get('id', ''),
                    'stripeCustomerId':     subscription.get('customer', ''),
                },
                merge=True
            )
        except Exception as e:
            print(f'[stripe-webhook] Firestore write failed: {e}')
            return self._respond(500, 'Firestore write failed')

        return self._respond(200, f'ok — {uid} → {new_status}')

    def _respond(self, status, message):
        body = message.encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
