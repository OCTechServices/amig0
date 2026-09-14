# amig0
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
**Last Updated:** 2026-09-13 (Phase 0 Reconciliation)
**Delivery Phase:** Phase 1 — Security, Reliability & Platform Rationalization (authorized 2026-09-13, in progress) | Lifecycle: Phase 0 ✅ → **Phase 1** → Phase 2 → Phase 3 → Phase 4 → Phase 5
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

**Session 21 additions (2026-09-13):**
- Booking modal UX — step indicator (numbered dots + connector line CSS, `updateStepIndicator()`), scoped input styles (focus glow, custom SVG chevron on select), emoji removal from pickup buttons
- `api/booking-webhook.py` — operator WA alert added (`WA_OPERATOR_NUMBER` env var, SLA urgency flag). `WA_OPERATOR_NUMBER=17605396606` set in Vercel.
- WA 60-day token — permanent system user token failed (permissions). Fell back to `fb_exchange_token` exchange. Expires Nov 10, 2026 (RAID I22).
- Revolut referral link — URL added to hacks tools.
- Brand asset refresh — `og.png` replaced; `brand/` folder committed (`facebook-cover.png`, `story.png`, 8 IG highlight covers); `favicon.svg` (slashed-0 mark); `.gitignore !brand/*.png` exception; SVG slash `opacity="1"` across all consumer pages.
- Phase 0 forensic audit — `docs/phase-0-audit.md` complete. Reviewed and accepted 2026-09-13. Phase 1 authorized (RAID I26 closed).
- Content engine venue spotlight redesign — cream palette (`#faf5f0`), Cormorant Garamond italic headlines, category accent left-edge band, `spotlightHashtags()`, `drawSpotlightTexture()`, `getCategoryAccent()`, `drawWordmark()` helper in `content/index.html`.
- `api/hacks.py` — Coffee category added to schema; `headline` field added to venue spotlight hacks (editorial micro-headline, 2–6 words); hours/pricing guardrail (omit unless from website content).
- `api/ig-post.py` — Graph API v21.0 → v22.0.
- Hook improvements — `pre-commit.sh`: git index scanning (`git show :$f`), governance freshness check. `session-end.sh`: activity heuristic gate (F13), master-prompt staleness (F03), line count (F04), completed item accumulation (F06), pre-commit hook integrity (B5).

**Session 20 additions (2026-09-07):**
- Bookable services layer in `hacks/index.html` — SERVICES array with `cities[]` filter. Three services: Luxury Photo Booth (SD, $35), Mobile Bar Service (SD, $35, WA pending), E-Bike Rental (16 cities, $10 deposit, Path 1 always). Service copy is generic — no individual provider names.
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

**Sessions 13–19 (2026-08-16 → 2026-08-30):** see docs/changelog.md

**Key Modules:**
Auth · Dashboard · CRM · Clients · Tours · Passengers · Quotes · Invoicing · Email · PDF · Providers · Briefings · Data · Guide App · Client Portal

**External Integrations:**
- Firebase (Firestore, Auth, Storage) — v10.12 compat SDK
- Leaflet.js 1.9.4 (maps)
- jsPDF (PDF generation)
- Firebase Hosting (CRM/Portal/Guide) + Vercel (Habit Tracker + Traveler Hacks)
- Anthropic API — claude-haiku-4-5-20251001 (recipe generator + hacks generator, server-side only)
- Formspree (Traveler Hacks submit form)
- Instagram Graph API v22.0 (graph.instagram.com) — @amig0trips carousel publishing
- imgbb.com — public image hosting for IG slide URLs (IMGBB_API_KEY in Vercel env)
- OpenStreetMap tiles — map backdrop for content engine finale slide (no API key, crossOrigin anonymous)

## 3. Autonomy Model

**GREEN** — Proceed without repeated approval: read/inspect/search, edit files within approved phase scope, documentation, tests, local validation, bounded refactoring, commits, routine non-production asset work, RAID/CLAUDE/governance maintenance.

**YELLOW** — Proceed when authorized by active phase; rollback preserved: new API routes, new Firestore collections/schema additions, routing/configuration changes, larger refactors, new UI features within approved requirements, integration code that does not alter live billing/credentials/production security boundaries.

**RED** — Explicit human approval required: production deployment (Vercel + Firebase Hosting), DNS/domain changes, secrets/credential changes, Firestore security-rule changes, auth/authorization boundary changes, Stripe live billing configuration, destructive production data operations, production page removal, external communications/publications, irreversible third-party actions, git history rewriting.

**Working rules:** No build step or bundler. No new frameworks. Small reviewable changes only. Never modify production Firestore data directly. Follow existing module patterns.

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
- [STRIPE ONLY] Stripe secret keys, webhook secrets, and admin tokens are server-side only

### Trust Boundaries
- Auth logic lives on the server — never implement authentication or signing logic client-side
- Cryptographic keys (HMAC, JWT secrets) must never appear in frontend code
- The backend must independently verify every request — never trust client-supplied roles or permissions
- Privilege levels must be enforced server-side; client UI state is not a security control

### Database & Access Controls
- Apply least-privilege — no table or bucket should be more permissive than it needs to be
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
- **Multi-agent:** One source of truth. One implementation owner per workstream. No silent reconciliation of conflicting recommendations. Git state, RAID, and governed docs are the handoff mechanisms.

## 9. Session Protocol

**Claude enforcement rule:** At session open, Claude must read CLAUDE.md, RAID.md, and .claude/prompts/master-prompt.md and explicitly confirm the current delivery phase before responding to any task. If the opener prompt is not provided, Claude must request it before continuing. Do not proceed with work until confirmation is stated.

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

**Non-negotiable:** No session closes with an uncommitted or unresolved artifact. Every change made in a session must be either committed, intentionally discarded, or logged as a RAID item with owner and next action.

## 10. Phase 1 Open Items
- [x] Phase 0 audit reviewed and accepted — 2026-09-13 (RAID I26 closed)
- [x] S01: Content Engine auth — COMPLETE 2026-09-14. Firebase ID token + operator claim. PUBLISH_SECRET removed from Vercel Production. Human browser validated. (RAID I27)
- [x] S02: Deals subscription gate — assessed, server-side enforcement already in Firestore rules (RAID I28 closed)
- [x] P04: landing.html — COMPLETE 2026-09-14. 301 → amig0.com/ validated in production.
- [x] P07: Repo artifacts removed — DisciplineLog.xlsx untracked, personal files deleted, .gitignore updated
- [x] P08: Regression/security validation — S01/P04 smoke tests passed 2026-09-14 (home, hacks, deals, business all 200; unauthenticated API 403; operator auth passes; invalid token 403)
- [ ] P01: Stripe booking end-to-end validation (RAID I23) — test procedure defined, awaiting Daniel
- [ ] P02: WA credential — calendar reminder Nov 1. Renewal: Graph API Explorer → update WA_TOKEN (RED). Pursue permanent token. (RAID R06)
- [ ] P03: Firebase Hosting domain — `amig0-travel-company-52fb1.web.app` (confirmed from .firebaserc, RED to verify/document custom domain)
- [ ] P05: health/ disposition — personal app on brand domain, decision pending Daniel
- [ ] P06: amig0.vercel.app legacy redirect — Vercel dashboard action (RED)
- [x] Legacy PUBLISH_SECRET — removed from Vercel Production 2026-09-14. No redeployment required.
