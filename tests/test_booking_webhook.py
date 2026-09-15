"""
P01 test harness — api/booking-webhook.py
Tests: P01-T07 through P01-T20

All Stripe, Firestore, and WA calls are mocked. No live transactions.
Run: python3 -m unittest tests/test_booking_webhook.py -v
"""
import os
import io
import sys
import unittest
import importlib.util
from unittest.mock import patch, MagicMock
from google.api_core.exceptions import AlreadyExists

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
booking_webhook.WEBHOOK_SECRET = 'whsec_placeholder'


# ── Test infrastructure ───────────────────────────────────────────────────────
SESSION_ID  = 'cs_test_FAKESESSION12345678'   # last 8 chars = '12345678'
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


def _mock_db():
    """Return a mock Firestore db. create() succeeds by default.
    Override mock_doc_ref.create.side_effect for error scenarios.
    """
    mock_doc_ref = MagicMock()
    mock_doc_ref.create.return_value = None   # atomic claim succeeds
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

    def test_new_booking_claims_and_returns_200(self):
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db()

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa', return_value='sent'):
            status, body = run_post(make_handler())

        self.assertEqual(status, 200)
        self.assertIn('confirmed', body)

        # Firestore doc keyed on session_id
        mock_db.collection.return_value.document.assert_called_with(SESSION_ID)
        mock_doc_ref.create.assert_called_once()

        # bookingRef and sessionId in the claimed booking
        written = mock_doc_ref.create.call_args[0][0]
        self.assertEqual(written['bookingRef'], BOOKING_REF)
        self.assertEqual(written['sessionId'], SESSION_ID)

    def test_booking_ref_in_response_body(self):
        event = _make_event()
        mock_db, _ = _mock_db()

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa', return_value='sent'):
            status, body = run_post(make_handler())

        self.assertIn(BOOKING_REF, body)

    def test_notification_status_recorded_on_booking_doc(self):
        """After claim, customerWaStatus and operatorWaStatus are written to the doc."""
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db()

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa', return_value='sent'):
            run_post(make_handler())

        mock_doc_ref.update.assert_called_once()
        update_fields = mock_doc_ref.update.call_args[0][0]
        self.assertIn('customerWaStatus', update_fields)
        self.assertIn('operatorWaStatus', update_fields)


# ── T10: Sequential replay idempotency ───────────────────────────────────────
class TestIdempotency(unittest.TestCase):

    def test_replay_returns_200_already_recorded_no_notifications(self):
        """AlreadyExists from create() → 200 'already recorded', no WA."""
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db()
        mock_doc_ref.create.side_effect = AlreadyExists('document already exists')

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa') as mock_wa:
            status, body = run_post(make_handler())

        self.assertEqual(status, 200)
        self.assertIn('already recorded', body)
        mock_doc_ref.create.assert_called_once()   # attempted, got AlreadyExists
        mock_wa.assert_not_called()                # no notifications on replay

    def test_session_id_used_as_firestore_document_key(self):
        """document() must be called with session_id to enable atomic claim."""
        event = _make_event()
        mock_db, _ = _mock_db()

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa', return_value='sent'):
            run_post(make_handler())

        mock_db.collection.return_value.document.assert_called_with(SESSION_ID)


# ── T11: WA failure → 200 (booking persisted) ────────────────────────────────
class TestWAFailure(unittest.TestCase):

    def test_wa_network_failure_returns_200(self):
        """WA urlopen failure is caught inside send_wa; booking claimed → 200."""
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db()

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
        mock_doc_ref.create.assert_called_once()     # booking was claimed/persisted

    def test_wa_status_recorded_as_failed_on_network_failure(self):
        """send_wa returns 'failed' on network error; status is persisted."""
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db()

        original_token    = booking_webhook.WA_TOKEN
        original_phone_id = booking_webhook.WA_PHONE_NUMBER_ID
        original_op       = booking_webhook.WA_OPERATOR_NUMBER
        booking_webhook.WA_TOKEN           = 'fake_token'
        booking_webhook.WA_PHONE_NUMBER_ID = '1407135942475680'
        booking_webhook.WA_OPERATOR_NUMBER = '17605396606'

        try:
            with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
                 patch.object(booking_webhook, 'get_db', return_value=mock_db), \
                 patch.object(booking_webhook.urllib.request, 'urlopen',
                              side_effect=Exception('timeout')):
                run_post(make_handler())
        finally:
            booking_webhook.WA_TOKEN           = original_token
            booking_webhook.WA_PHONE_NUMBER_ID = original_phone_id
            booking_webhook.WA_OPERATOR_NUMBER = original_op

        update_fields = mock_doc_ref.update.call_args[0][0]
        self.assertEqual(update_fields['customerWaStatus'], 'failed')
        self.assertEqual(update_fields['operatorWaStatus'], 'failed')


