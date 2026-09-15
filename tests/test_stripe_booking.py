"""
P01 test harness — api/stripe-booking.py
Tests: P01-T01 through P01-T06

All Stripe calls are mocked. No live charges.
Run: python3 -m unittest tests/test_stripe_booking.py -v
"""
import os
import io
import json
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

os.environ.setdefault('STRIPE_SECRET_KEY', 'sk_placeholder')
stripe_booking = _load('stripe_booking', 'stripe-booking.py')


# ── Test infrastructure ───────────────────────────────────────────────────────
def make_handler(body_dict):
    """Create a handler instance with mocked HTTP infrastructure."""
    body_bytes = json.dumps(body_dict).encode()
    h = stripe_booking.handler.__new__(stripe_booking.handler)
    h.rfile      = io.BytesIO(body_bytes)
    h.wfile      = io.BytesIO()
    h.headers    = {'Content-Length': str(len(body_bytes))}
    h._responses = []

    h.send_response = lambda s: h._responses.append(s)
    h.send_header   = lambda k, v: None
    h.end_headers   = lambda: None
    return h


def run_post(h):
    """Invoke do_POST; return (status, parsed_body)."""
    h.do_POST()
    h.wfile.seek(0)
    raw = h.wfile.read()
    try:
        body = json.loads(raw)
    except Exception:
        body = raw.decode()
    return h._responses[0] if h._responses else None, body


_VALID_BASE = {'customerName': 'Alice', 'customerPhone': '5550001234'}


# ── T01: Unknown serviceId rejected ──────────────────────────────────────────
class TestUnknownService(unittest.TestCase):

    def test_unknown_service_id_returns_400(self):
        h = make_handler({**_VALID_BASE, 'serviceId': 'fake_xyz'})
        status, body = run_post(h)
        self.assertEqual(status, 400)
        self.assertIn('Unknown', body.get('error', ''))

    def test_empty_service_id_returns_400(self):
        h = make_handler({**_VALID_BASE, 'serviceId': ''})
        status, body = run_post(h)
        self.assertEqual(status, 400)


# ── T02: Catalog-authoritative deposit (client-supplied ignored) ──────────────
class TestCatalogAuthority(unittest.TestCase):

    @patch('stripe.checkout.Session.create')
    def test_fotobloom_deposit_from_catalog(self, mock_create):
        """fotobloom_sd deposit must be 3500 regardless of client body."""
        mock_create.return_value = MagicMock(url='https://checkout.stripe.com/cs_test')
        h = make_handler({
            **_VALID_BASE,
            'serviceId': 'fotobloom_sd',
            'deposit':   999999,   # client-supplied — must be IGNORED
        })
        status, resp = run_post(h)
        self.assertEqual(status, 200)
        unit_amount = mock_create.call_args[1]['line_items'][0]['price_data']['unit_amount']
        self.assertEqual(unit_amount, 3500)

    @patch('stripe.checkout.Session.create')
    def test_ebike_deposit_from_catalog(self, mock_create):
        """ebike_local deposit must be 1000 regardless of client body."""
        mock_create.return_value = MagicMock(url='https://checkout.stripe.com/cs_test')
        h = make_handler({
            **_VALID_BASE,
            'serviceId': 'ebike_local',
            'deposit':   50000,    # client-supplied — must be IGNORED
        })
        status, resp = run_post(h)
        self.assertEqual(status, 200)
        unit_amount = mock_create.call_args[1]['line_items'][0]['price_data']['unit_amount']
        self.assertEqual(unit_amount, 1000)

    @patch('stripe.checkout.Session.create')
    def test_bartenderduo_deposit_from_catalog(self, mock_create):
        """bartenderduo_sd deposit must be 3500."""
        mock_create.return_value = MagicMock(url='https://checkout.stripe.com/cs_test')
        h = make_handler({**_VALID_BASE, 'serviceId': 'bartenderduo_sd'})
        status, resp = run_post(h)
        self.assertEqual(status, 200)
        unit_amount = mock_create.call_args[1]['line_items'][0]['price_data']['unit_amount']
        self.assertEqual(unit_amount, 3500)


