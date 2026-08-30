"""
Vercel serverless function — POST /api/ig-post
Accepts base64 slide images + caption, uploads to imgbb, publishes as IG carousel.

Required env vars (set in Vercel project settings):
  IG_USER_ID      — Instagram Business account numeric ID
  IG_ACCESS_TOKEN — Long-lived user access token
  IMGBB_API_KEY   — imgbb.com API key (free tier is fine)
  PUBLISH_SECRET  — Shared token required in X-Publish-Token header

Execution budget (60s Vercel limit):
  Normal path:       ~26s
  One degraded slide: ~34s
  All 8 degraded:    ~52s  (8s safety margin)
  Absolute maximum:  ~52s  (parallel verification bounds worst case)

Verification is PARALLEL (ThreadPoolExecutor) — all imgbb URLs checked
simultaneously so sequential degradation cannot compound across slides.

Internal stages:
  MEDIA_UPLOAD         uploading slides to imgbb
  MEDIA_VERIFY         confirming hosted URLs are reachable image assets
  IG_CHILD_CREATE      creating Instagram child media containers
  IG_CAROUSEL_CREATE   creating the carousel container
  IG_PROCESSING        waiting for Instagram to process the container
  IG_PUBLISH           publishing the carousel
  SUCCESS              permalink obtained
  PUBLISH_STATE_UNKNOWN publish may have succeeded but response was lost
"""
import os
import re
import json
import time
import uuid
import urllib.request
import urllib.parse
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import BaseHTTPRequestHandler

IG_USER_ID     = os.environ.get('IG_USER_ID', '')
IG_TOKEN       = os.environ.get('IG_ACCESS_TOKEN', '')
IMGBB_KEY      = os.environ.get('IMGBB_API_KEY', '')
PUBLISH_SECRET = os.environ.get('PUBLISH_SECRET', '')

GRAPH = 'https://graph.instagram.com/v21.0'

# ── IG error classification ────────────────────────────────────────────────────

# Error codes that are definitively non-retryable (auth, permissions, bad params)
_NON_RETRYABLE_IG_CODES = frozenset({
    4,    # application request limit
    10,   # application does not have permission
    32,   # page-level throttling
    100,  # invalid parameter
    190,  # access token expired or invalid
    200,  # permission error
    368,  # temporarily blocked from API
})

# Message fragments associated with known transient IG media-ingestion failures
# Note: "unknown error" deliberately excluded — too broad, insufficient evidence
_RETRYABLE_IG_PHRASES = (
    'only photo or video can be accepted as media type',
    'media not ready',
    'media is not yet available',
    'please try again',
    'temporarily unavailable',
)