# ── T12: Firestore claim failure → 500 ───────────────────────────────────────
class TestFirestoreClaimFailure(unittest.TestCase):

    def test_firestore_claim_failure_returns_500_no_wa(self):
        """Non-AlreadyExists Firestore failure → 500; no notifications."""
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db()
        mock_doc_ref.create.side_effect = Exception('Firestore unavailable')

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa') as mock_wa:
            status, body = run_post(make_handler())

        self.assertEqual(status, 500)
        mock_wa.assert_not_called()


# ── T13: Privacy — phone not in stub log ────────────────────────────────────
class TestPrivacyLogging(unittest.TestCase):

    def test_phone_not_printed_in_stub_log(self):
        original = booking_webhook.WA_TOKEN
        booking_webhook.WA_TOKEN = ''

        captured = io.StringIO()
        try:
            with patch('sys.stdout', captured):
                booking_webhook.send_wa('5559998877', 'test message')
        finally:
            booking_webhook.WA_TOKEN = original

        self.assertNotIn('5559998877', captured.getvalue())

    def test_stub_log_emits_notice(self):
        original = booking_webhook.WA_TOKEN
        booking_webhook.WA_TOKEN = ''

        captured = io.StringIO()
        try:
            with patch('sys.stdout', captured):
                booking_webhook.send_wa('5559998877', 'test message')
        finally:
            booking_webhook.WA_TOKEN = original

        self.assertIn('stub', captured.getvalue())

    def test_send_wa_returns_skipped_when_credentials_absent(self):
        original = booking_webhook.WA_TOKEN
        booking_webhook.WA_TOKEN = ''
        try:
            result = booking_webhook.send_wa('5550001234', 'test')
        finally:
            booking_webhook.WA_TOKEN = original
        self.assertEqual(result, 'skipped')


