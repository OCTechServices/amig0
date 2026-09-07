"""
Vercel serverless — GET /api/wa-webhook
Handles Meta's webhook verification handshake for WhatsApp Cloud API.
Also accepts POST for inbound messages (currently logs and acknowledges only).

Required Vercel env vars:
  WA_VERIFY_TOKEN — any string you choose; must match what you enter in Meta Developer App
"""
import os
import json
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler

WA_VERIFY_TOKEN = os.environ.get('WA_VERIFY_TOKEN', '')


class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        """Meta webhook verification challenge."""
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        mode      = params.get('hub.mode',         [''])[0]
        token     = params.get('hub.verify_token', [''])[0]
        challenge = params.get('hub.challenge',    [''])[0]

        if mode == 'subscribe' and token == WA_VERIFY_TOKEN:
            body = challenge.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(403)
            self.end_headers()

    def do_POST(self):
        """Inbound WhatsApp messages — acknowledge and log."""
        length  = int(self.headers.get('Content-Length', 0))
        payload = self.rfile.read(length)
        try:
            data = json.loads(payload)
            print(f'[wa-webhook] inbound: {json.dumps(data)[:500]}')
        except Exception:
            pass
        # Always return 200 — Meta retries on any other status
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass
