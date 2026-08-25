#!/usr/bin/env python3
"""
Discipline Tracker — local dev server
Serves the amig0 project and proxies recipe requests to the Anthropic API.

Usage:
    ANTHROPIC_API_KEY=sk-ant-... python3 health/server.py

Then open: http://localhost:8082/health/
"""
import os
import json
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
PORT    = int(os.environ.get('PORT', 8082))  # Render sets PORT automatically
ROOT    = Path(__file__).parent.parent  # amig0/


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # ── CORS preflight ────────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    # ── POST handlers ─────────────────────────────────────────────────────────
    def do_POST(self):
        if self.path == '/api/recipe':
            self._recipe()
        elif self.path == '/api/hacks':
            self._hacks()
        else:
            self.send_error(404)

    def _recipe(self):
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
                # Extract the JSON object regardless of markdown wrapping
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

    def _hacks(self):
        if not API_KEY:
            return self._json(503, {'error': 'ANTHROPIC_API_KEY not set on server'})

        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._json(400, {'error': 'Invalid JSON body'})

        city        = body.get('city', '').strip()
        locations   = body.get('locations', '').strip()
        preferences = body.get('preferences', [])

        if not city:
            return self._json(400, {'error': 'city is required'})

        if preferences:
            prefs  = ', '.join(preferences)
            prompt = (
                f"You are a savvy local travel insider helping international travelers discover the best of {city}.\n\n"
                f"City: {city}\n"
                f"Traveler interests: {prefs}\n\n"
                f"Step 1: Identify exactly 5 of the best venues, bars, restaurants, galleries, trails, or experiences "
                f"in {city} that match these interests. Choose places a well-connected local would actually recommend — "
                f"not tourist traps.\n\n"
                "Step 2: For each place, generate 3-5 specific, actionable insider hacks using these types:\n"
                "- app: digital tools, apps, cashback platforms, or loyalty programs to use\n"
                "- timing: best time to visit, happy hours, live sets, quiet hours, seasonal advantages\n"
                "- local_alternative: a better or less obvious nearby option a local would know\n"
                "- pro_tip: insider knowledge — what to order, where to sit, what to ask for, what to avoid\n\n"
                "Rules:\n"
                "- Tone: confident and insider. Smart travel, not budget travel.\n"
                "- Be specific to the city and each venue. No generic advice.\n"
                "- Mix hack types across hacks — don't use all pro_tip.\n\n"
                "Respond with valid JSON only — no markdown, no code fences, no extra text.\n"
                "Schema:\n"
                '{"destination":"...","locations":[{"name":"...","category":"Shopping|Dining|Entertainment|Bar|Music|Art|Nature|Market|Other","hacks":[{"type":"app|timing|local_alternative|pro_tip","tip":"..."}]}]}'
            )
        elif locations:
            prompt = (
                f"You are a savvy local travel insider helping international travelers spend smarter — "
                f"without ever feeling like a budget tourist.\n\n"
                f"City: {city}\n"
                f"Venues/stores the traveler plans to visit: {locations}\n\n"
                "For each venue, generate 3-5 specific, actionable insider hacks using these types:\n"
                "- app: digital tools, apps, cashback platforms, or loyalty programs to use\n"
                "- timing: best time to visit, happy hours, sales cycles, off-peak advantages\n"
                "- local_alternative: a better or cheaper nearby option a local would know\n"
                "- pro_tip: insider knowledge — how to negotiate, what to ask for, what locals do\n\n"
                "Rules:\n"
                "- Tone: confident and insider. Smart travel, not budget travel.\n"
                "- Be specific to the city and venue. No generic advice.\n"
                "- If a venue doesn't exist in that city, suggest the closest local equivalent.\n\n"
                "Respond with valid JSON only — no markdown, no code fences, no extra text.\n"
                "Schema:\n"
                '{"destination":"...","locations":[{"name":"...","category":"Shopping|Dining|Entertainment|Bar|Music|Art|Nature|Market|Other","hacks":[{"type":"app|timing|local_alternative|pro_tip","tip":"..."}]}]}'
            )
        else:
            return self._json(400, {'error': 'Either locations or preferences is required'})

        payload = json.dumps({
            'model': 'claude-haiku-4-5-20251001',
            'max_tokens': 2048,
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
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = json.loads(resp.read())
                text = data['content'][0]['text'].strip()
                start, end = text.find('{'), text.rfind('}')
                if start == -1 or end == -1:
                    raise json.JSONDecodeError('No JSON object found', text, 0)
                result = json.loads(text[start:end + 1])
                self._json(200, result)
        except urllib.error.HTTPError as e:
            try:
                detail = json.loads(e.read().decode()).get('error', {}).get('message', '')
            except Exception:
                detail = ''
            msg = {401: 'Invalid API key', 429: 'Rate limit hit', 500: 'Anthropic server error'}.get(e.code, f'API error {e.code}')
            if detail:
                msg += f': {detail}'
            self._json(502, {'error': msg})
        except (KeyError, json.JSONDecodeError) as e:
            self._json(502, {'error': f'Could not parse hacks: {e}'})
        except Exception as e:
            self._json(500, {'error': str(e)})

    # ── Helpers ───────────────────────────────────────────────────────────────
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
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, fmt, *args):
        # Only log API calls, suppress static file noise
        if '/api/' in str(args[0] if args else ''):
            print(f'[recipe] {args}')


if __name__ == '__main__':
    if not API_KEY:
        print('⚠  ANTHROPIC_API_KEY not set — recipe feature will return errors.')
        print('   Run with: ANTHROPIC_API_KEY=sk-ant-... python3 health/server.py\n')
    else:
        print(f'✓  API key loaded ({API_KEY[:12]}...)')

    print(f'✓  Serving from {ROOT}')
    print(f'✓  Open: http://localhost:{PORT}/health/\n')
    HTTPServer(('', PORT), Handler).serve_forever()
