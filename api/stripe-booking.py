"""
Vercel serverless — POST /api/stripe-booking
Creates a Stripe Checkout Session for a service booking.

Path 1 (default): charges $35 booking fee. Balance collected at event.
Path 2 (Connect): charges full package price; $35 platform fee kept by amig0;
                  remainder transferred to partner's Stripe Express account.

Required Vercel env vars:
  STRIPE_SECRET_KEY      — restricted key (Stripe Dashboard → API Keys)
  FIREBASE_SERVICE_ACCOUNT — base64-encoded service account JSON (Path 2 only)

Note: ensure the restricted key has checkout.sessions:write permission.
For Path 2 also needs connect_accounts:read + transfers:write.
"""
import os
import json
import base64
import stripe
import firebase_admin
from firebase_admin import credentials, firestore
from http.server import BaseHTTPRequestHandler

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

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY', '')
ORIGIN         = 'https://amig0.com'


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

        service_id     = body.get('serviceId', '').strip()
        payment_path   = int(body.get('paymentPath', 1))
        service_name   = body.get('serviceName', '').strip()
        package_name   = body.get('packageName', '').strip()
        package_price  = body.get('packagePrice', '').strip()
        currency       = body.get('currency', 'usd').lower()
        deposit        = int(body.get('deposit', 3500))
        customer_name  = body.get('customerName', '').strip()
        customer_phone = body.get('customerPhone', '').strip()
        event_date     = body.get('eventDate', '').strip()
        event_type     = body.get('eventType', '').strip()
        headcount      = str(body.get('headcount', '')).strip()
        event_location = body.get('eventLocation', '').strip()

        if not service_name or not customer_name or not customer_phone:
            return self._json(400, {'error': 'serviceName, customerName, and customerPhone are required'})

        description = ' · '.join(filter(None, [
            package_name, package_price, event_type, event_date,
            f'{headcount} guests' if headcount else '',
        ]))

        metadata = {
            'service_id':     service_id,
            'payment_path':   str(payment_path),
            'service_name':   service_name,
            'package_name':   package_name,
            'package_price':  package_price,
            'customer_name':  customer_name,
            'customer_phone': customer_phone,
            'event_date':     event_date,
            'event_type':     event_type,
            'headcount':      headcount,
            'event_location': event_location,
        }

        try:
            if payment_path == 2:
                # ── Path 2: full charge via Connect ──────────────────────────
                # Look up partner's Stripe Express account in Firestore
                db  = get_db()
                doc = db.collection('affiliates').document(service_id).get()
                if not doc.exists:
                    return self._json(400, {'error': f'Partner not found: {service_id}'})
                partner      = doc.to_dict()
                account_id   = partner.get('stripeAccountId', '')
                if not account_id:
                    return self._json(400, {'error': 'Partner Stripe account not configured'})

                # Parse full price from package_price string (e.g. "$650")
                full_cents = int(float(package_price.replace('$', '').replace(',', '')) * 100)

                session = stripe.checkout.Session.create(
                    mode='payment',
                    line_items=[{
                        'price_data': {
                            'currency': currency,
                            'product_data': {
                                'name': f'amig0 — {service_name} · {package_name}',
                                'description': description or 'Service booking',
                            },
                            'unit_amount': full_cents,
                        },
                        'quantity': 1,
                    }],
                    metadata=metadata,
                    payment_intent_data={
                        'statement_descriptor':   'AMIG0 BOOKING',
                        'description':            f'amig0 — {service_name}',
                        'application_fee_amount': deposit,          # $35 kept by amig0
                        'transfer_data':          {'destination': account_id},
                    },
                    success_url=ORIGIN + '/hacks?booked=1&session_id={CHECKOUT_SESSION_ID}',
                    cancel_url=ORIGIN + '/hacks',
                )
            else:
                # ── Path 1: $35 booking fee only ─────────────────────────────
                session = stripe.checkout.Session.create(
                    mode='payment',
                    line_items=[{
                        'price_data': {
                            'currency': currency,
                            'product_data': {
                                'name': f'amig0 — {service_name}',
                                'description': description or 'Service booking',
                            },
                            'unit_amount': deposit,
                        },
                        'quantity': 1,
                    }],
                    metadata=metadata,
                    payment_intent_data={
                        'statement_descriptor': 'AMIG0 BOOKING',
                        'description':          f'amig0 — {service_name} Booking Fee',
                    },
                    success_url=ORIGIN + '/hacks?booked=1&session_id={CHECKOUT_SESSION_ID}',
                    cancel_url=ORIGIN + '/hacks',
                )

            return self._json(200, {'url': session.url})
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
