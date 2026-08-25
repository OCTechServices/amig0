"""
Vercel serverless function — POST /api/hacks
Two modes:
  - Discover: {city, preferences: [...]} — Claude picks venues based on interests
  - Custom:   {city, locations: "..."}  — Claude generates hacks for named venues

Set ANTHROPIC_API_KEY in Vercel project settings.
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

        city        = body.get('city', '').strip()
        locations   = body.get('locations', '').strip()
        preferences = body.get('preferences', [])
        session     = int(body.get('session', 1))

        if not city:
            return self._json(400, {'error': 'city is required'})

        if preferences:
            prompt = self._discover_prompt(city, preferences, session)
        elif locations:
            prompt = self._custom_prompt(city, locations)
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
            msg = {
                401: 'Invalid API key — verify at console.anthropic.com',
                429: 'Rate limit hit — wait a moment and try again',
                500: 'Anthropic server error — try again shortly',
            }.get(e.code, f'Anthropic API error {e.code}')
            if detail:
                msg += f': {detail}'
            self._json(502, {'error': msg})
        except (KeyError, json.JSONDecodeError) as e:
            self._json(502, {'error': f'Could not parse response: {e}'})
        except Exception as e:
            self._json(500, {'error': str(e)})

    def _discover_prompt(self, city, preferences, session=1):
        prefs = ', '.join(preferences)
        # Rotate focus: different neighborhoods / scenes / angles each session
        focus_angles = [
            'Focus on spots in less-visited neighborhoods — avoid the obvious tourist zones.',
            'Focus on nightlife and late-night culture. Think after-midnight locals.',
            'Focus on daytime experiences — morning routines, markets, coffee culture.',
            'Focus on spots with strong local community ties — places regulars return to weekly.',
            'Focus on spots that blend two or more of the interests in unexpected ways.',
            'Focus on recent openings or spots that became local favorites in the last 2 years.',
            'Focus on places with a strong sensory identity — sound, design, smell, texture.',
            'Focus on spots that are off social media — the kind locals don\'t post about.',
            'Focus on experiences tied to the city\'s cultural calendar — seasonal, recurring.',
            'Focus on spots where creative or artistic communities actually gather.',
        ]
        angle = focus_angles[(session - 1) % len(focus_angles)]
        return (
            f"You are a savvy local travel insider helping international travelers discover the best of {city}.\n\n"
            f"City: {city}\n"
            f"Traveler interests: {prefs}\n\n"
            f"HARD RULE — Interest alignment: Every single venue you recommend MUST directly serve at least one of "
            f"the stated interests. If the interest is 'Arts', only recommend art galleries, studios, street art "
            f"destinations, cultural centers, or art-focused experiences. If 'Live Music', only recommend venues "
            f"where live music is a core offering. If 'Theatre', only recommend performance spaces, improv venues, "
            f"or experimental stages. Do not include general restaurants, hotels, or shopping unless they directly "
            f"fulfill an interest category.\n\n"
            f"HARD RULE — Variety: Do not default to the most obvious or most Googled establishments. "
            f"{angle}\n\n"
            f"Step 1: Identify exactly 5 venues, bars, galleries, trails, or experiences in {city} that pass both "
            f"rules above. Choose places a well-connected local would actually recommend — not tourist traps.\n\n"
            "Step 2: For each place, generate 3-5 specific, actionable insider hacks using these types:\n"
            "- app: digital tools, apps, cashback platforms, or loyalty programs to use\n"
            "- timing: best time to visit, happy hours, live sets, quiet hours, seasonal advantages\n"
            "- local_alternative: a better or less obvious nearby option a local would know\n"
            "- pro_tip: insider knowledge — what to order, where to sit, what to ask for, what to avoid\n\n"
            "Rules:\n"
            "- Tone: confident and insider. Smart travel, not budget travel.\n"
            "- Be specific to the city and each venue. No generic advice.\n"
            "- Mix hack types across hacks — don't use all pro_tip.\n"
            "- lat/lng: provide the approximate latitude and longitude of each venue (nearest block is fine).\n"
            "- website: official website URL if you are confident it is correct — omit or leave empty string if unsure.\n"
            "- instagram: Instagram handle (without @) if you are confident it is correct — omit or leave empty string if unsure.\n\n"
            f"HARD RULE — Authenticity: Only recommend venues you are CERTAIN exist and are currently "
            f"operating in {city}. Do not invent, fabricate, or combine venues. If you are not "
            f"confident a place is real and open right now, exclude it and replace it with one you "
            f"are certain about. This is a factual platform — accuracy is non-negotiable.\n\n"
            "Respond with valid JSON only — no markdown, no code fences, no extra text.\n"
            "Schema:\n"
            '{"destination":"...","locations":[{"name":"...","category":"Shopping|Dining|Entertainment|Bar|Music|Art|Nature|Market|Other","lat":0.0,"lng":0.0,"website":"","instagram":"","hacks":[{"type":"app|timing|local_alternative|pro_tip","tip":"..."}]}]}'
        )

    def _custom_prompt(self, city, locations):
        return (
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
            "- If a venue doesn't exist in that city, suggest the closest local equivalent.\n"
            "- website: official website URL if you are confident it is correct — omit or leave empty string if unsure.\n"
            "- instagram: Instagram handle (without @) if you are confident it is correct — omit or leave empty string if unsure.\n\n"
            "Respond with valid JSON only — no markdown, no code fences, no extra text.\n"
            "Schema:\n"
            '{"destination":"...","locations":[{"name":"...","category":"Shopping|Dining|Entertainment|Bar|Music|Art|Nature|Market|Other","website":"","instagram":"","hacks":[{"type":"app|timing|local_alternative|pro_tip","tip":"..."}]}]}'
        )

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
        pass
