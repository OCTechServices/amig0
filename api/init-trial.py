"""
Vercel serverless — POST /api/init-trial
Initialises a trial amig0 membership for a newly signed-in user.

Security properties:
- Firebase ID token required in Authorization: Bearer header.
- UID is derived from the verified token; the request body is ignored entirely.
- Server chooses all entitlement timestamps — client cannot influence them.
- Idempotent: returns existing status when the membership doc already exists.
- Does not overwrite an existing active/past_due/canceled subscription.

Required Vercel env vars:
  FIREBASE_SERVICE_ACCOUNT — base64-encoded service account JSON
"""
import os, json, base64, datetime
import firebase_admin
from firebase_admin import credentials, firestore, auth
from http.server import BaseHTTPRequestHandler

TRIAL_DAYS = 7
ORIGIN     = 'https://amig0.com'

_db = None


def _get_db():
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
        # Verify Firebase ID token — UID comes from the token, never the body.
        auth_header = self.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return self._json(401, {'error': 'Missing Bearer token'})
        id_token = auth_header[7:].strip()
        if not id_token:
            return self._json(401, {'error': 'Empty token'})

        try:
            decoded = auth.verify_id_token(id_token)
        except Exception:
            return self._json(401, {'error': 'Invalid or expired token'})

        uid   = decoded['uid']
        email = decoded.get('email', '')

        try:
            db  = _get_db()
            ref = db.collection('amig0_members').document(uid)
            snap = ref.get()

            if snap.exists:
                # Idempotent — return current status without modifying the doc.
                return self._json(200, {
                    'status':   snap.get('subscriptionStatus'),
                    'existing': True
                })

            # Server-controlled timestamps — not derived from any client input.
            now       = datetime.datetime.now(datetime.timezone.utc)
            trial_end = now + datetime.timedelta(days=TRIAL_DAYS)

            ref.set({
                'subscriptionStatus': 'trial',
                'trialStartedAt':     now,
                'trialEndsAt':        trial_end,
                'email':              email,
                'createdAt':          now,
            })

            return self._json(200, {'status': 'trial', 'existing': False})

        except RuntimeError as e:
            return self._json(503, {'error': str(e)})
        except Exception as e:
            print(f'[init-trial] error: {e}')
            return self._json(500, {'error': 'Internal error'})

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin',  ORIGIN)
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def _json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
