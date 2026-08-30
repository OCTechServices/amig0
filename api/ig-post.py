"""
Vercel serverless function — POST /api/ig-post
Accepts base64 slide images + caption, uploads to imgbb, publishes as IG carousel.

Required env vars (set in Vercel project settings):
  IG_USER_ID      — Instagram Business account numeric ID
  IG_ACCESS_TOKEN — Long-lived user access token
  IMGBB_API_KEY   — imgbb.com API key (free tier is fine)
  PUBLISH_SECRET  — Shared token required in X-Publish-Token header

Execution budget: designed for 60s Vercel limit.
  Normal path:   ~27s
  Worst case:    ~47s (slow uploads + 1 media retry + 1 IG retry + max polling)

Internal stages:
  MEDIA_UPLOAD         — uploading slides to imgbb
  MEDIA_VERIFY         — confirming hosted URLs are reachable image assets
  IG_CHILD_CREATE      — creating Instagram child media containers
  IG_CAROUSEL_CREATE   — creating the carousel container
  IG_PROCESSING        — waiting for Instagram to process the container
  IG_PUBLISH           — publishing the carousel
  SUCCESS              — permalink obtained
  PUBLISH_STATE_UNKNOWN — publish may have succeeded but response was lost
"""
import os
import re
import json
import time
import uuid
import urllib.request
import urllib.parse
import urllib.error
from http.server import BaseHTTPRequestHandler

IG_USER_ID     = os.environ.get('IG_USER_ID', '')
IG_TOKEN       = os.environ.get('IG_ACCESS_TOKEN', '')
IMGBB_KEY      = os.environ.get('IMGBB_API_KEY', '')
PUBLISH_SECRET = os.environ.get('PUBLISH_SECRET', '')

GRAPH = 'https://graph.instagram.com/v21.0'

# IG error messages treated as potentially transient / retryable
_RETRYABLE_IG_PHRASES = [
    'only photo or video can be accepted as media type',
    'media not ready',
    'media is not yet available',
    'please try again',
    'temporarily unavailable',
    'unknown error',
]


def _is_retryable_ig_error(message: str) -> bool:
    m = message.lower()
    return any(phrase in m for phrase in _RETRYABLE_IG_PHRASES)


class _StageError(Exception):
    """Structured internal error carrying stage, retryability, and operator-safe message."""
    def __init__(self, stage: str, retryable: bool, user_message: str, log_detail: str = ''):
        self.stage        = stage
        self.retryable    = retryable
        self.user_message = user_message
        self.log_detail   = log_detail or user_message
        super().__init__(self.log_detail)


