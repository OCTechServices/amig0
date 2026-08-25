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
