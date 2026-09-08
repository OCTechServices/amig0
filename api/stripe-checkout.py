"""
Vercel serverless function — POST /api/stripe-checkout
Creates a Stripe Checkout Session for the $3.99/mo amig0 membership.

Required Vercel env vars:
  STRIPE_SECRET_KEY  — Stripe Dashboard → API Keys → Restricted key
  STRIPE_PRICE_ID    — Stripe Dashboard → Products → $3.99/mo price ID
"""
import os
import json
import stripe
from http.server import BaseHTTPRequestHandler

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY', '')
PRICE_ID       = os.environ.get('STRIPE_PRICE_ID', '')
ORIGIN         = 'https://amig0.com'


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not stripe.api_key:
            return self._json(503, {'error': 'STRIPE_SECRET_KEY not set'})
        if not PRICE_ID:
            return self._json(503, {'error': 'STRIPE_PRICE_ID not set'})

        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            return self._json(400, {'error': 'Invalid JSON'})

        uid   = body.get('uid', '')
        email = body.get('email', '')

        if not uid:
            return self._json(400, {'error': 'uid required'})

        try:
            session = stripe.checkout.Session.create(
                mode='subscription',
                line_items=[{'price': PRICE_ID, 'quantity': 1}],
                customer_email=email or None,
                client_reference_id=uid,
                success_url=ORIGIN + '/deals?subscribed=1&session_id={CHECKOUT_SESSION_ID}',
                cancel_url=ORIGIN + '/deals',
                subscription_data={
                    'metadata': {'firebase_uid': uid}
                }
            )
            return self._json(200, {'url': session.url})
        except stripe.error.StripeError as e:
            return self._json(502, {'error': str(e)})

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
