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
**Last Updated:** 2026-09-24 (Phase 1 Complete)
**Delivery Phase:** Phase 1 — Security, Reliability & Platform Rationalization (COMPLETE 2026-09-24) | Phase 2 — Revenue Activation & Validation (not yet authorized) | Lifecycle: Phase 0 ✅ → **Phase 1 ✅** → Phase 2 → Phase 3 → Phase 4 → Phase 5
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

**Session history:** see docs/changelog.md (Sessions 1–21 and Phase 1 record)

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

## 10. Phase 1 Carry-Forward
**PHASE 1 COMPLETE — 2026-09-24.** Canonical release: `e27a48e` (Production: amig0.com). Full disposition: docs/phase-1-exit.md. Session archive: docs/changelog.md.

**Active carry-forward:**
- I34 OPEN — api/stripe-webhook.py runtime monitoring. Close when: first organic `customer.subscription.*` event → HTTP 200 + Firestore write confirmed. (RAID I34)
- P05 DEFERRED — health/ separation. Owner: Daniel. Review: 2027-01-31. Constraint: no health/ expansion until separated.
- I22 — WA_TOKEN expires Nov 10, 2026. Renewal target: Nov 1. Procedure: RAID R06. Permanent token migration: post-Phase-1.
- [ ] Roadmap: OCTech Venue Network [NAMING TBD] — shared venue/partner database across amig0 + DATA.LABZ; see data-labz CLAUDE.md for counterpart entry
