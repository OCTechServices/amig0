"""
Vercel serverless — POST /api/booking-webhook
Handles checkout.session.completed for amig0 service bookings.
Writes booking to Firestore. Sends WhatsApp notifications when credentials are set.

Required Vercel env vars:
  STRIPE_SECRET_KEY              — restricted key (Stripe Dashboard → API Keys)
  STRIPE_BOOKING_WEBHOOK_SECRET  — whsec_... (separate from subscription webhook)
  FIREBASE_SERVICE_ACCOUNT       — base64-encoded service account JSON
  WA_TOKEN                       — WhatsApp Cloud API system user token (pending)
  WA_PHONE_NUMBER_ID             — WhatsApp phone number ID: 1259977410535761 (pending verification)
"""
import os
import json
import base64
import urllib.request
import stripe
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

stripe.api_key        = os.environ.get('STRIPE_SECRET_KEY', '')
WEBHOOK_SECRET        = os.environ.get('STRIPE_BOOKING_WEBHOOK_SECRET', '')
WA_TOKEN              = os.environ.get('WA_TOKEN', '')
WA_PHONE_NUMBER_ID    = os.environ.get('WA_PHONE_NUMBER_ID', '')

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


def send_wa(to_number, message):
    """Send a WhatsApp text message via Cloud API. No-op if credentials not set."""
    if not WA_TOKEN or not WA_PHONE_NUMBER_ID or not to_number:
        print(f'[booking-webhook] WA stub — to:{to_number}')
        return
    # Strip non-digits
    digits = ''.join(c for c in to_number if c.isdigit())
    if not digits:
        return
    url     = f'https://graph.facebook.com/v21.0/{WA_PHONE_NUMBER_ID}/messages'
    payload = json.dumps({
        'messaging_product': 'whatsapp',
        'to': digits,
        'type': 'text',
        'text': {'body': message},
    }).encode()
    req = urllib.request.Request(url, data=payload, headers={
        'Authorization': f'Bearer {WA_TOKEN}',
        'Content-Type': 'application/json',
    })
    try:
        urllib.request.urlopen(req, timeout=8)
    except Exception as e:
        print(f'[booking-webhook] WA send failed: {e}')


class handler(BaseHTTPRequestHandler):

    def do_POST(self):
        if not WEBHOOK_SECRET:
            return self._respond(503, 'STRIPE_BOOKING_WEBHOOK_SECRET not set')

        length  = int(self.headers.get('Content-Length', 0))
        payload = self.rfile.read(length)
        sig     = self.headers.get('Stripe-Signature', '')

        try:
            event = stripe.Webhook.construct_event(payload, sig, WEBHOOK_SECRET)
        except stripe.error.SignatureVerificationError:
            return self._respond(400, 'Invalid signature')
        except Exception as e:
            return self._respond(400, str(e))

        if event['type'] != 'checkout.session.completed':
            return self._respond(200, 'ignored')

        session  = event['data']['object']
        metadata = session.get('metadata', {})

        service_name   = metadata.get('service_name', 'amig0 Service')
        customer_name  = metadata.get('customer_name', '')
        customer_phone = metadata.get('customer_phone', '')
        event_date     = metadata.get('event_date', '')
        event_type     = metadata.get('event_type', '')
        headcount      = metadata.get('headcount', '')
        event_location = metadata.get('event_location', '')
        rental_date    = metadata.get('rental_date', '')
        rental_days    = metadata.get('rental_days', '')
        rental_bikes   = metadata.get('rental_bikes', '')
        rental_pickup  = metadata.get('rental_pickup', '')
        session_id     = session.get('id', '')
        ref            = session_id[-8:].upper() if session_id else 'N/A'
        is_rental      = bool(rental_date)

        # SLA: same-day = 30 min response / 60 min confirm. Future = 24 hours.
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        booking_date = rental_date if is_rental else event_date
        same_day = (booking_date == today)
        if same_day:
            sla_msg = 'Your provider will respond within 30 minutes and confirm within 60 minutes.'
        else:
            sla_msg = 'Your provider will confirm your booking within 24 hours.'

        booking = {
            'sessionId':     session_id,
            'serviceName':   service_name,
            'customerName':  customer_name,
            'customerPhone': customer_phone,
            'eventDate':     event_date or rental_date,
            'eventType':     event_type,
            'headcount':     headcount,
            'eventLocation': event_location,
            'rentalDate':    rental_date,
            'rentalDays':    rental_days,
            'rentalBikes':   rental_bikes,
            'rentalPickup':  rental_pickup,
            'amount':        session.get('amount_total', 0),
            'currency':      session.get('currency', 'usd'),
            'status':        'confirmed',
            'createdAt':     datetime.now(timezone.utc).isoformat(),
        }

        try:
            db = get_db()
            db.collection('service_bookings').add(booking)
        except Exception as e:
            print(f'[booking-webhook] Firestore write failed: {e}')
            return self._respond(500, 'Firestore write failed')

        # Customer confirmation via WhatsApp
        if is_rental:
            pickup_label = 'Hotel delivery' if rental_pickup == 'hotel' else 'Shop pickup'
            details = (
                f'Service: {service_name}\n'
                f'Date: {rental_date}\n'
                f'Duration: {rental_days} day(s)\n'
                f'Bikes: {rental_bikes}\n'
                f'Pickup: {pickup_label}\n'
                f'Location: {event_location}'
            )
        else:
            details = (
                f'Service: {service_name}\n'
                f'Package: {metadata.get("package_name","")}\n'
                f'Date: {event_date}\n'
                f'Type: {event_type}\n'
                f'Guests: {headcount}\n'
                f'Location: {event_location}'
            )

        send_wa(
            customer_phone,
            (
                f'\u2713 Booking confirmed — amig0\n\n'
                f'{details}\n\n'
                f'{sla_msg}\n'
                f'Booking ref: {ref}'
            )
        )

        return self._respond(200, f'ok — booking {ref} confirmed')

    def _respond(self, status, message):
        body = message.encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
