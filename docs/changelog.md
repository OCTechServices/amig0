# amig0 — Session Changelog
# OCTech Services | Moved from CLAUDE.md (GB-01, 2026-08-16)

---

## Session 6–9 (2026-05-03)
- partners.js: Partner Network CRM module with lat/lng map pin fields
- marketplace.js + invites.js: Marketplace listings and invite code CRM modules
- portal-perks.js: Partner perks + check-in history tab in portal
- portal-map.js: Leaflet partner map with category pins + user QR pass tab
- portal-marketplace.js: Invite-gated marketplace tab with code redemption
- checkin.html: Standalone QR check-in deep-link page
- reports.js: Rewritten — KPI strip, check-in analytics, marketplace stats, bar charts
- quotes.js + invoicing.js + portal-quotes.js + portal-invoices.js + pdf.js: Dual-currency MXN/USD display + PDF secondary line
- tours.js + portal-overview.js: Group chat link field + portal card (I05)
- firestore.rules: partners, checkins, marketplace_listings, invites rules added
- storage.rules: Created — vetting/guides/ and vetting/providers/ operator-only
- firebase.json: storage.rules config added
- portal.html: Leaflet CSS/JS, Perks/Map/Marketplace tabs, new scripts
- index.html: Partners, Marketplace, Invites nav + scripts
- css/portal.css: Perks, map, secondary currency, marketplace cards, mobile nav fix (8-tab scrollable strip)
- css/main.css: KPI strip, bar charts, country pills, marketplace stats, dual-currency helpers
- landing.html: contact@opcoretech.com replacing demo@amig0travel.com (I11 closed)

## Session 10 (2026-05-04)
- landing.html: Full landing page sprint
  - Bracelet access form: name/email/proof fields, Formspree submit + mailto fallback
  - Persona gate: page stops at Pleasure/Revenue toggle
  - Pleasure mode: hides operator sections, CTA takes focus
  - Revenue mode: reveals full operator page below persona section
  - Back button: resets gate + scrolls to top
  - Live-stream reaction particles: pleasure (travel emojis), revenue (coins + follower chips)
  - Hero notification stream: 12 international travelers cycle top-right of hero
  - Stack flow: nowrap single line with horizontal scroll
  - Mobile responsive: persona stacks, captions scale, nav trimmed, win-win single column
  - Video slide 1: MP4 primary source

## Session 12 (2026-08-16)
- hacks/index.html: Traveler Hacks — public AI travel intel tool at amig0.vercel.app/hacks/
  - Renamed from Insider Hacks → Traveler Hacks
  - Discover mode: city + interest chips (incl. Hikes & Nature) → Claude picks 5 venues + hacks
  - Custom mode: user types specific venues → hacks per venue
  - Copy as text: one-click clipboard, paste into Notes/Notion/anywhere
  - Removed PDF export (jsPDF dependency dropped from hacks page)
  - Submit your city: community form for IG collaboration posts (Formspree + mailto fallback)
  - IG content strategy: internal export workflow removed from user-facing UI
- api/hacks.py: dual-mode (preferences array for discover, locations string for custom)
- health/server.py: _hacks() updated to match api/hacks.py dual-mode

## Session 11 (2026-08-16)
- health/index.html: Habit Tracker built from scratch
  - Google Sheets published CSV as live data source (Daniel + Lupe tabs)
  - Chart.js v4.4.0: concentric doughnut rings (outer = win rate C/C+F, inner = raw rate C/C+F+NS since Aug 1)
  - Horizontal bar chart with minBarLength fix for 0% hover
  - Day-based streak: consecutive days where all scheduled habits completed
  - Health fact ticker: fade-in/out cycling, date-seeded, 7s interval, fixed position
  - Year progress bar + Dec 31 countdown
  - Claude-powered recipe generator (POST /api/recipe → Anthropic API)
  - Mobile-responsive: fixed banner, stacked donuts, compact table, bar chart at 200px
  - Renamed: Discipline Tracker → Habit Tracker
  - favicon.svg + og.png (Pillow-generated 1200×630)
