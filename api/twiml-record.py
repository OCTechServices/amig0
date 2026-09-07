"""
Vercel serverless — GET/POST /api/twiml-record
Returns TwiML that records an inbound call.
One-time use: Meta WhatsApp verification call recorder.
"""
from http.server import BaseHTTPRequestHandler


TWIML = b"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Record maxLength="30" playBeep="false" />
</Response>"""


class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        self._respond()

    def do_POST(self):
        self._respond()

    def _respond(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/xml')
        self.send_header('Content-Length', str(len(TWIML)))
        self.end_headers()
        self.wfile.write(TWIML)

    def log_message(self, *args):
        pass