# ── T03/T04: Required field validation ───────────────────────────────────────
class TestRequiredFields(unittest.TestCase):

    def test_missing_customer_name_returns_400(self):
        # T03
        h = make_handler({'serviceId': 'fotobloom_sd', 'customerPhone': '5550001234'})
        status, body = run_post(h)
        self.assertEqual(status, 400)
        self.assertIn('customerName', body.get('error', ''))

    def test_missing_customer_phone_returns_400(self):
        # T04
        h = make_handler({'serviceId': 'fotobloom_sd', 'customerName': 'Alice'})
        status, body = run_post(h)
        self.assertEqual(status, 400)
        self.assertIn('customerPhone', body.get('error', ''))

    def test_blank_customer_name_returns_400(self):
        h = make_handler({'serviceId': 'fotobloom_sd', 'customerName': '  ', 'customerPhone': '5550001234'})
        status, body = run_post(h)
        self.assertEqual(status, 400)


# ── T05: Stripe API error handling ───────────────────────────────────────────
class TestStripeError(unittest.TestCase):

    @patch('stripe.checkout.Session.create')
    def test_stripe_error_returns_502(self, mock_create):
        # T05
        import stripe as _stripe
        mock_create.side_effect = _stripe.error.StripeError('card_error')
        h = make_handler({**_VALID_BASE, 'serviceId': 'fotobloom_sd'})
        status, resp = run_post(h)
        self.assertEqual(status, 502)


# ── T06: No STRIPE_SECRET_KEY ────────────────────────────────────────────────
class TestNoStripeKey(unittest.TestCase):

    def test_no_stripe_key_returns_503(self):
        # T06
        original = stripe_booking.stripe.api_key
        stripe_booking.stripe.api_key = ''
        try:
            h = make_handler({**_VALID_BASE, 'serviceId': 'fotobloom_sd'})
            status, body = run_post(h)
            self.assertEqual(status, 503)
        finally:
            stripe_booking.stripe.api_key = original


# ── T06b: paymentPath server-resolved from catalog ───────────────────────────
class TestPaymentPathServerResolved(unittest.TestCase):

    @patch('stripe.checkout.Session.create')
    def test_client_supplied_payment_path_2_ignored(self, mock_create):
        """Client claims paymentPath=2 for a Path 1 service — must be ignored."""
        mock_create.return_value = MagicMock(url='https://checkout.stripe.com/cs_test')
        h = make_handler({
            **_VALID_BASE,
            'serviceId':   'bartenderduo_sd',
            'paymentPath': 2,   # client lies — catalog says 1
        })
        status, resp = run_post(h)
        self.assertEqual(status, 200)
        pi_data = mock_create.call_args[1].get('payment_intent_data', {})
        # Path 1: no transfer_data or application_fee_amount
        self.assertNotIn('transfer_data', pi_data)
        self.assertNotIn('application_fee_amount', pi_data)


# ── APP_ORIGIN: server-side origin configuration ─────────────────────────────
class TestAppOrigin(unittest.TestCase):
    """APP_ORIGIN env var controls success/cancel URL base with safe fallback.

    Tests cover:
      1. Production default (APP_ORIGIN absent)
      2. Valid Preview origin accepted
      3. Malformed/untrusted values fall back to production default
      4. success_url and cancel_url use the configured origin
    """

    def _origin_for(self, app_origin_val):
        """Reload stripe-booking with a specific APP_ORIGIN and return ORIGIN."""
        os.environ.pop('APP_ORIGIN', None)
        if app_origin_val is not None:
            os.environ['APP_ORIGIN'] = app_origin_val
        try:
            path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'api', 'stripe-booking.py'))
            spec = importlib.util.spec_from_file_location('_sb_origin_probe', path)
            mod  = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod.ORIGIN
        finally:
            os.environ.pop('APP_ORIGIN', None)

    # ── 1. Production default ─────────────────────────────────────────────────

    def test_absent_app_origin_defaults_to_production(self):
        self.assertEqual(self._origin_for(None), 'https://amig0.com')

    def test_empty_app_origin_defaults_to_production(self):
        self.assertEqual(self._origin_for(''), 'https://amig0.com')

    def test_whitespace_app_origin_defaults_to_production(self):
        self.assertEqual(self._origin_for('   '), 'https://amig0.com')

    # ── 2. Valid Preview origin accepted ─────────────────────────────────────

    def test_valid_preview_origin_accepted(self):
        preview = 'https://amig0-git-phase-1-abc.vercel.app'
        self.assertEqual(self._origin_for(preview), preview)

    def test_valid_preview_origin_with_trailing_slash_normalized(self):
        """Trailing slash is stripped before validation."""
        preview = 'https://amig0-git-phase-1-abc.vercel.app'
        self.assertEqual(self._origin_for(preview + '/'), preview)

    def test_production_origin_explicit_accepted(self):
        self.assertEqual(self._origin_for('https://amig0.com'), 'https://amig0.com')

    # ── 3. Malformed/untrusted values rejected ────────────────────────────────

    def test_http_scheme_rejected(self):
        """http:// (no TLS) falls back to production default."""
        self.assertEqual(self._origin_for('http://amig0.com'), 'https://amig0.com')

    def test_javascript_scheme_rejected(self):
        """javascript: scheme cannot create an open redirect."""
        self.assertEqual(self._origin_for('javascript:evil()'), 'https://amig0.com')

    def test_data_scheme_rejected(self):
        self.assertEqual(self._origin_for('data:text/html,<script>'), 'https://amig0.com')

    def test_path_in_origin_rejected(self):
        """Origin with path component is rejected — no path injection."""
        self.assertEqual(self._origin_for('https://amig0.com/extra/path'), 'https://amig0.com')

    def test_query_string_in_origin_rejected(self):
        """Origin with query string is rejected."""
        self.assertEqual(self._origin_for('https://amig0.com?evil=1'), 'https://amig0.com')

    def test_fragment_in_origin_rejected(self):
        """Origin with fragment is rejected."""
        self.assertEqual(self._origin_for('https://amig0.com#evil'), 'https://amig0.com')

    def test_no_host_rejected(self):
        """https:// with no host is rejected."""
        self.assertEqual(self._origin_for('https://'), 'https://amig0.com')

    # ── 4. success_url and cancel_url use configured ORIGIN ───────────────────

    @patch('stripe.checkout.Session.create')
    def test_success_and_cancel_urls_use_configured_origin(self, mock_create):
        """Both success_url and cancel_url derive from ORIGIN, not a literal."""
        mock_create.return_value = MagicMock(url='https://checkout.stripe.com/cs_test')
        preview = 'https://amig0-git-phase-1-abc.vercel.app'

        original = stripe_booking.ORIGIN
        stripe_booking.ORIGIN = preview
        try:
            h = make_handler({**_VALID_BASE, 'serviceId': 'fotobloom_sd'})
            run_post(h)
        finally:
            stripe_booking.ORIGIN = original

        call_kwargs = mock_create.call_args[1]
        self.assertTrue(call_kwargs['success_url'].startswith(preview))
        self.assertTrue(call_kwargs['cancel_url'].startswith(preview))

    @patch('stripe.checkout.Session.create')
    def test_production_origin_produces_amig0_urls(self, mock_create):
        """Default ORIGIN yields amig0.com success/cancel URLs (no regression)."""
        mock_create.return_value = MagicMock(url='https://checkout.stripe.com/cs_test')

        original = stripe_booking.ORIGIN
        stripe_booking.ORIGIN = 'https://amig0.com'
        try:
            h = make_handler({**_VALID_BASE, 'serviceId': 'fotobloom_sd'})
            run_post(h)
        finally:
            stripe_booking.ORIGIN = original

        call_kwargs = mock_create.call_args[1]
        self.assertTrue(call_kwargs['success_url'].startswith('https://amig0.com'))
        self.assertTrue(call_kwargs['cancel_url'].startswith('https://amig0.com'))


if __name__ == '__main__':
    unittest.main()