- api/recipe.py: Vercel Python serverless function (BaseHTTPRequestHandler pattern)
- health/server.py: Local dev server on port 8082 (static files + API proxy)
- vercel.json: Minimal Vercel config (auto-detects Python)
- Deployed: amig0.vercel.app/health/ via Vercel CLI (npx vercel --prod)
- GitHub: OCTechServices/amig0 (private repo, first push this session)

## Sessions 13–19 (2026-08-16 → 2026-08-30)
Key additions: multi-guide/role tour assignments, marketplace listings module, invite-only access system, partner/merchant collection, check-in QR flow, portal map tab, dual-currency PDF display, content engine IG carousel publishing, Traveler Hacks venue spotlight redesign, hacks submit form. See RAID for issue dispositions.

## Session 20 (2026-09-07)
- Bookable services layer in `hacks/index.html` — SERVICES array with `cities[]` filter. Three services: Luxury Photo Booth (SD, $35), Mobile Bar Service (SD, $35, WA pending), E-Bike Rental (16 cities, $10 deposit, Path 1 always). Service copy generic — no individual provider names.
- Rental booking modal — `bookingType: 'rental'` branch skips package selection; step 1 collects date/days/bikes/pickup pref; `bk-event-fields` hidden for rentals. `submitBooking()` branches on isRental.
- `api/stripe-booking.py` — Path 1 ($10/$35 deposit) + Path 2 (Stripe Connect Express for partners). Path 2 not used for e-bikes.
- `api/booking-webhook.py` — Stripe signature verify, Firestore `service_bookings` write, WA notification stub.
- `api/stripe-connect.py` — Express account onboarding for photo booth/bartender partners.
- WhatsApp Business — Twilio (760) 891-4152 registered + verified. WABA: 1378242627790626, Phone Number ID: 1407135942475680. WA messaging confirmed working. Display name "amig0" pending approval.
- `api/wa-webhook.py` — Meta webhook verification. `api/twiml-record.py` — Twilio voice webhook.
- Meta business verification — OPERATIONAL CORE TECHNOLOGIES, LLC verified via opcoretech.com DNS TXT.
- `privacy.html` + `terms.html` — live at /privacy and /terms. noindex. Cover Stripe, Firebase, WhatsApp Cloud API.
- `.claude/prompts/meta-growth-audit.md` — 34-section reusable OCTech Meta ecosystem audit playbook. Also saved to `_octech-foundation/docs/`.
- hacks submit form — cross-link to /business ("Apply to be an amig0 partner →") below form.
- Bug fix: `renderTools` guard in `onCityChange` (`typeof` check) — two script blocks, block 2 not yet parsed when block 1 init runs.

## Session 21 (2026-09-13)
- Booking modal UX — step indicator (numbered dots + connector line CSS, `updateStepIndicator()`), scoped input styles (focus glow, custom SVG chevron on select), emoji removal from pickup buttons.
- `api/booking-webhook.py` — operator WA alert added (`WA_OPERATOR_NUMBER` env var, SLA urgency flag). `WA_OPERATOR_NUMBER=17605396606` set in Vercel.
- WA 60-day token — permanent system user token failed (permissions). Fell back to `fb_exchange_token` exchange. Expires Nov 10, 2026 (RAID I22).
- Revolut referral link — URL added to hacks tools.
- Brand asset refresh — `og.png` replaced; `brand/` folder committed (`facebook-cover.png`, `story.png`, 8 IG highlight covers); `favicon.svg` (slashed-0 mark); `.gitignore !brand/*.png` exception; SVG slash `opacity="1"` across all consumer pages.
- Phase 0 forensic audit — `docs/phase-0-audit.md` complete. Reviewed and accepted 2026-09-13. Phase 1 authorized (RAID I26 closed).
- Content engine venue spotlight redesign — cream palette (`#faf5f0`), Cormorant Garamond italic headlines, category accent left-edge band, `spotlightHashtags()`, `drawSpotlightTexture()`, `getCategoryAccent()`, `drawWordmark()` in `content/index.html`.
- `api/hacks.py` — Coffee category added; `headline` field added to venue spotlight hacks (editorial micro-headline, 2–6 words); hours/pricing guardrail (omit unless from website content).
- `api/ig-post.py` — Graph API v21.0 → v22.0.
- Hook improvements — `pre-commit.sh`: git index scanning (`git show :$f`), governance freshness check. `session-end.sh`: activity heuristic gate (F13), master-prompt staleness (F03), line count (F04), completed item accumulation (F06), pre-commit hook integrity (B5).

