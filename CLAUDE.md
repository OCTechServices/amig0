# amig0-travel-company
# Tier 1 — Enterprise Grade | OCTech Services

## 1. Project Purpose
**amig0 Travel Company** is a group travel CRM platform built for tour operators managing clients, tours, passengers, quotes, invoicing, and tour guides — all from a lean, zero-dependency web stack.

The platform consists of five apps in one codebase:
- **CRM (index.html)** — internal operator dashboard for full lifecycle management
- **Client Portal (portal.html)** — client-facing portal for viewing bookings and itineraries
- **Guide App (guide.html)** — mobile-first PWA for tour guides in the field
- **Habit Tracker (health/index.html)** — personal discipline dashboard (Daniel + Lupe), at amig0.vercel.app/health/
- **Traveler Hacks (hacks/index.html)** — public AI-powered travel intel tool at amig0.vercel.app/hacks/

**Commercial Intent:** Revenue-generating
**Target Users:** Tour operators, travel agents, clients, tour guides
**Tier:** 1 — Enterprise Grade
**Status:** Active
**Last Updated:** 2026-08-24 (Session 16)
**Brand:** `amig0` — brand name, always lowercase. `@amig0trips` — exclusive social handle (Instagram + Facebook). These are distinct: amig0 is the product, @amig0trips is the channel.

## 2. Architecture Overview
**Stack:**
- Frontend: Vanilla JavaScript — no framework, no bundler, no npm. Scripts loaded via `<script>` tags
- Backend / DB: Firebase v10.12 (compat SDK) — Firestore + Auth + Storage
- Styling: Custom CSS + DM Sans / Playfair Display (Google Fonts)
- Maps: Leaflet.js 1.9.4
- PDF Generation: jsPDF (quotes + itineraries)
- PWA: Service worker + manifest (installable on mobile)
- Hosting: Firebase Hosting (CRM/Portal/Guide) + Vercel (Habit Tracker — amig0.vercel.app)

**Codebase Scale:**
- Active build — Sessions 2–3 complete. CRM and Client Portal fully scaffolded and live.
- Target: ~18,600 lines across 17 JS files and 3 CSS files (planned)
- No build step — pure vanilla. Zero npm dependencies beyond Firebase, Leaflet, jsPDF

**Completed Modules (as of 2026-05-03):**
- CRM: auth.js, nav.js, dashboard.js, clients.js, tours.js, passengers.js, bookings.js, quotes.js, invoicing.js, providers.js, briefings.js, guides.js, partners.js, marketplace.js, invites.js, reports.js
- Client Portal: portal-auth.js, portal-nav.js, portal-overview.js, portal-itinerary.js, portal-quotes.js, portal-invoices.js, portal-perks.js, portal-map.js, portal-marketplace.js
- Guide App: guide-auth.js, guide-nav.js, guide-today.js, guide-itinerary.js, guide-passengers.js, guide-briefings.js, sw.js
- PDF: pdf.js (quotes + invoices, with dual-currency secondary line)
- CSS: css/main.css, css/portal.css, css/guide.css
- Rules: firestore.rules (role-based: operators + user_profiles + partners + checkins + marketplace_listings + invites), storage.rules (vetting paths, operator-only)
- Hooks: .claude/hooks/pre-commit.sh, .claude/hooks/session-end.sh
- Standalone: checkin.html (QR deep-link check-in), landing.html
- Habit Tracker: health/index.html, health/api/recipe.py (Vercel serverless), health/server.py (local dev)
- Traveler Hacks: hacks/index.html, api/hacks.py (Vercel serverless)
- Content Engine: content/index.html (internal, amig0.vercel.app/content/), api/ig-post.py (Vercel serverless IG publish)

**Session history:** see docs/changelog.md

