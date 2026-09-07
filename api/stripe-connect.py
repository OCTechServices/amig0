"""
Vercel serverless — POST /api/stripe-connect
Creates a Stripe Connect Express account for a service partner and returns the onboarding URL.
Stores stripeAccountId + paymentPath:2 in Firestore affiliates/{partnerId}.

Required Vercel env vars:
  STRIPE_SECRET_KEY        — restricted key needs connect_accounts:write permission
                             (may need to update permissions in Stripe Dashboard → API Keys)
  FIREBASE_SERVICE_ACCOUNT — base64-encoded service account JSON

Path 2 onboarding flow:
  1. POST /api/stripe-connect { partnerId, partnerName, partnerEmail }
  2. Returns { url } — send this URL to the partner
  3. Partner completes Stripe Express onboarding (~10 min)
  4. Partner redirected to /hacks?connect_return=1
  5. stripeAccountId stored in Firestore, paymentPath set to 2
  6. Update SERVICES[n].paymentPath to 2 in hacks/index.html
"""
import os
import json
import base64
import stripe
import firebase_admin
from firebase_admin import credentials, firestore
from http.server import BaseHTTPRequestHandler

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY', '')
ORIGIN         = 'https://amig0.com'

_db = None


def get_db():
    global _db
    if _db is None:
        sa_b64 = os.environ.get('FIREBASE_SERVICE_ACCOUNT', '')
        if not sa_b64:
            raise RuntimeError('FIREBASE_SERVICE_ACCOUNT not set')
        sa_json = json.loads(base64.b64decode(sa_b64))
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(sa_json))
        _db = firestore.client()
    return _db


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not stripe.api_key:
            return self._json(503, {'error': 'STRIPE_SECRET_KEY not set'})

        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            return self._json(400, {'error': 'Invalid JSON'})

        partner_id    = body.get('partnerId', '').strip()
        partner_name  = body.get('partnerName', '').strip()
        partner_email = body.get('partnerEmail', '').strip()

        if not partner_id:
            return self._json(400, {'error': 'partnerId required'})

        try:
            db  = get_db()
            doc = db.collection('affiliates').document(partner_id).get()
            existing   = doc.to_dict() if doc.exists else {}
            account_id = existing.get('stripeAccountId', '')

            if not account_id:
                # Create Express account
                account = stripe.Account.create(
                    type='express',
                    country='US',
                    email=partner_email or None,
                    capabilities={
                        'card_payments': {'requested': True},
                        'transfers':     {'requested': True},
                    },
                    business_profile={
                        'name': partner_name or partner_id,
                    },
                )
                account_id = account.id
                db.collection('affiliates').document(partner_id).set({
                    'stripeAccountId':   account_id,
                    'paymentPath':       2,
                    'onboardingComplete': False,
                }, merge=True)

            # Generate onboarding link (safe to call multiple times)
            link = stripe.AccountLink.create(
                account=account_id,
                refresh_url=ORIGIN + f'/hacks?connect_refresh=1&partner={partner_id}',
                return_url=ORIGIN  + f'/hacks?connect_return=1&partner={partner_id}',
                type='account_onboarding',
            )
            return self._json(200, {'url': link.url, 'accountId': account_id})

        except stripe.error.StripeError as e:
            return self._json(502, {'error': str(e)})
        except Exception as e:
            return self._json(500, {'error': str(e)})

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', ORIGIN)
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
