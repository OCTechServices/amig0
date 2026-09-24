"""
F01 / I34 regression tests — api/stripe-webhook.py

Proves: typed Stripe Subscription object (stripe-python >= 5) is safely
        normalised via to_dict() before any .get() access — no AttributeError
        on customer.subscription.created/updated/deleted.

All Stripe and Firestore calls are mocked. No live transactions.
Run: python3 -m unittest tests/test_stripe_webhook.py -v
"""
import os
import io
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

os.environ.setdefault('STRIPE_SECRET_KEY',     'sk_placeholder')
os.environ.setdefault('STRIPE_WEBHOOK_SECRET', 'whsec_placeholder')

stripe_webhook = _load('stripe_webhook', 'stripe-webhook.py')
stripe_webhook.WEBHOOK_SECRET = 'whsec_placeholder'


# ── Typed Stripe object stub (reproduces stripe-python >= 5 behaviour) ────────
class _FakeSubscription:
    """Mimics stripe-python >= 5 Subscription — exposes to_dict(), omits .get().

    Deliberately omitting .get() reproduces the I34 failure: without the
    defensive normalisation fix, subscription.get() raises AttributeError.
    With the fix, to_dict() is called first and all downstream .get() calls
    operate on a plain dict.
    """
    def __init__(self, data):
        self._data = data

    def to_dict(self):
        return self._data


# ── Fixtures ──────────────────────────────────────────────────────────────────
SUB_ID = 'sub_FAKESUBID12345678'
CUS_ID = 'cus_FAKECUSTOMER'
UID    = 'uid_firebase_abc123'


def _sub_data(status='active', uid=UID):
    return {
        'id':                  SUB_ID,
        'customer':            CUS_ID,
        'status':              status,
        'metadata':            {'firebase_uid': uid},
        'client_reference_id': '',
    }


def _make_event(event_type='customer.subscription.created', status='active',
                uid=UID, typed=True):
    """Return a synthetic webhook event dict.

    typed=True  → data object is _FakeSubscription (stripe-python >= 5 path).
    typed=False → data object is a plain dict (backward-compat / legacy path).
    """
    obj = _FakeSubscription(_sub_data(status=status, uid=uid)) if typed \
          else _sub_data(status=status, uid=uid)
    return {'type': event_type, 'data': {'object': obj}}


# ── Handler factory ───────────────────────────────────────────────────────────
def make_handler(body_bytes=b'{}', stripe_sig='t=1,v1=fakesig'):
    h = stripe_webhook.handler.__new__(stripe_webhook.handler)
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
    mock_db = MagicMock()
    return mock_db


# ── SW-T01 / T02 / T03: typed object normalisation ───────────────────────────
class TestTypedObjectNormalisation(unittest.TestCase):
    """Core I34 regression: _FakeSubscription has no .get() — AttributeError
    is raised without the fix; with the fix, to_dict() converts it first."""

    def _run(self, event_type, status='active'):
        event   = _make_event(event_type=event_type, status=status, typed=True)
        mock_db = _mock_db()
        with patch.object(stripe_webhook.stripe.Webhook, 'construct_event',
                          return_value=event), \
             patch.object(stripe_webhook, 'get_db', return_value=mock_db):
            code, body = run_post(make_handler())
        return code, body, mock_db

    def test_SW_T01_created_typed_object_returns_200(self):
        """SW-T01: subscription.created with typed object — 200, Firestore set called."""
        code, body, mock_db = self._run('customer.subscription.created')
        self.assertEqual(code, 200)
        self.assertIn(UID, body)
        mock_db.collection.return_value.document.return_value.set.assert_called_once()

    def test_SW_T01b_created_active_writes_active_status(self):
        """SW-T01b: status=active → subscriptionStatus written as 'active'."""
        _, _, mock_db = self._run('customer.subscription.created', status='active')
        written = mock_db.collection.return_value.document.return_value.set.call_args[0][0]
        self.assertEqual(written['subscriptionStatus'], 'active')

    def test_SW_T02_updated_typed_object_returns_200(self):
        """SW-T02: subscription.updated with typed object — 200, Firestore set called."""
        code, _, mock_db = self._run('customer.subscription.updated', status='past_due')
        self.assertEqual(code, 200)
        mock_db.collection.return_value.document.return_value.set.assert_called_once()

    def test_SW_T02b_updated_past_due_writes_past_due(self):
        """SW-T02b: status=past_due → subscriptionStatus written as 'past_due'."""
        _, _, mock_db = self._run('customer.subscription.updated', status='past_due')
        written = mock_db.collection.return_value.document.return_value.set.call_args[0][0]
        self.assertEqual(written['subscriptionStatus'], 'past_due')

    def test_SW_T03_deleted_typed_object_returns_200(self):
        """SW-T03: subscription.deleted with typed object — 200, status=canceled."""
        code, _, mock_db = self._run('customer.subscription.deleted')
        self.assertEqual(code, 200)
        written = mock_db.collection.return_value.document.return_value.set.call_args[0][0]
        self.assertEqual(written['subscriptionStatus'], 'canceled')

    def test_SW_T03b_subscription_fields_written(self):
        """SW-T03b: stripeSubscriptionId and stripeCustomerId written from typed object."""
        _, _, mock_db = self._run('customer.subscription.created')
        written = mock_db.collection.return_value.document.return_value.set.call_args[0][0]
        self.assertEqual(written['stripeSubscriptionId'], SUB_ID)
        self.assertEqual(written['stripeCustomerId'], CUS_ID)