class handler(BaseHTTPRequestHandler):

    # ── Entry points ──────────────────────────────────────────────────────────

    def do_GET(self):
        """Token identity check — GET /api/ig-post in browser."""
        try:
            url = f'{GRAPH}/me?fields=id,username&access_token={urllib.parse.quote(IG_TOKEN)}'
            with urllib.request.urlopen(url, timeout=10) as resp:
                me = json.loads(resp.read())
            self._json(200, {
                'token_user_id':     me.get('id'),
                'token_username':    me.get('username'),
                'configured_user_id': IG_USER_ID,
                'match':             me.get('id') == IG_USER_ID,
            })
        except Exception as e:
            self._json(500, {'error': str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        # Auth gate
        if PUBLISH_SECRET and self.headers.get('X-Publish-Token') != PUBLISH_SECRET:
            return self._json(403, {'success': False, 'stage': 'AUTH', 'retryable': False,
                                    'message': 'Unauthorized'})
        if not IG_USER_ID or not IG_TOKEN or not IMGBB_KEY:
            return self._json(503, {'success': False, 'stage': 'CONFIG', 'retryable': False,
                                    'message': 'Missing server credentials — check Vercel env vars'})

        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._json(400, {'success': False, 'stage': 'PARSE', 'retryable': False,
                                    'message': 'Invalid JSON body'})

        slides     = body.get('slides', [])
        caption    = body.get('caption', '')
        attempt_id = body.get('attemptId') or uuid.uuid4().hex[:8]

        if len(slides) < 2:
            return self._json(400, {'success': False, 'stage': 'VALIDATE', 'retryable': False,
                                    'message': 'At least 2 slides required'})
        if len(slides) > 10:
            slides = slides[:10]

        self._log(attempt_id, 'START', f'{len(slides)} slides')
        t0    = time.time()
        stage = 'MEDIA_UPLOAD'

        try:
            # ── 1. Upload slides to imgbb ─────────────────────────────────────
            image_urls = []
            for i, b64 in enumerate(slides):
                image_urls.append(self._imgbb_upload(b64, attempt_id, i))

            # ── 2. Verify each hosted URL is a reachable image ───────────────
            stage = 'MEDIA_VERIFY'
            for i, url in enumerate(image_urls):
                self._verify_media(url, attempt_id, i)

            # ── 3. Create IG child containers (targeted retry on transient errors)
            stage = 'IG_CHILD_CREATE'
            child_ids = []
            for i, url in enumerate(image_urls):
                child_ids.append(self._ig_create_child_with_retry(url, attempt_id, i))

            # ── 4. Create carousel container ─────────────────────────────────
            stage = 'IG_CAROUSEL_CREATE'
            carousel_id = self._ig_create_carousel(child_ids, caption)
            self._log(attempt_id, stage, f'carousel_id={carousel_id}')

            # ── 5. Poll container status (replaces blind sleep) ──────────────
            stage = 'IG_PROCESSING'
            self._wait_for_container_ready(carousel_id, attempt_id)

            # ── 6. Publish ────────────────────────────────────────────────────
            stage = 'IG_PUBLISH'
            try:
                media_id = self._ig_publish(carousel_id)
                self._log(attempt_id, stage, f'media_id={media_id}')
            except urllib.error.HTTPError as pub_err:
                # IG occasionally returns 400/403 even when publish succeeded
                if pub_err.code in (400, 403):
                    elapsed = round(time.time() - t0, 1)
                    self._log(attempt_id, 'PUBLISH_STATE_UNKNOWN',
                              f'code={pub_err.code} elapsed={elapsed}s — post may have published')
                    return self._json(200, {
                        'success': True,
                        'stage':   'PUBLISH_STATE_UNKNOWN',
                        'attemptId': attempt_id,
                        'permalink': f'https://www.instagram.com/{IG_USER_ID}/',
                        'warning':  (f'IG returned HTTP {pub_err.code} on publish. '
                                     'The post likely went through — verify on @amig0trips '
                                     f'before retrying. (attempt: {attempt_id})'),
                    })
                raise

            # ── 7. Fetch permalink ────────────────────────────────────────────
            permalink = self._ig_permalink(media_id)
            elapsed   = round(time.time() - t0, 1)
            self._log(attempt_id, 'SUCCESS', f'permalink={permalink} elapsed={elapsed}s')
            return self._json(200, {
                'success':   True,
                'stage':     'SUCCESS',
                'attemptId': attempt_id,
                'permalink': permalink,
                'media_id':  media_id,
            })

        except _StageError as e:
            elapsed = round(time.time() - t0, 1)
            self._log(attempt_id, e.stage,
                      f'FAILED retryable={e.retryable} detail={e.log_detail} elapsed={elapsed}s')
            return self._json(502, {
                'success':   False,
                'stage':     e.stage,
                'retryable': e.retryable,
                'attemptId': attempt_id,
                'message':   e.user_message,
            })

        except urllib.error.HTTPError as e:
            elapsed = round(time.time() - t0, 1)
            try:
                err_obj = json.loads(e.read().decode()).get('error', {})
            except Exception:
                err_obj = {}
            msg      = err_obj.get('message', f'HTTP {e.code}')
            retryable = _is_retryable_ig_error(msg)
            self._log(attempt_id, stage,
                      f'HTTPError code={e.code} msg={msg} retryable={retryable} elapsed={elapsed}s')
            return self._json(502, {
                'success':   False,
                'stage':     stage,
                'retryable': retryable,
                'attemptId': attempt_id,
                'message':   ('A publishing step failed and may be retried.'
                              if retryable else
                              'A non-recoverable error occurred.'),
            })

        except Exception as e:
            elapsed = round(time.time() - t0, 1)
            self._log(attempt_id, stage, f'Exception={e} elapsed={elapsed}s')
            return self._json(500, {
                'success':   False,
                'stage':     stage,
                'retryable': False,
                'attemptId': attempt_id,
                'message':   'An unexpected error occurred.',
            })

    # ── imgbb ─────────────────────────────────────────────────────────────────

    def _imgbb_upload(self, data_url: str, attempt_id: str, idx: int) -> str:
        b64 = data_url.split(',', 1)[1] if ',' in data_url else data_url
        payload = urllib.parse.urlencode({'key': IMGBB_KEY, 'image': b64}).encode()
        req = urllib.request.Request('https://api.imgbb.com/1/upload', data=payload)
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                result = json.loads(resp.read())
        except Exception as exc:
            raise _StageError('MEDIA_UPLOAD_FAILED', True,
                              f'Slide {idx + 1} could not be uploaded. Please try again.',
                              f'imgbb network error slide={idx}: {exc}')
        if not result.get('success'):
            raise _StageError('MEDIA_UPLOAD_FAILED', True,
                              f'Slide {idx + 1} upload failed. Please try again.',
                              f'imgbb failure slide={idx}: {result}')
        url = result['data'].get('display_url') or result['data']['url']
        self._log(attempt_id, 'MEDIA_UPLOAD', f'slide={idx} url={url}')
        return url

    # ── Media readiness verification ──────────────────────────────────────────

    def _verify_media(self, url: str, attempt_id: str, idx: int):
        """HEAD the imgbb URL to confirm it returns HTTP 200 with an image Content-Type.
        One retry after 1s on soft failure. 3s timeout each attempt.
        Budget per slide: healthy ~0.1s, worst case ~4.1s.
        """
        for attempt in range(2):
            status       = None
            content_type = ''
            try:
                req = urllib.request.Request(url, method='HEAD')
                with urllib.request.urlopen(req, timeout=3) as resp:
                    status       = resp.status
                    content_type = resp.headers.get('Content-Type', '')
                    content_length = resp.headers.get('Content-Length', 'unknown')

                if status == 200 and content_type.startswith('image/'):
                    self._log(attempt_id, 'MEDIA_VERIFY',
                              f'slide={idx} ok ct={content_type} cl={content_length} attempt={attempt}')
                    return  # verified — continue immediately

                self._log(attempt_id, 'MEDIA_VERIFY',
                          f'slide={idx} unexpected status={status} ct={content_type} attempt={attempt}')

            except Exception as exc:
                self._log(attempt_id, 'MEDIA_VERIFY',
                          f'slide={idx} error={exc} attempt={attempt}')

            if attempt == 0:
                time.sleep(1)

        # Both attempts failed — stop before Instagram ingestion
        raise _StageError('MEDIA_NOT_READY', False,
                          f'Slide {idx + 1} could not be confirmed as a valid image. Please try again.',
                          f'media verify failed after 2 attempts slide={idx} url={url} '
                          f'last_status={status} last_ct={content_type}')

    # ── Instagram child containers ────────────────────────────────────────────

    def _ig_create_child_with_retry(self, image_url: str, attempt_id: str, idx: int) -> str:
        """Create one child container. Retries once (after 2s) on known transient IG media errors."""
        for attempt in range(2):
            try:
                child_id = self._ig_create_child(image_url)
                self._log(attempt_id, 'IG_CHILD_CREATE',
                          f'slide={idx} child_id={child_id} attempt={attempt}')
                return child_id

            except urllib.error.HTTPError as e:
                try:
                    err_obj = json.loads(e.read().decode()).get('error', {})
                except Exception:
                    err_obj = {}
                msg     = err_obj.get('message', '')
                code    = err_obj.get('code', e.code)
                subcode = err_obj.get('error_subcode', '')
                self._log(attempt_id, 'IG_CHILD_CREATE',
                          f'slide={idx} attempt={attempt} code={code} subcode={subcode} msg={msg}')

                retryable = _is_retryable_ig_error(msg)
                if attempt == 0 and retryable:
                    time.sleep(2)
                    continue  # retry this child only

                raise _StageError(
                    'IG_CHILD_CREATE_FAILED', retryable,
                    ('A slide could not be prepared for Instagram. Please try again.'
                     if retryable else
                     f'Instagram rejected slide {idx + 1}.'),
                    f'IG child create failed slide={idx} code={code} subcode={subcode} msg={msg}')

    def _ig_create_child(self, image_url: str) -> str:
        params = {
            'image_url':       image_url,
            'is_carousel_item': 'true',
            'access_token':    IG_TOKEN,
        }
        return self._ig_post(f'{GRAPH}/{IG_USER_ID}/media', params)

    def _ig_create_carousel(self, child_ids: list, caption: str) -> str:
        params = {
            'media_type':   'CAROUSEL',
            'children':     ','.join(child_ids),
            'caption':      caption,
            'access_token': IG_TOKEN,
        }
        return self._ig_post(f'{GRAPH}/{IG_USER_ID}/media', params)

    def _ig_publish(self, creation_id: str) -> str:
        params = {'creation_id': creation_id, 'access_token': IG_TOKEN}
        return self._ig_post(f'{GRAPH}/{IG_USER_ID}/media_publish', params)

    # ── Container status polling ──────────────────────────────────────────────

    def _wait_for_container_ready(self, container_id: str, attempt_id: str,
                                   max_polls: int = 5, poll_interval: int = 2):
        """Poll IG container status_code instead of a blind sleep.
        Ceiling: max_polls × poll_interval = 10s.
        FINISHED   → proceed.
        ERROR/EXPIRED → fail with diagnostic.
        IN_PROGRESS / unknown → wait and poll again.
        Polling ceiling reached → attempt publish anyway (better than hard fail).
        """
        for poll in range(max_polls):
            try:
                url = (f'{GRAPH}/{container_id}'
                       f'?fields=status_code,status'
                       f'&access_token={urllib.parse.quote(IG_TOKEN)}')
                with urllib.request.urlopen(url, timeout=5) as resp:
                    data        = json.loads(resp.read())
                status_code = data.get('status_code', '')
                self._log(attempt_id, 'IG_PROCESSING',
                          f'poll={poll} status_code={status_code}')

                if status_code == 'FINISHED':
                    return
                if status_code in ('ERROR', 'EXPIRED'):
                    raise _StageError('IG_PROCESSING_FAILED', True,
                                      'Instagram could not process the carousel. Please try again.',
                                      f'container status={status_code}')
                # IN_PROGRESS or unrecognised — continue polling

            except _StageError:
                raise
            except Exception as exc:
                self._log(attempt_id, 'IG_PROCESSING', f'poll={poll} error={exc}')

            if poll < max_polls - 1:
                time.sleep(poll_interval)

        # Polling ceiling reached without FINISHED — proceed to publish rather than hard-failing
        self._log(attempt_id, 'IG_PROCESSING',
                  'polling ceiling reached — proceeding to publish attempt')

    def _ig_permalink(self, media_id: str) -> str:
        try:
            url = (f'{GRAPH}/{media_id}'
                   f'?fields=permalink&access_token={urllib.parse.quote(IG_TOKEN)}')
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read())
            return data.get('permalink') or f'https://www.instagram.com/{IG_USER_ID}/'
        except Exception:
            return f'https://www.instagram.com/{IG_USER_ID}/'

    def _ig_post(self, url: str, params: dict) -> str:
        """POST params as query string. Returns result['id']."""
        full_url = f'{url}?{urllib.parse.urlencode(params)}'
        req = urllib.request.Request(full_url, method='POST')
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        if 'id' not in result:
            raise Exception(f'Unexpected IG response (no id): {result}')
        return result['id']

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _log(self, attempt_id: str, stage: str, msg: str):
        # Scrub tokens before logging
        safe = re.sub(r'access_token=[^&\s]+', 'access_token=REDACTED', str(msg))
        print(f'[ig-post] [{attempt_id}] [{stage}] {safe}')

    def _json(self, status: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin',  'https://amig0.com')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Publish-Token')

    def log_message(self, fmt, *args):
        pass  # suppress default BaseHTTPRequestHandler request logging
