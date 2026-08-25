"""
Vercel serverless function — POST /api/ig-post
Accepts base64 slide images + caption, uploads to imgbb, publishes as IG carousel.

Required env vars (set in Vercel project settings):
  IG_USER_ID      — Instagram Business account numeric ID
  IG_ACCESS_TOKEN — Long-lived user access token
  IMGBB_API_KEY   — imgbb.com API key (free tier is fine)
"""
import os
import json
import time
import urllib.request
import urllib.parse
import urllib.error
from http.server import BaseHTTPRequestHandler

IG_USER_ID = os.environ.get('IG_USER_ID', '')
IG_TOKEN   = os.environ.get('IG_ACCESS_TOKEN', '')
IMGBB_KEY  = os.environ.get('IMGBB_API_KEY', '')

GRAPH = 'https://graph.instagram.com/v21.0'


class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        """Token identity check — visit /api/ig-post in browser to verify."""
        try:
            url = f'{GRAPH}/me?fields=id,username&access_token={urllib.parse.quote(IG_TOKEN)}'
            with urllib.request.urlopen(url, timeout=10) as resp:
                me = json.loads(resp.read())
            self._json(200, {
                'token_user_id': me.get('id'),
                'token_username': me.get('username'),
                'configured_user_id': IG_USER_ID,
                'match': me.get('id') == IG_USER_ID,
            })
        except Exception as e:
            self._json(500, {'error': str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not IG_USER_ID or not IG_TOKEN or not IMGBB_KEY:
            return self._json(503, {'error': 'Missing server credentials — check Vercel env vars'})

        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._json(400, {'error': 'Invalid JSON body'})

        slides  = body.get('slides', [])   # list of base64 data-URL strings
        caption = body.get('caption', '')

        if len(slides) < 2:
            return self._json(400, {'error': 'Instagram carousels require at least 2 slides'})
        if len(slides) > 10:
            slides = slides[:10]           # IG carousel max is 10

        image_urls = []
        try:
            # 1 — Upload each slide to imgbb → collect public URLs
            for b64 in slides:
                image_urls.append(self._imgbb_upload(b64))

            # 2 — Create IG child media containers
            child_ids = []
            for url in image_urls:
                child_ids.append(self._ig_create_child(url))

            # 3 — Create carousel container then wait until ready
            carousel_id = self._ig_create_carousel(child_ids, caption)
            self._wait_for_container(carousel_id)

            # 4 — Publish
            # IG sometimes returns 400/403 even when the publish succeeds — treat as soft success
            try:
                media_id = self._ig_publish(carousel_id)
            except urllib.error.HTTPError as pub_err:
                if pub_err.code in (400, 403):
                    return self._json(200, {
                        'permalink': f'https://www.instagram.com/{IG_USER_ID}/',
                        'media_id': carousel_id,
                        'warning': f'IG returned {pub_err.code} on publish — post likely went through. Verify on @amig0trips.'
                    })
                raise

            permalink = self._ig_permalink(media_id)
            return self._json(200, {'permalink': permalink, 'media_id': media_id})

        except urllib.error.HTTPError as e:
            try:
                detail = json.loads(e.read().decode()).get('error', {}).get('message', '')
            except Exception:
                detail = ''
            return self._json(502, {'error': f'API error {e.code}: {detail}', 'image_urls': image_urls})
        except Exception as e:
            return self._json(500, {'error': str(e)})

    # ── imgbb ──────────────────────────────────────────────────────────────────
    def _imgbb_upload(self, data_url):
        """Upload a base64 image to imgbb and return the direct image URL."""
        b64 = data_url.split(',', 1)[1] if ',' in data_url else data_url
        payload = urllib.parse.urlencode({'key': IMGBB_KEY, 'image': b64}).encode()
        req = urllib.request.Request('https://api.imgbb.com/1/upload', data=payload)
        with urllib.request.urlopen(req, timeout=45) as resp:
            result = json.loads(resp.read())
        if not result.get('success'):
            raise Exception(f'imgbb upload failed: {result}')
        # display_url is the direct JPEG/PNG URL — more reliably fetched by Instagram
        return result['data'].get('display_url') or result['data']['url']

    # ── Instagram Graph API ───────────────────────────────────────────────────
    def _ig_create_child(self, image_url):
        """Create a carousel child media container, return its ID."""
        params = {
            'image_url': image_url,
            'is_carousel_item': 'true',
            'access_token': IG_TOKEN,
        }
        return self._ig_post(f'{GRAPH}/{IG_USER_ID}/media', params)

    def _ig_create_carousel(self, child_ids, caption):
        """Create the carousel container from child IDs, return its ID."""
        params = {
            'media_type': 'CAROUSEL',
            'children': ','.join(child_ids),
            'caption': caption,
            'access_token': IG_TOKEN,
        }
        return self._ig_post(f'{GRAPH}/{IG_USER_ID}/media', params)

    def _ig_publish(self, creation_id):
        """Publish the carousel, return the published media ID."""
        params = {'creation_id': creation_id, 'access_token': IG_TOKEN}
        return self._ig_post(f'{GRAPH}/{IG_USER_ID}/media_publish', params)

    def _wait_for_container(self, container_id, max_wait=30):
        """Wait for IG to process the carousel container before publishing."""
        time.sleep(5)

    def _ig_permalink(self, media_id):
        """Fetch the permalink for a published media ID."""
        try:
            url = f'{GRAPH}/{media_id}?fields=permalink&access_token={urllib.parse.quote(IG_TOKEN)}'
            with urllib.request.urlopen(url, timeout=15) as resp:
                data = json.loads(resp.read())
            return data.get('permalink') or f'https://www.instagram.com/{IG_USER_ID}/'
        except Exception:
            return f'https://www.instagram.com/{IG_USER_ID}/'

    def _ig_post(self, url, params, _retry=True):
        """POST with params as query string (matches Graph API expected format), return result['id'].
        Retries once on 403 rate-limit — IG sometimes returns 403 even when the operation succeeds."""
        full_url = f'{url}?{urllib.parse.urlencode(params)}'
        req = urllib.request.Request(full_url, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                result = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 403 and _retry:
                time.sleep(4)
                return self._ig_post(url, params, _retry=False)
            raise
        if 'id' not in result:
            raise Exception(f'Unexpected IG response: {result}')
        return result['id']

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
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, fmt, *args):
        if '/api/' in str(args[0] if args else ''):
            print(f'[ig-post] {args}')