# ── SW-T04: Plain dict backward compatibility ─────────────────────────────────
class TestPlainDictCompatibility(unittest.TestCase):

    def test_SW_T04_plain_dict_created_returns_200(self):
        """SW-T04: Plain dict event (existing test-mock path) unchanged by fix."""
        event   = _make_event(event_type='customer.subscription.created', typed=False)
        mock_db = _mock_db()
        with patch.object(stripe_webhook.stripe.Webhook, 'construct_event',
                          return_value=event), \
             patch.object(stripe_webhook, 'get_db', return_value=mock_db):
            code, body = run_post(make_handler())
        self.assertEqual(code, 200)
        self.assertIn(UID, body)
        mock_db.collection.return_value.document.return_value.set.assert_called_once()


# ── SW-T05: No UID → skipped ──────────────────────────────────────────────────
class TestNoUid(unittest.TestCase):

    def test_SW_T05_typed_object_empty_uid_returns_200_skipped(self):
        """SW-T05: Typed object with empty uid — reaches skip branch, 200."""
        event = _make_event(uid='', typed=True)
        with patch.object(stripe_webhook.stripe.Webhook, 'construct_event',
                          return_value=event), \
             patch.object(stripe_webhook, 'get_db') as mock_get_db:
            code, body = run_post(make_handler())
        self.assertEqual(code, 200)
        self.assertIn('skipped', body)
        mock_get_db.assert_not_called()


# ── SW-T06: Signature verification ────────────────────────────────────────────
class TestSignatureVerification(unittest.TestCase):

    def test_SW_T06_invalid_signature_returns_400(self):
        """SW-T06: Invalid Stripe-Signature → 400 before object is accessed."""
        import stripe as _stripe
        with patch.object(_stripe.Webhook, 'construct_event',
                          side_effect=_stripe.error.SignatureVerificationError('bad', 'sig')):
            code, body = run_post(make_handler())
        self.assertEqual(code, 400)
        self.assertIn('Invalid signature', body)


# ── SW-T07: Non-subscription events ignored ───────────────────────────────────
class TestEventFiltering(unittest.TestCase):

    def test_SW_T07_non_subscription_event_returns_200_ignored(self):
        """SW-T07: invoice.paid or any other event type → 200 'ignored', no Firestore."""
        other = {'type': 'invoice.paid', 'data': {'object': {}}}
        with patch.object(stripe_webhook.stripe.Webhook, 'construct_event',
                          return_value=other), \
             patch.object(stripe_webhook, 'get_db') as mock_get_db:
            code, body = run_post(make_handler())
        self.assertEqual(code, 200)
        self.assertEqual(body, 'ignored')
        mock_get_db.assert_not_called()


# ── SW-T08: Firestore write failure ───────────────────────────────────────────
class TestFirestoreFailure(unittest.TestCase):

    def test_SW_T08_firestore_set_failure_returns_500(self):
        """SW-T08: Firestore .set() exception → 500, typed object path."""
        event   = _make_event(typed=True)
        mock_db = _mock_db()
        mock_db.collection.return_value.document.return_value.set.side_effect = \
            Exception('Firestore unavailable')
        with patch.object(stripe_webhook.stripe.Webhook, 'construct_event',
                          return_value=event), \
             patch.object(stripe_webhook, 'get_db', return_value=mock_db):
            code, _ = run_post(make_handler())
        self.assertEqual(code, 500)


# ── SW-T09: _status_for_event mapping ────────────────────────────────────────
class TestStatusMapping(unittest.TestCase):

    def _run_status(self, event_type, status):
        event   = _make_event(event_type=event_type, status=status, typed=True)
        mock_db = _mock_db()
        with patch.object(stripe_webhook.stripe.Webhook, 'construct_event',
                          return_value=event), \
             patch.object(stripe_webhook, 'get_db', return_value=mock_db):
            run_post(make_handler())
        return mock_db.collection.return_value.document.return_value.set.call_args[0][0]

    def test_SW_T09a_trialing_maps_to_active(self):
        """SW-T09a: stripe status=trialing → subscriptionStatus='active'."""
        written = self._run_status('customer.subscription.created', 'trialing')
        self.assertEqual(written['subscriptionStatus'], 'active')

    def test_SW_T09b_unpaid_maps_to_past_due(self):
        """SW-T09b: stripe status=unpaid → subscriptionStatus='past_due'."""
        written = self._run_status('customer.subscription.updated', 'unpaid')
        self.assertEqual(written['subscriptionStatus'], 'past_due')

    def test_SW_T09c_deleted_always_canceled(self):
        """SW-T09c: deleted event always writes 'canceled' regardless of stripe status."""
        written = self._run_status('customer.subscription.deleted', 'active')
        self.assertEqual(written['subscriptionStatus'], 'canceled')


if __name__ == '__main__':
    unittest.main()