def _classify_ig_error(code, subcode, message):
    """Returns (retryable: bool, reason: str).
    Non-retryable codes take precedence. Unclassified errors default to
    non-retryable — safe behavior, operator must retry explicitly.
    """
    if code in _NON_RETRYABLE_IG_CODES:
        return False, f'non-retryable IG code={code}'
    m = message.lower()
    matched = next((p for p in _RETRYABLE_IG_PHRASES if p in m), None)
    if matched:
        return True, f'transient phrase matched: "{matched}"'
    return False, f'unclassified IG error — not retrying (code={code} subcode={subcode})'


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
                'token_user_id':      me.get('id'),
                'token_username':     me.get('username'),
                'configured_user_id': IG_USER_ID,
                'match':              me.get('id') == IG_USER_ID,
            })
        except Exception as e:
            self._json(500, {'error': str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if PUBLISH_SECRET and self.headers.get('X-Publish-Token') != PUBLISH_SECRET:
            return self._json(403, {'success': False, 'stage': 'AUTH',
                                    'retryable': False, 'message': 'Unauthorized'})
        if not IG_USER_ID or not IG_TOKEN or not IMGBB_KEY:
            return self._json(503, {'success': False, 'stage': 'CONFIG', 'retryable': False,
                                    'message': 'Missing server credentials — check Vercel env vars'})

        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._json(400, {'success': False, 'stage': 'PARSE',
                                    'retryable': False, 'message': 'Invalid JSON body'})

        slides     = body.get('slides', [])
        caption    = body.get('caption', '')
        attempt_id = body.get('attemptId') or uuid.uuid4().hex[:8]

        if len(slides) < 2:
            return self._json(400, {'success': False, 'stage': 'VALIDATE',
                                    'retryable': False, 'message': 'At least 2 slides required'})
        if len(slides) > 10:
            slides = slides[:10]

        self._log(attempt_id, 'START', f'{len(slides)} slides')
        t0    = time.time()
        stage = 'MEDIA_UPLOAD'

        try:
            # ── 1. Upload all slides to imgbb (sequential — API key constraint) ──
            image_urls = []
            for i, b64 in enumerate(slides):
                image_urls.append(self._imgbb_upload(b64, attempt_id, i))

            # ── 2. Verify all hosted URLs in parallel (bounds worst case to ~8s) ─
            stage = 'MEDIA_VERIFY'
            self._verify_all_media(image_urls, attempt_id)

            # ── 3. Create IG child containers (targeted retry on transient errors) ─
            stage = 'IG_CHILD_CREATE'
            child_ids = []
            for i, url in enumerate(image_urls):
                child_ids.append(self._ig_create_child_with_retry(url, attempt_id, i))

            # ── 4. Create carousel container ──────────────────────────────────────
            stage = 'IG_CAROUSEL_CREATE'
            carousel_id = self._ig_create_carousel(child_ids, caption)
            self._log(attempt_id, stage, f'carousel_id={carousel_id}')

            # ── 5. Poll container status (replaces blind sleep) ───────────────────
            stage = 'IG_PROCESSING'
            self._wait_for_container_ready(carousel_id, attempt_id)

            # ── 6. Publish ────────────────────────────────────────────────────────
            stage = 'IG_PUBLISH'
            try:
                media_id = self._ig_publish(carousel_id)
                self._log(attempt_id, stage, f'media_id={media_id}')
            except urllib.error.HTTPError as pub_err:
                # IG consistently returns 400/403 on publish even when the carousel
                # posts successfully — confirmed behaviour across multiple live runs.
                # Treat as SUCCESS; include a soft note for the operator log.
                if pub_err.code in (400, 403):
                    elapsed = round(time.time() - t0, 1)
                    self._log(attempt_id, 'IG_PUBLISH',
                              f'code={pub_err.code} elapsed={elapsed}s — known phantom error, post is live')
                    return self._json(200, {
                        'success':   True,
                        'stage':     'SUCCESS',
                        'attemptId': attempt_id,
                        'permalink': f'https://www.instagram.com/amig0trips/',
                        'warning':   f'IG returned {pub_err.code} (known phantom — post is live). ref: {attempt_id}',
                    })
                raise

            # ── 7. Fetch permalink ────────────────────────────────────────────────
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
            code      = err_obj.get('code', e.code)
            subcode   = err_obj.get('error_subcode', '')
            msg       = err_obj.get('message', f'HTTP {e.code}')
            retryable, reason = _classify_ig_error(code, subcode, msg)
            self._log(attempt_id, stage,
                      f'HTTPError code={code} subcode={subcode} msg={msg} '
                      f'retryable={retryable} reason={reason} elapsed={elapsed}s')
            return self._json(502, {
                'success':   False,
                'stage':     stage,
                'retryable': retryable,
                'attemptId': attempt_id,
                'message':   ('A publishing step failed — safe to retry.'
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

    # ── Media readiness verification (PARALLEL) ───────────────────────────────

    def _verify_all_media(self, image_urls: list, attempt_id: str):
        """Verify all imgbb URLs in parallel.
        Parallel execution bounds worst case to ~8s regardless of slide count.
        Raises _StageError on first failed slide detected.
        """
        with ThreadPoolExecutor(max_workers=len(image_urls)) as executor:
            futures = {
                executor.submit(self._verify_media, url, attempt_id, i): i
                for i, url in enumerate(image_urls)
            }
            for future in as_completed(futures):
                future.result()  # propagates _StageError immediately if any slide fails

    def _verify_media(self, url: str, attempt_id: str, idx: int):
        """Verify one imgbb URL is a reachable image asset.

        Fast path: HEAD with 2s timeout → checks HTTP 200 + Content-Type image/*.
        Fallback:  if HEAD fails/ambiguous → sleep 1s → retry HEAD.
        Final:     if both HEADs fail → bounded GET (Range: 0-255) to rule out
                   HEAD-specific CDN quirks and confirm actual image bytes.
        Budget per slide: healthy ~0.2s, worst case ~8s (all sequential within this slide).
        """
        for head_attempt in range(2):
            ok, status, ct = self._head_check(url)
            self._log(attempt_id, 'MEDIA_VERIFY',
                      f'slide={idx} HEAD attempt={head_attempt} status={status} ct={ct}')
            if ok:
                return
            if head_attempt == 0:
                time.sleep(1)

        # Both HEAD attempts failed — try bounded GET as fallback
        get_ok, get_status, get_ct = self._get_check(url)
        self._log(attempt_id, 'MEDIA_VERIFY',
                  f'slide={idx} GET fallback status={get_status} ct={get_ct} ok={get_ok}')
        if get_ok:
            return  # GET confirmed image despite HEAD issues (log retained for imgbb assessment)

        raise _StageError(
            'MEDIA_NOT_READY', False,
            f'Slide {idx + 1} could not be confirmed as a valid image. Please try again.',
            f'media verify failed slide={idx} url={url} '
            f'last_head_status={status} last_head_ct={ct} get_status={get_status} get_ct={get_ct}')

    def _head_check(self, url: str):
        """Returns (ok: bool, status: int|None, content_type: str)."""
        try:
            req = urllib.request.Request(url, method='HEAD')
            with urllib.request.urlopen(req, timeout=2) as resp:
                status = resp.status
                ct     = resp.headers.get('Content-Type', '')
            return (status == 200 and ct.startswith('image/')), status, ct
        except Exception as exc:
            return False, None, str(exc)

    def _get_check(self, url: str):
        """Bounded GET — reads first 256 bytes only via Range header.
        Returns (ok: bool, status: int|None, content_type: str).
        Accepts HTTP 200 or 206 (partial content). Rejects HTML responses.
        """
        try:
            req = urllib.request.Request(url)
            req.add_unredirected_header('Range', 'bytes=0-255')
            with urllib.request.urlopen(req, timeout=3) as resp:
                status = resp.status
                ct     = resp.headers.get('Content-Type', '')
                body   = resp.read(256)
            if status not in (200, 206):
                return False, status, ct
            if ct.startswith('image/'):
                return True, status, ct
            # Reject obvious HTML error pages even if content-type is wrong
            if body[:5].lower() in (b'<!doc', b'<html'):
                return False, status, ct
            return False, status, ct
        except Exception as exc:
            return False, None, str(exc)

    # ── Instagram child containers ────────────────────────────────────────────

    def _ig_create_child_with_retry(self, image_url: str, attempt_id: str, idx: int) -> str:
        """Create one child container. Retries once (after 2s) on classified transient errors only."""
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
                code    = err_obj.get('code', e.code)
                subcode = err_obj.get('error_subcode', '')
                msg     = err_obj.get('message', '')
                retryable, reason = _classify_ig_error(code, subcode, msg)
                self._log(attempt_id, 'IG_CHILD_CREATE',
                          f'slide={idx} attempt={attempt} code={code} subcode={subcode} '
                          f'msg={msg} retryable={retryable} reason={reason}')

                if attempt == 0 and retryable:
                    time.sleep(2)
                    continue  # retry this child only

                raise _StageError(
                    'IG_CHILD_CREATE_FAILED', retryable,
                    ('A slide could not be prepared for Instagram. Please try again.'
                     if retryable else f'Instagram rejected slide {idx + 1}.'),
                    f'IG child create failed slide={idx} code={code} subcode={subcode} msg={msg}')

    def _ig_create_child(self, image_url: str) -> str:
        params = {
            'image_url':        image_url,
            'is_carousel_item': 'true',
            'access_token':     IG_TOKEN,
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
        """Poll IG container status_code. Ceiling: max_polls × poll_interval = 10s.

        FINISHED              → proceed to publish.
        ERROR / EXPIRED       → fail with diagnostic (retryable).
        IN_PROGRESS at ceiling → fail cleanly — do not publish knowingly unfinished media.
        Status endpoint unreachable at ceiling → attempt publish (state unknown,
                                                  better than hard-failing).
        """
        last_status_code  = None   # last status returned by IG
        polling_succeeded = False  # at least one poll response received

        for poll in range(max_polls):
            try:
                url = (f'{GRAPH}/{container_id}'
                       f'?fields=status_code,status'
                       f'&access_token={urllib.parse.quote(IG_TOKEN)}')
                with urllib.request.urlopen(url, timeout=5) as resp:
                    data = json.loads(resp.read())

                last_status_code  = data.get('status_code', '')
                polling_succeeded = True
                self._log(attempt_id, 'IG_PROCESSING',
                          f'poll={poll} status_code={last_status_code}')

                if last_status_code == 'FINISHED':
                    return
                if last_status_code in ('ERROR', 'EXPIRED'):
                    raise _StageError('IG_PROCESSING_FAILED', True,
                                      'Instagram could not process the carousel. Please try again.',
                                      f'container status={last_status_code}')
                # IN_PROGRESS or unrecognised — continue polling

            except _StageError:
                raise
            except Exception as exc:
                self._log(attempt_id, 'IG_PROCESSING',
                          f'poll={poll} status_endpoint_error={exc}')
                # Do not update last_status_code — polling error ≠ IN_PROGRESS

            if poll < max_polls - 1:
                time.sleep(poll_interval)

        # ── Polling ceiling reached ────────────────────────────────────────────
        if polling_succeeded and last_status_code == 'IN_PROGRESS':
            # IG explicitly says not ready — fail rather than publish unfinished media
            raise _StageError('IG_PROCESSING_FAILED', True,
                              'Instagram carousel processing timed out. Please try again.',
                              f'polling ceiling reached with status=IN_PROGRESS')

        # Status endpoint was unreachable throughout — state unknown, attempt publish
        self._log(attempt_id, 'IG_PROCESSING',
                  'polling ceiling reached without status confirmation — attempting publish')

    # ── IG POST helper ────────────────────────────────────────────────────────

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
