# amig0-travel-company
# Tier 1 — Enterprise Grade | OCTech Services

## 1. Project Purpose
**Amig0 Travel Company** is a group travel CRM platform built for tour operators managing clients, tours, passengers, quotes, invoicing, and tour guides — all from a lean, zero-dependency web stack.

The platform consists of three apps in one codebase:
- **CRM (index.html)** — internal operator dashboard for full lifecycle management
- **Client Portal (portal.html)** — client-facing portal for viewing bookings and itineraries
- **Guide App (guide.html)** — mobile-first PWA for tour guides in the field

**Commercial Intent:** Revenue-generating
**Target Users:** Tour operators, travel agents, clients, tour guides
**Tier:** 1 — Enterprise Grade
**Status:** Active
**Last Updated:** 2026-04-11

## 2. Architecture Overview
**Stack:**
- Frontend: Vanilla JavaScript — no framework, no bundler, no npm. Scripts loaded via `<script>` tags
- Backend / DB: Firebase v10.12 (compat SDK) — Firestore + Auth + Storage
- Styling: Custom CSS + DM Sans / Playfair Display (Google Fonts)
- Maps: Leaflet.js 1.9.4
- PDF Generation: jsPDF (quotes + itineraries)
- PWA: Service worker + manifest (installable on mobile)
- Hosting: GitHub Pages + custom domain

**Codebase Scale:**
- Greenfield — application code does not yet exist as of 2026-04-11
- Target: ~18,600 lines across 17 JS files and 3 CSS files (planned)
- No build step — pure vanilla. Zero npm dependencies beyond Firebase, Leaflet, jsPDF

**Key Modules:**
Auth · Dashboard · CRM · Clients · Tours · Passengers · Quotes · Invoicing · Email · PDF · Providers · Briefings · Data · Guide App · Client Portal

**External Integrations:**
- Firebase (Firestore, Auth, Storage) — v10.12 compat SDK
- Leaflet.js 1.9.4 (maps)
- jsPDF (PDF generation)
- GitHub Pages + custom domain (hosting)

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
firebase deploy          # Deploy to Firebase Hosting (if migrated from GitHub Pages)
firebase emulators:start # Local Firebase emulator suite
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
- [ ] Firebase project creation — Dan to create project in Firebase Console and share config
- [ ] Review Firestore Security Rules — client portal data isolation (UID scoping)
- [ ] Service worker cache versioning strategy documented
- [ ] Assess GitHub Pages → Firebase Hosting migration (custom domain handling)