**Session 16 additions (2026-08-24):**
- home.html: Mobile nav fix — `btn-nav-venue` class added to "For venues" link, hidden at <640px. "Traveler Hacks" stays visible on mobile.
- hacks/index.html: Major QA overhaul — Plus Jakarta Sans, amig0 nav (sticky, blurred, SVG zero wordmark), globe continent outlines via GeoJSON polygons (vasturiano/globe.gl ne_110m_countries.json, indigo strokes rgba(129,140,248,0.32)), card 3px indigo top stripe, editorial numbering (01/05), chip invite animation (breathing glow until first selection, re-adds if all chips deselected), shake + amber hint on failed generate attempt, "23 cities and counting" globe sub, city-aware tool ordering (cityRegion() + toolRelevance() functions, renderTools() re-sorts on every city change).
- hacks/index.html: Maps URL accuracy — hybrid format `VenueName/@lat,lng,17z` when coordinates available, name+city fallback. copyAsText() includes website and instagram below maps URL. Card footer: "Get directions ↗" + globe icon (website) + instagram handle — all in one row. Watermarks tried and removed.
- deals.html: "Near me" geolocation button — haversine distance sort, distance badge on cards ("0.4 km · 5 min walk"), user "you are here" indigo circleMarker on map included in fitBounds.
- api/hacks.py: `website` and `instagram` optional fields added to discover and custom prompt schemas. Instructions: include only if confident, omit or empty string if unsure.

**Session 15 additions (2026-08-22):**
- home.html: Rotating hero — 3 scenes (Mexico City skyline / San Diego coast / Oaxaca mountains), 3s cycle, CSS opacity fade. Option A: city chip above h1. Option D: rotating word in h1 ("city"→"coast"→"valley"). Both active simultaneously. localStorage not used — stateless JS interval.
- deals.html: Full consumer deal flow built for launch. Category filter chips (All/Bars/Coffee/Food/Breweries/Nightlife/Culture) — client-side filter on `allDeals` cache, no extra Firestore reads. Deal count label dynamic ("N deals in City"). Plus Jakarta Sans throughout. Hero redesigned: section label + clamp(2.6→4rem) weight-800 h1.
- deals.html: Card redesign — tool-pass aesthetic (hacks page): #141414 bg, rgba(255,255,255,0.07) border, 3px indigo top stripe, border-radius 16px, address line, website in card footer.
- deals.html: Full-screen redemption display — replaces small modal. Pulsing green glow, offer text clamp(2.4→4rem), 2-hour countdown timer (localStorage-persisted, survives refresh). Amber at <30min, red at <5min, expired state with close-only footer.
- deals.html: Full-screen success state — green check + pulsing glow, venue name in green, "Come back in 30 days." Matches redemption screen weight.
- deals.html: localRedeemed session cache — fixes Firestore server-timestamp timing gap where card showed "Redeem deal" immediately after confirmation. localRedeemed merged with Firestore results on re-render.
- deals.html: Map z-index fix — overlay z-index 1000 (Leaflet panes top out at 700). Map container gets `isolation: isolate`.
- business.html: Plus Jakarta Sans, h1 clamp(2.2→3.2rem) weight 800, category options aligned to deal chip values (bar/brewery/coffee/food/nightlife/culture), emoji → Lucide check-circle-2.
- Booze Bros Brewing Co: added to `affiliates` Firestore collection (doc: Jqn3sAmlK7qgqcXgd1u4). Vista CA, lat: 33.1482, lng: -117.2181 (Nominatim geocoded), offer: "Free Half Pint", category: brewery. Added via gcloud token + Python urllib Firestore REST API.
- Firestore write pattern: `gcloud auth print-access-token` → Python urllib POST/PATCH to Firestore REST API. No Admin SDK or service account needed.
- Typography: Plus Jakarta Sans now the standard for all consumer-facing pages (home.html, deals.html, business.html). DM Sans / Playfair Display remain in CRM/portal only.

**Session 14 additions (2026-08-19):**
- content/index.html: Venue map slide (`__VENMAP__`) added to all 3 post types — OSM tiles zoom 13, Nominatim geocoding → Claude lat/lng fallback → city center fallback. Bottom gradient strip (175px) keeps legend below pins. Top-left gradient locks header contrast. No inline pin labels — numbered circles + legend only.
- content/index.html: `drawInterestSelectorSlide()` added to finale carousel. Iztapalapa shoutout removed from all finale captions.
- api/hacks.py: Authenticity HARD RULE added to discover prompt. `lat`/`lng` added to discover schema. Session-based focus angle rotation (10 angles, 1–20 random session ID).
- api/ig-post.py: `_ig_post` retries once on 403 (4s wait). `_ig_publish` wraps 400/403 as soft success — returns 200 with warning instead of 502. Client displays amber warning when present.
- hacks/index.html: Globe + Submit sections updated to match Tools section visual treatment (border-top, #141414 bg, rgba(255,255,255,0.07) border). Lucide icons throughout tools section.
- hacks/index.html: Referral links added — Uber, Uber Eats, Wise, Rakuten. Remaining: DiDi, Bolt, Revolut, Rappi.
- cities.json: Expanded to 23 cities (Mexico 6, USA 10, Europe 7).
- Oaxaca city series: Posts 1, 2, 3 complete and live on @amig0trips.

**Session 13 additions (2026-08-16):**
- content/index.html: Internal IG carousel content engine — Canvas 1080×1080 slide rendering, imgbb upload, Instagram Graph API carousel publish. 3-carousel city series format: Post 1 (standalone), Post 2 (continuation, interests-filtered), Post 3 (finale — OSM map cover slide, country flag tri-color bar at top, amig0 pin at city coords, city name large bottom-third). Series finale checkbox toggles map cover + closing caption.
- api/ig-post.py: Vercel Python serverless — imgbb upload → IG child containers → carousel container → publish → permalink. GET handler for token identity check. maxDuration: 60s.
- @amig0trips: Instagram Business account linked to Meta Business Suite. IG_USER_ID=28153112260984867. IGAAX token stored as IG_ACCESS_TOKEN in Vercel env vars. IMGBB_API_KEY stored in Vercel env vars.
- Brand enforced: `amig0` (all lowercase) across all HTML files — titles, meta tags, canvas slides, body copy.
- Social asset kit: Facebook Page cover (820×360), 8 Story Highlight covers, Facebook/IG Story vertical (1080×1920) — Canvas-rendered, /tmp/amig0-ig-covers.html + /tmp/amig0-story.html.
- hacks/index.html page heading: "Traveler Hacks" (not "Insider Hacks").

**Key Modules:**
Auth · Dashboard · CRM · Clients · Tours · Passengers · Quotes · Invoicing · Email · PDF · Providers · Briefings · Data · Guide App · Client Portal

**External Integrations:**
- Firebase (Firestore, Auth, Storage) — v10.12 compat SDK
- Leaflet.js 1.9.4 (maps)
- jsPDF (PDF generation)
- Firebase Hosting (CRM/Portal/Guide) + Vercel (Habit Tracker + Traveler Hacks)
- Anthropic API — claude-haiku-4-5-20251001 (recipe generator + hacks generator, server-side only)
- Formspree (Traveler Hacks submit form)
- Instagram Graph API v21.0 (graph.instagram.com) — @amig0trips carousel publishing
- imgbb.com — public image hosting for IG slide URLs (IMGBB_API_KEY in Vercel env)
- OpenStreetMap tiles — map backdrop for content engine finale slide (no API key, crossOrigin anonymous)

## 3. Working Rules
- No build step — never introduce a bundler, npm, or package.json
- No new frameworks — Vanilla JS is the deliberate choice, not a limitation
- Small, reviewable changes only — 18,600 lines makes large diffs dangerous
- Never modify production Firestore data directly
- Check existing module pattern before creating new ones
- Test on both mobile and desktop before marking any change done

## 4. Commands
```bash
# No build step — open directly in browser
open index.html          # CRM dashboard
open portal.html         # Client portal
open guide.html          # Guide app

# Firebase CLI
firebase deploy          # Deploy CRM / Portal / Guide to Firebase Hosting
firebase emulators:start # Local Firebase emulator suite

# Habit Tracker
ANTHROPIC_API_KEY=sk-ant-... python3 health/server.py  # Local dev (port 8082)
npx vercel --prod                                        # Deploy to Vercel
```

## 5. Code Standards
- No hardcoded Firebase config keys in source — use a separate config file excluded from git
- Explicit error handling on all Firestore reads and writes
- Follow existing module pattern — each feature lives in its own JS file
- CSS custom properties for all colors and typography — no magic values
- jsPDF: never embed raw Firestore documents directly into PDF metadata

## 6. Security / Data Handling

### Credentials & Secrets
- All credentials via environment variables — never hardcoded, never committed
- `.env` files must be in `.gitignore` before first commit
- Never commit service account files, `.secret.local`, or key files
- Stripe secret keys, webhook secrets, and admin tokens are server-side only

### Trust Boundaries
- Auth logic lives on the server — never implement authentication or signing logic client-side
- Cryptographic keys (HMAC, JWT secrets) must never appear in frontend code
- The backend must independently verify every request — never trust client-supplied roles or permissions
- Privilege levels must be enforced server-side; client UI state is not a security control

### Database & Access Controls
- Apply least-privilege — no table or bucket should be more permissive than it needs to be
- For Supabase: Row Level Security (RLS) must be enabled on every table holding user data
- Public and private storage buckets must be explicitly separated — never bundle them
- Review and resolve all security warnings from the database provider before shipping

### API & Middleware
- Every API route must have explicit auth unless deliberately public — no implicit open routes
- Validate and sanitize all external inputs at the boundary
- Rate limiting and fault isolation required on any route exposed to the public
- Never log sensitive user data (PII, tokens, passwords, health data)

### Architecture
- Core services must have fault boundaries — a single service failure should not take down the stack
- Avoid tightly coupled architecture where one broken component causes full system outage
- External integrations are a risk surface — treat every third-party call as potentially failing

## 7. Definition of Done
- [ ] Works as intended
- [ ] No lint errors
- [ ] No secrets exposed
- [ ] Security checklist passed (see Section 6)
- [ ] Change is small and reviewable
- [ ] Existing patterns respected
- [ ] If public-facing site: AEO patterns applied (llms.txt at domain root, AI crawlers allowed in robots.txt, Quick Answer block on key pages, question-format H2s, FAQ schema where relevant)

## 8. Tooling Guidance
- Playwright: Not approved (no build step — use manual browser testing)
- Skills: simplify, commit, security-review, architecture-review, dependency-scan, test-generation
- Agents: reviewer, pm-analyst, security-analyst, architect, qa-engineer
- Hooks: pre-commit (git), session-end (Claude Code)

## 9. Session Protocol

**Session open** — paste this before starting work:
```
Read CLAUDE.md, RAID.md, and .claude/prompts/master-prompt.md
before we begin. Confirm your understanding of the project
and state which delivery phase we are in.
```

**During the session:**
1. Work in small, reviewable increments
2. Flag risks and blockers in RAID.md as they surface
3. Run `/security-review` before any Firestore rules change or data model update

**Session close** — before signing off:
```
Read CLAUDE.md, RAID.md, and .claude/prompts/master-prompt.md
and confirm all three are accurate before we sign off.
```

## 10. Open Items
- [x] Confirm Firebase config object is not committed with live keys — .gitignore created 2026-04-11
- [x] Firebase project creation — live project confirmed, config active
- [x] CRM fully scaffolded and tested (Sessions 2–3)
- [x] Client Portal built and working (My Trip, Itinerary, Quotes, Invoices)
- [x] Firestore Security Rules deployed — role-based (operators + user_profiles). Privilege escalation fix deployed 2026-05-02.
- [x] Guide App (guide.html) — mobile-first PWA — complete
- [x] PDF generation — jsPDF for quotes and invoices — complete
- [x] Guide UID linking — Firebase Auth UID field + App Access column in guides.js (Session 5)
- [x] Client portal provisioning — Firebase Auth UID field + Portal Access column in clients.js (Session 5)
- [x] Email delivery — mailto: deep links on quotes and invoices (Session 5)
- [x] Service worker cache versioning documented — bump CACHE_NAME on every guide deploy (RAID I03)
- [x] Fellow Travellers — works with current auth rules, graceful fallback retained (RAID I06)
- [x] SVG logo/wordmark for "Amig0" brand mark — inline SVG "0" approved (Session 5)
- [x] Operator role hardening — Firebase Auth custom claims via Cloud Functions. CRM gated on operator claim. (RAID I02, Session 5)
- [x] Firebase Hosting migration — firebase.json hosting block configured, deployed (RAID I04, Session 5)
- [x] Partner Network — partners.js CRM module with lat/lng + portal Perks + Map tabs (P07–P09, Session 6–9)
- [x] Marketplace — marketplace.js CRM + portal-marketplace.js invite-gated portal tab (P02–P03, Session 6–9)
- [x] Invite codes — invites.js CRM module + portal redemption flow (P03, Session 6–9)
- [x] QR check-in — checkin.html deep-link + portal-perks.js history (P08, Session 6–9)
- [x] Dual-currency display — MXN/USD on quotes, invoices, portal, PDF (P10, Session 6–9)
- [x] Group chat link — tours.js field + portal-overview.js card (I05, Session 9)
- [x] Firebase Storage rules — storage.rules created for vetting paths (Session 9)
- [x] Contact email — contact@opcoretech.com across all surfaces (I11, Session 6–9)
- [x] Mobile portal nav — 8-tab scrollable strip, all tabs reachable on mobile (Session 6–9)
