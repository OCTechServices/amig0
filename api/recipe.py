"""
Vercel serverless function — POST /api/recipe
Proxies recipe requests to the Anthropic API.

Set ANTHROPIC_API_KEY in Vercel project settings (Environment Variables).
"""
import os
import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not API_KEY:
            return self._json(503, {'error': 'ANTHROPIC_API_KEY not set on server'})

        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._json(400, {'error': 'Invalid JSON body'})

        ingredients = body.get('ingredients', '').strip()
        goal        = body.get('goal', 'balanced and nutritious')

        if not ingredients:
            return self._json(400, {'error': 'No ingredients provided'})

        prompt = (
            f"You are a nutritionist chef. Create one healthy recipe using these ingredients: {ingredients}.\n"
            f"Dietary goal: {goal}.\n\n"
            "Respond with valid JSON only — no markdown, no code fences, no extra text.\n"
            "Use exactly this schema:\n"
            '{"name":"...","time":"...","servings":2,"difficulty":"Easy|Medium|Hard",'
            '"ingredients":["..."],"steps":["..."],'
            '"nutrition":{"calories":0,"protein":"0g","carbs":"0g","fat":"0g"},'
            '"tip":"..."}'
        )

        payload = json.dumps({
            'model': 'claude-haiku-4-5-20251001',
            'max_tokens': 1024,
            'messages': [{'role': 'user', 'content': prompt}]
        }).encode()

        req = urllib.request.Request(
            'https://api.anthropic.com/v1/messages',
            data=payload,
            headers={
                'x-api-key': API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            }
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
                text = data['content'][0]['text'].strip()
                start, end = text.find('{'), text.rfind('}')
                if start == -1 or end == -1:
                    raise json.JSONDecodeError('No JSON object found', text, 0)
                recipe = json.loads(text[start:end + 1])
                self._json(200, recipe)
        except urllib.error.HTTPError as e:
            try:
                detail = json.loads(e.read().decode()).get('error', {}).get('message', '')
            except Exception:
                detail = ''
            msg = {
                401: 'Invalid API key — verify at console.anthropic.com',
                429: 'Rate limit hit — wait a moment and try again',
                500: 'Anthropic server error — try again shortly',
            }.get(e.code, f'Anthropic API error {e.code}')
            if detail:
                msg += f': {detail}'
            self._json(502, {'error': msg})
        except (KeyError, json.JSONDecodeError) as e:
            self._json(502, {'error': f'Could not parse recipe: {e}'})
        except Exception as e:
            self._json(500, {'error': str(e)})

    def _json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, fmt, *args):
        pass  # suppress log noise