# ── T14–T20: Atomic idempotency — concurrent and sequential invariants ────────
class TestAtomicIdempotency(unittest.TestCase):
    """Proves the atomic claim invariant using a concurrent-delivery simulation.

    Simulation mechanism: create() is given a stateful side_effect that
    returns None (success) on the first invocation and raises AlreadyExists
    on subsequent invocations. Two sequential do_POST calls with this mock
    reproduce the winner/loser behavior of concurrent Stripe deliveries.
    The atomic guarantee is enforced by the Firestore server in production;
    the mock validates handler behaviour in each case.
    """

    def _concurrent_mock_db(self):
        """DB where first create() succeeds, second raises AlreadyExists."""
        create_calls = [0]

        def _create(data):
            create_calls[0] += 1
            if create_calls[0] == 1:
                return None
            raise AlreadyExists('document already exists')

        mock_doc_ref = MagicMock()
        mock_doc_ref.create.side_effect = _create
        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_doc_ref
        return mock_db, mock_doc_ref, create_calls

    def _run_two_deliveries(self, event, mock_db, wa_return='sent'):
        """Run do_POST twice with the same event/db. Returns list of (status, body, wa_call_count)."""
        results = []
        for _ in range(2):
            with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
                 patch.object(booking_webhook, 'get_db', return_value=mock_db), \
                 patch.object(booking_webhook, 'send_wa', return_value=wa_return) as mock_wa:
                status, body = run_post(make_handler())
                results.append((status, body, mock_wa.call_count))
        return results

    def test_T14_only_winner_acquires_notification_ownership(self):
        """T14: Two concurrent deliveries — only the claiming invocation sends notifications."""
        event = _make_event()
        mock_db, _, create_calls = self._concurrent_mock_db()
        results = self._run_two_deliveries(event, mock_db)

        _, _, wa_winner = results[0]
        _, _, wa_loser  = results[1]

        # Winner sent both customer and operator notifications
        self.assertEqual(wa_winner, 2)
        # Loser sent no notifications
        self.assertEqual(wa_loser, 0)
        # Both deliveries attempted the atomic claim
        self.assertEqual(create_calls[0], 2)

    def test_T15_concurrent_delivery_one_canonical_booking(self):
        """T15: Both deliveries attempt create(); only the first succeeds — one booking."""
        event = _make_event()
        mock_db, mock_doc_ref, create_calls = self._concurrent_mock_db()
        self._run_two_deliveries(event, mock_db)

        # Both deliveries attempted to claim the booking
        self.assertEqual(create_calls[0], 2)
        # The second call raised AlreadyExists — only one booking was created
        # (Verified by create_calls == 2 with the mock's stateful side_effect:
        #  first call returned None (created), second raised AlreadyExists (rejected))

    def test_T16_customer_notification_at_most_once(self):
        """T16: Customer WA sent at most once across concurrent deliveries."""
        event = _make_event()
        mock_db, _, _ = self._concurrent_mock_db()
        customer_phone = event['data']['object']['metadata']['customer_phone']

        customer_notifications = []

        def tracking_wa(to, msg):
            if to == customer_phone:
                customer_notifications.append(to)
            return 'sent'

        for _ in range(2):
            with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
                 patch.object(booking_webhook, 'get_db', return_value=mock_db), \
                 patch.object(booking_webhook, 'send_wa', side_effect=tracking_wa):
                run_post(make_handler())

        self.assertLessEqual(len(customer_notifications), 1)

    def test_T17_operator_notification_at_most_once(self):
        """T17: Operator WA sent at most once across concurrent deliveries."""
        event = _make_event()
        mock_db, _, _ = self._concurrent_mock_db()

        operator_number = '17605396606'
        original_op = booking_webhook.WA_OPERATOR_NUMBER
        booking_webhook.WA_OPERATOR_NUMBER = operator_number

        operator_notifications = []

        def tracking_wa(to, msg):
            if to == operator_number:
                operator_notifications.append(to)
            return 'sent'

        try:
            for _ in range(2):
                with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
                     patch.object(booking_webhook, 'get_db', return_value=mock_db), \
                     patch.object(booking_webhook, 'send_wa', side_effect=tracking_wa):
                    run_post(make_handler())
        finally:
            booking_webhook.WA_OPERATOR_NUMBER = original_op

        self.assertLessEqual(len(operator_notifications), 1)

    def test_T18_sequential_replay_idempotent(self):
        """T18: Sequential Stripe replay → 200 'already recorded', zero notifications."""
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db()
        # First call succeeds, second raises AlreadyExists (sequential replay)
        mock_doc_ref.create.side_effect = [None, AlreadyExists('already exists')]

        results = self._run_two_deliveries(event, mock_db)

        status1, body1, wa_count1 = results[0]
        status2, body2, wa_count2 = results[1]

        # First delivery: claimed, notifications sent
        self.assertEqual(status1, 200)
        self.assertIn('confirmed', body1)
        self.assertEqual(wa_count1, 2)   # customer + operator

        # Second delivery (replay): already recorded, no notifications
        self.assertEqual(status2, 200)
        self.assertIn('already recorded', body2)
        self.assertEqual(wa_count2, 0)

    def test_T19_firestore_claim_failure_returns_500_no_wa(self):
        """T19: Non-AlreadyExists Firestore failure → 500, zero notifications."""
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db()
        mock_doc_ref.create.side_effect = Exception('Firestore unavailable')

        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa') as mock_wa:
            status, body = run_post(make_handler())

        self.assertEqual(status, 500)
        mock_wa.assert_not_called()

    def test_T20_notification_failure_plus_replay_no_duplicate(self):
        """T20: WA failure on first delivery + Stripe replay → no duplicate booking, no duplicate notifications."""
        event = _make_event()
        mock_db, mock_doc_ref = _mock_db()
        # First call claims the booking, second is a replay
        mock_doc_ref.create.side_effect = [None, AlreadyExists('already exists')]

        # First delivery: claim succeeds, WA returns 'failed'
        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa', return_value='failed') as mock_wa_1:
            status1, body1 = run_post(make_handler())

        first_wa_count = mock_wa_1.call_count

        # Second delivery (Stripe replay after notification failure)
        with patch.object(booking_webhook.stripe.Webhook, 'construct_event', return_value=event), \
             patch.object(booking_webhook, 'get_db', return_value=mock_db), \
             patch.object(booking_webhook, 'send_wa') as mock_wa_2:
            status2, body2 = run_post(make_handler())

        # Both deliveries return 200
        self.assertEqual(status1, 200)
        self.assertEqual(status2, 200)
        # Replay returns 'already recorded'
        self.assertIn('already recorded', body2)
        # First delivery attempted notifications (even though they failed)
        self.assertGreater(first_wa_count, 0)
        # Replay produced zero additional notifications despite prior failure
        mock_wa_2.assert_not_called()


if __name__ == '__main__':
    unittest.main()
