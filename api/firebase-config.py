import os
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        config = f"""const firebaseConfig = {{
  apiKey: "{os.environ.get('FIREBASE_API_KEY', '')}",
  authDomain: "amig0-travel-company-52fb1.firebaseapp.com",
  projectId: "amig0-travel-company-52fb1",
  storageBucket: "amig0-travel-company-52fb1.firebasestorage.app",
  messagingSenderId: "{os.environ.get('FIREBASE_MESSAGING_SENDER_ID', '')}",
  appId: "{os.environ.get('FIREBASE_APP_ID', '')}"
}};
firebase.initializeApp(firebaseConfig);
"""
        self.send_response(200)
        self.send_header('Content-Type', 'application/javascript')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(config.encode())

    def log_message(self, format, *args):
        pass
