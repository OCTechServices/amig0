"""
P01 test harness — api/booking-webhook.py
Tests: P01-T07 through P01-T13

All Stripe, Firestore, and WA calls are mocked. No live transactions.
Run: python3 -m unittest tests/test_booking_webhook.py -v
"""
import os
import io
import sys
import unittest
import importlib.util
from unittest.mock import patch, MagicMock

# ── Module loader (handles hyphen in filename) ────────────────────────────────
def _load(name, filename):
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'api', filename))
    spec = importlib.util.spec_from_file_location(name, path)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

os.environ.setdefault('STRIPE_SECRET_KEY',             'sk_placeholder')
os.environ.setdefault('STRIPE_BOOKING_WEBHOOK_SECRET', 'whsec_placeholder')

booking_webhook = _load('booking_webhook', 'booking-webhook.py')
# Ensure WEBHOOK_SECRET is non-empty so the 503 guard is bypassed in tests
booking_webhook.WEBHOOK_SECRET = 'whsec_test_fake'


# ── Test infrastructure ───────────────────────────────────────────────────────
SESSION_ID = 'cs_test_FAKESESSION12345678'  # 28 chars; last 8 = '12345678'
BOOKING_REF = SESSION_ID[-8:].upper()


def _make_event(session_id=SESSION_ID, metadata=None, event_type='checkout.session.completed'):
    if metadata is None:
        metadata = {
            'service_name':   'Luxury Photo Booth · San Diego',
            'customer_name':  'Alice Smith',
            'customer_phone': '5550001234',
            'event_date':     '2026-12-01',
            'event_type':     'birthday',
            'headcount':      '50',
            'event_location': 'San Diego, CA',
        }
    return {
        'type': event_type,
        'data': {'object': {
            'id':           session_id,
            'amount_total': 3500,
            'currency':     'usd',
            'metadata':     metadata,
        }},
    }


def make_handler(body_bytes=b'{}', stripe_sig='t=1,v1=fakesig'):
    h = booking_webhook.handler.__new__(booking_webhook.handler)
    h.rfile      = io.BytesIO(body_bytes)
    h.wfile      = io.BytesIO()
    h.headers    = {
        'Content-Length':   str(len(body_bytes)),
        'Stripe-Signature': stripe_sig,
    }
    h._responses = []
    h.send_response = lambda s: h._responses.append(s)
    h.send_header   = lambda k, v: None
    h.end_headers   = lambda: None
    return h


def run_post(h):
    h.do_POST()
    h.wfile.seek(0)
    body = h.wfile.read().decode()
    return h._responses[0] if h._responses else None, body


def _mock_db(doc_exists=False):
    """Return a mock Firestore db where doc existence is controlled."""
    mock_snap    = MagicMock()
    mock_snap.exists = doc_exists
    mock_doc_ref = MagicMock()
    mock_doc_ref.get.return_value = mock_snap
    mock_db = MagicMock()
    mock_db.collection.return_value.document.return_value = mock_doc_ref
    return mock_db, mock_doc_ref


# ── T07: Signature verification ──────────────────────────────────────────────
class TestSignatureVerification(unittest.TestCase):

    def test_invalid_signature_returns_400(self):
        import stripe as _stripe
        with patch.object(_stripe.Webhook, 'construct_event',
                          side_effect=_stripe.error.SignatureVerificationError('bad', 'sig')):
            status, body = run_post(make_handler())
        self.assertEqual(status, 400)
        self.assertIn('Invalid signature', body)

    def test_malformed_payload_returns_400(self):
        with patch.object(booking_webhook.stripe.Webhook, 'construct_event',
                          side_effect=Exception('parse error')):
            status, body = run_post(make_handler())
        self.assertEqual(status, 400)


# ── T08: Non-booking events ignored ─────────────────────────────────────────
class TestEventFiltering(unittest.TestCase):

    def test_non_booking_event_returns_200_ignored(self):
        other = _make_event(event_type='payment_intent.succeeded')
        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=other):
            status, body = run_post(make_handler())
        self.assertEqual(status, 200)
        self.assertEqual(body, 'ignored')


# ── T09: Successful new booking ──────────────────────────────────────────────
class TestSuccessfulBooking(unittest.TestCase):

    def test_new_booking_writes_and_returns_200(self):
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db(doc_exists=False)

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa'):
            status, body = run_post(make_handler())

        self.assertEqual(status, 200)
        self.assertIn('confirmed', body)

        # Firestore doc keyed on session_id
        mock_db.collection.return_value.document.assert_called_with(SESSION_ID)
        mock_doc_ref.set.assert_called_once()

        # bookingRef must be in the persisted doc
        written = mock_doc_ref.set.call_args[0][0]
        self.assertIn('bookingRef', written)
        self.assertEqual(written['bookingRef'], BOOKING_REF)
        self.assertEqual(written['sessionId'], SESSION_ID)

    def test_booking_ref_in_response(self):
        event = _make_event()
        mock_db, _ = _mock_db(doc_exists=False)

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa'):
            status, body = run_post(make_handler())

        # Response body should contain the booking ref
        self.assertIn(BOOKING_REF, body)


# ── T10: Idempotency — replay must be no-op ──────────────────────────────────
class TestIdempotency(unittest.TestCase):

    def test_replay_skips_write_and_notification(self):
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db(doc_exists=True)

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa') as mock_wa:
            status, body = run_post(make_handler())

        self.assertEqual(status, 200)
        self.assertIn('already recorded', body)
        mock_doc_ref.set.assert_not_called()   # no duplicate write
        mock_wa.assert_not_called()             # no duplicate notification

    def test_idempotency_uses_session_id_as_doc_key(self):
        """Existence check must use session_id as document ID (not .add())."""
        event = _make_event()
        mock_db, _ = _mock_db(doc_exists=False)

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa'):
            run_post(make_handler())

        # .document() must be called with the session_id, not randomly generated
        mock_db.collection.return_value.document.assert_called_with(SESSION_ID)


# ── T11: WA failure → 200 (booking persisted) ────────────────────────────────
class TestWAFailure(unittest.TestCase):

    def test_wa_network_failure_returns_200(self):
        """WA urlopen failure is caught inside send_wa; booking already persisted → 200."""
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db(doc_exists=False)

        original_token    = booking_webhook.WA_TOKEN
        original_phone_id = booking_webhook.WA_PHONE_NUMBER_ID
        booking_webhook.WA_TOKEN           = 'fake_token'
        booking_webhook.WA_PHONE_NUMBER_ID = '1407135942475680'

        try:
            with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
                 patch.object(booking_webhook, 'get_db', return_value=mock_db), \
                 patch.object(booking_webhook.urllib.request, 'urlopen',
                              side_effect=Exception('connection refused')):
                status, body = run_post(make_handler())
        finally:
            booking_webhook.WA_TOKEN           = original_token
            booking_webhook.WA_PHONE_NUMBER_ID = original_phone_id

        self.assertEqual(status, 200)
        mock_doc_ref.set.assert_called_once()   # booking was committed


# ── T12: Firestore write failure → 500 ───────────────────────────────────────
class TestFirestoreWriteFailure(unittest.TestCase):

    def test_firestore_write_failure_returns_500(self):
        """Firestore write failure → 500 so Stripe retries; WA must not fire."""
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db(doc_exists=False)
        mock_doc_ref.set.side_effect = Exception('Firestore unavailable')

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa') as mock_wa:
            status, body = run_post(make_handler())

        self.assertEqual(status, 500)
        mock_wa.assert_not_called()   # WA must not fire before booking is persisted


# ── T13: Privacy — phone not in stub log ────────────────────────────────────
class TestPrivacyLogging(unittest.TestCase):

    def test_phone_not_printed_in_stub_log(self):
        """WA stub log must not print the customer phone number."""
        original = booking_webhook.WA_TOKEN
        booking_webhook.WA_TOKEN = ''   # force stub path

        captured = io.StringIO()
        try:
            with patch('sys.stdout', captured):
                booking_webhook.send_wa('5559998877', 'test message')
        finally:
            booking_webhook.WA_TOKEN = original

        self.assertNotIn('5559998877', captured.getvalue())

    def test_stub_log_emits_something(self):
        """Stub log should still print a notice (just not the phone)."""
        original = booking_webhook.WA_TOKEN
        booking_webhook.WA_TOKEN = ''

        captured = io.StringIO()
        try:
            with patch('sys.stdout', captured):
                booking_webhook.send_wa('5559998877', 'test message')
        finally:
            booking_webhook.WA_TOKEN = original

        self.assertIn('stub', captured.getvalue())


if __name__ == '__main__':
    unittest.main()