## Phase 1 — Completed Item Archive (2026-09-13 → 2026-09-24)
Full Phase 1 item disposition: docs/phase-1-exit.md.

| Item | Status | Date | Notes |
|------|--------|------|-------|
| Phase 0 audit | CLOSED | 2026-09-13 | docs/phase-0-audit.md reviewed and accepted. Phase 1 authorized. RAID I26 closed. |
| S01 Content Engine auth | CLOSED | 2026-09-14 | Firebase ID token + operator claim replaces PUBLISH_SECRET. PUBLISH_SECRET removed from Vercel Production. Human browser validated. RAID I27. |
| S02 Deals entitlement boundary | CLOSED | 2026-09-15 | 5 security findings (V01–V06, V04 accepted residual). api/init-trial.py, deals.html hardened, Firestore rules updated. 34/34 emulator tests. dpl_BEprvPcMc4oBC1K4XuZnL9FmW2Rc. RAID I28 closed. |
| P04 landing.html | CLOSED | 2026-09-14 | 301 → amig0.com/ validated in production. |
| P07 Repo artifacts | CLOSED | — | DisciplineLog.xlsx untracked, personal files deleted, .gitignore updated. |
| P08 Regression/security validation | CLOSED | 2026-09-14 | S01/P04 smoke tests passed. All API auth gates confirmed. |
| P01 Stripe booking E2E | CLOSED | 2026-09-20 | Pass 3 accepted. Human browser TEST booking (E-Bike $10, Ref SF6CI8M0). HTTP 200. Firestore 0→1. $10 rendered. RAID I23 closed. |
| FIREBASE_SERVICE_ACCOUNT | CLOSED | 2026-09-23 | Production → amig0-travel-company-52fb1. Preview → amig0-e2e-test. |
| P02 WA credential lifecycle | CLOSED | 2026-09-24 | Renewal procedure in RAID R06. Token expires Nov 10, 2026. Permanent migration: post-Phase-1. |
| P03 Firebase Hosting domain | CLOSED | 2026-09-24 | Production site: amig0-travel-company-52fb1. URL: https://amig0-travel-company-52fb1.web.app. |
| P06 amig0.vercel.app redirect | CLOSED | 2026-09-24 | 301 → amig0.com (Vercel Dashboard). 6/6 acceptance tests. |
| P09 Phase 1 exit report | CLOSED | 2026-09-24 | docs/phase-1-exit.md committed. |
| Legacy PUBLISH_SECRET | CLOSED | 2026-09-14 | Removed from Vercel Production. No redeployment required. |
| AEO foundation | LIVE | 2026-09-24 | robots.txt: live, AI crawlers permitted. llms.txt: live at amig0.com/llms.txt since Phase 1 Production release (e27a48e). |
| F01 / I34 stripe-webhook.py | ACCEPTED RISK | 2026-09-24 | Fix deployed commit 122c1d2 (dpl_2SUdmLpGq1rLrqLisWL8cSysUcto). 14/14 tests pass. I34 OPEN as monitoring item. See RAID I34. |
| P05 health/ disposition | DEFERRED | 2026-09-24 | Owner: Daniel. Review: 2027-01-31. No health/ expansion until separated. See RAID. |

## Phase 1 Production Release (2026-09-24)
- Canonical main: `e27a48e` (docs/phase-1-exit.md committed)
- Release: fast-forward main → push origin/main → Vercel Git-triggered Production deployment
- Deployment: READY (`amig0-101poz9vh-datalabz.vercel.app` aliased to amig0.com)
- Pre-release tests: 61/61 pass
- Smoke checks: 200 on /, /hacks, /deals, /privacy, /terms, /robots.txt, /llms.txt
- llms.txt: first-time live at amig0.com/llms.txt
- P06 preserved: amig0.vercel.app → 301 → amig0.com
- Phase 2: NOT AUTHORIZED — awaiting explicit authorization by Daniel
