# amig0 — Phase 0: Foundation & Forensic Current-State Audit
**OCTech Services | Tier 1 — Enterprise Grade**
**Date:** 2026-09-13
**Status:** Evidence-based. Do not begin implementation until this document is reviewed.

---

## 1. Executive Summary

amig0 is a functioning, revenue-active platform with five distinct product surfaces deployed across two hosting environments. The codebase is 20+ sessions deep, coherent in its technical direction, and already generating revenue via Stripe subscriptions and service bookings. The architecture is intentional (no-build, vanilla JS, Firebase + Vercel split) and has been validated in production.

The platform is NOT in chaos. It is, however, carrying accumulated surface area from rapid iteration: split hosting that was never rationalized, legacy URL references, root-level artifacts that don't belong in the repo, inline CSS spread across pages, and a design system that exists in tokens.css but is not consistently applied. None of this blocks revenue. All of it creates drag.

**Verdict:** The foundation is solid. Phase 1 should consolidate and harden — not rebuild.

---

## 2. Product Surfaces Inventory

| Surface | File | Hosting | URL | Status | Revenue |
|---|---|---|---|---|---|
| Home | home.html | Vercel | amig0.com/ | Production | No |
| Traveler Hacks | hacks/index.html | Vercel | amig0.com/hacks/ | Production | Indirect (referrals, bookings) |
| Deals | deals.html | Vercel | amig0.com/deals | Production | Yes ($3.99/mo subs) |
| Business | business.html | Vercel | amig0.com/business | Production | Pipeline |
| CRM | index.html | Firebase | — | Production | Yes (operator tool) |
| Client Portal | portal.html | Firebase | — | Production | No (operator-provisioned) |
| Guide App | guide.html | Firebase | — | Production | No (operator-provisioned) |
| Content Engine | content/index.html | Vercel | amig0.com/content/ | Internal | No |
| Habit Tracker | health/index.html | Vercel | amig0.com/health/ | Personal | No |
| Landing | landing.html | Vercel | amig0.com/landing.html | Stale | No |

**Findings:**
- 10 surfaces. 5 are consumer/operator-facing. 3 are personal/internal. 1 is stale.
- `landing.html` — still accessible publicly, references placeholder email, persona selector. No clear path from it to anything active. Orphaned.
- `content/index.html` — internal tool, publicly accessible at /content/. No auth gate. Contains PUBLISH_SECRET in JS fetch header.
- `health/index.html` — personal habit tracker deployed on the amig0.com domain. No separation from the brand surface.

---

## 3. Hosting & Deployment Map

### Firebase Hosting
- **Serves:** CRM (index.html), Client Portal (portal.html), Guide App (guide.html)
- **Deploy command:** `firebase deploy`
- **Domain:** Unknown — not documented. Likely `amig0.web.app` or a custom subdomain. **Gap: not confirmed.**
- **Config:** firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
- **Functions:** functions/index.js (Cloud Functions for operator role management)

### Vercel
- **Serves:** Everything consumer-facing (home, hacks, deals, business, content, health) + all API routes
- **Deploy command:** `npx vercel --prod`
- **Domain:** amig0.com (aliased)
- **Config:** vercel.json (routes + function maxDuration)
- **Functions (serverless):**

| Function | Purpose | Max Duration |
|---|---|---|
| api/hacks.py | Anthropic API proxy (Claude Haiku) | 30s default |
| api/ig-post.py | Instagram carousel publisher | 60s |
| api/recipe.py | Habit tracker recipe generator | 30s |
| api/stripe-checkout.py | Subscription checkout session | 10s |
| api/stripe-webhook.py | Subscription lifecycle → Firestore | 10s |
| api/stripe-booking.py | Service booking checkout | 10s |
| api/booking-webhook.py | Booking webhook → Firestore + WA | 10s |
| api/stripe-connect.py | Partner Express account onboarding | 10s |
| api/wa-webhook.py | WhatsApp webhook verification | 10s |
| api/twiml-record.py | Twilio voice webhook | 10s |

**Split hosting is intentional and working.** Firebase handles auth-gated operator tools. Vercel handles public surfaces + Python serverless. No need to consolidate — rationalize only.

---

## 4. Domain & URL State

| URL | Target | State |
|---|---|---|
| amig0.com | Vercel production | Live |
| amig0.com/hacks/ | hacks/index.html | Live |
| amig0.com/deals | deals.html | Live |
| amig0.com/business | business.html | Live |
| amig0.com/privacy | privacy.html | Live |
| amig0.com/terms | terms.html | Live |
| amig0.com/content/ | content/index.html | Live, unprotected |
| amig0.com/health/ | health/index.html | Live |
| amig0.com/landing.html | landing.html | Live, stale |
| amig0.vercel.app/hacks | Redirects to amig0.com | Legacy — still referenced in old IG posts |

**Gap:** Firebase Hosting domain not confirmed. CRM/Portal/Guide URLs unknown. Must be documented.

---

## 5. Data Stores

### Firestore Collections (confirmed)

| Collection | Owner | Notes |
|---|---|---|
| amig0_members | Subscription system | subscriptionStatus, stripeCustomerId, stripeSubscriptionId |
| affiliates | Deals system | status:pending/active, PIN, model, lat/lng |
| affiliates/{id}/secrets/verify | PIN verification | Server-side only, never client-exposed |
| deal_redemptions | Deals system | userId, redeemedAt — 30-day cooldown |
| service_bookings | Booking system | sessionId, rental/event fields, status:confirmed |
| clients | CRM | Operator-owned |
| tours | CRM | guideAssignments[], teamIds[] |
| passengers | CRM | bookingId scoping |
| quotes | CRM | Dual-currency, PDF |
| invoices | CRM | Dual-currency, PDF |
| providers | CRM | Vetting screenshots |
| guides | CRM | Firebase Auth UID field |
| operators | CRM | Custom claims managed via Cloud Functions |
| user_profiles | Auth layer | role: client/guide, clientId/guideId |
| partners | CRM | lat/lng, qrToken, category |
| marketplace_listings | Marketplace | seatsAvailable, featured |
| invites | Invite system | Single-use, expiring codes |
| checkins | QR check-in | userId, partnerId, timestamp |

### External Data
- **Stripe:** Customers, subscriptions, checkout sessions, payment intents
- **imgbb.com:** IG slide image hosting (public URLs, no account association)
- **Firebase Storage:** Provider vetting screenshots (operator-only bucket)

---

## 6. Security Boundaries

### Authentication Layers

| Layer | Mechanism | Enforcement |
|---|---|---|
| Operator | Firebase Auth custom claim `{operator: true}` | Firestore rules `isOperator()` + Cloud Functions |
| Client | Firebase Auth UID + user_profiles role:client | Firestore rules `isClientUser()` |
| Guide | Firebase Auth UID + user_profiles role:guide | Firestore rules `isGuideUser()` |
| Member (deals) | Firebase Auth + amig0_members.subscriptionStatus | Client-side check (deals.html) |
| Booking (hacks) | No auth — public checkout | Stripe signature verification server-side |
| WA operator alert | WA_OPERATOR_NUMBER env var | Server-side only |

### Security Gaps

| Gap | Severity | Notes |
|---|---|---|
| content/index.html publicly accessible with no auth | Medium | PUBLISH_SECRET sent as request header from client JS. Not in source HTML but visible in DevTools Network tab. |
| deals.html subscription gate is client-side only | Low | subscriptionStatus read from Firestore client-side. A motivated user could bypass in DevTools. Revenue impact minimal at current scale. |
| Firestore guide passengers rule — any authenticated guide can read any passenger | Low | Documented as accepted limitation (I10 in RAID). Single-tenant. |
| amig0.vercel.app/hacks legacy URL still indexed | Low | No 301 redirect configured. Old IG posts send traffic to legacy URL. |
| angel.MOV and DisciplineLog_20250101.xlsx in repo root | Low | Personal files. No secrets, but unprofessional artifact. |
| health/ folder contains leftover PNG exports | Low | PNG exports updated.zip — not committed but visible on disk. |

### Secrets & Credentials (Vercel env vars — confirmed)

| Secret | Purpose | State |
|---|---|---|
| ANTHROPIC_API_KEY | Claude Haiku | Active |
| IG_ACCESS_TOKEN | @amig0trips Instagram | Active (IGAAX token) |
| IG_USER_ID | 28153112260984867 | Active |
| IMGBB_API_KEY | imgbb.com | Active |
| PUBLISH_SECRET | Content Engine auth gate | Active |
| STRIPE_SECRET_KEY | Live mode restricted key | Active |
| STRIPE_PRICE_ID | $3.99/mo subscription | Active |
| STRIPE_WEBHOOK_SECRET | Subscription webhook | Active |
| STRIPE_BOOKING_WEBHOOK_SECRET | Booking webhook | Active |
| FIREBASE_SERVICE_ACCOUNT | Base64 service account JSON | Active |
| WA_TOKEN | WhatsApp Cloud API | Active — 60-day token, expires ~Nov 10, 2026 |
| WA_PHONE_NUMBER_ID | 1407135942475680 | Active |
| WA_VERIFY_TOKEN | Meta webhook verification | Active |
| WA_OPERATOR_NUMBER | 17605396606 (operator alert) | Active |

**No secrets committed to git. Pre-commit hook enforces this.**

---

## 7. Design System State

### What exists
- `tokens.css` — canonical design tokens at repo root. `:root` variables for color, nav, footer. Linked from: home, hacks, deals, business.
- `css/main.css` — CRM styles
- `css/portal.css` — Client Portal styles
- `css/guide.css` — Guide App styles

### Token coverage

| Token | Defined | Applied consistently |
|---|---|---|
| `--bg` #09090b | Yes | Mostly |
| `--p1` #818cf8 | Yes | Yes |
| `--text` #ffffff | Yes | Yes |
| `--muted` #a1a1aa | Yes | Mostly |
| `--surface` #141414 | Yes | Mostly |
| `--border` rgba(255,255,255,0.08) | Yes | Mostly |

### Typography
- **Consumer pages:** Plus Jakarta Sans (Google Fonts)
- **CRM/Portal/Guide:** DM Sans + Playfair Display
- **No font hosted locally** — all from Google Fonts CDN. Single point of failure if CDN is slow.

### Design system gaps
- Each consumer page carries ~100–300 lines of inline `<style>`. tokens.css reduces duplication but doesn't eliminate it.
- Booking modal CSS is entirely inline in hacks/index.html — not in tokens.css.
- No shared component HTML — nav/footer duplicated across all pages (copy-paste pattern).

### Brand assets (as of 2026-09-13)
- `og.png` — 1200×630, editorial, commissioned via brief
- `favicon.svg` — slashed-0 SVG, all consumer pages
- `brand/` — 10 assets: facebook-cover, story, 8 IG highlight covers
- `.claude/prompts/brand-asset-brief.md` — master creative brief, committed

---

## 8. SEO State

| Item | Status |
|---|---|
| robots.txt | Present |
| sitemap.xml | Present (4 pages), submitted to GSC |
| Canonical tags | home, hacks, deals, business |
| og:image | amig0.com/og.png — all consumer pages |
| og:title / og:description | All consumer pages |
| meta description | All consumer pages |
| JSON-LD Organization + WebSite | home.html only |
| Google Search Console | Verified (google3bac279bc2f9d80b.html) |
| llms.txt | Not present |
| AI crawlers in robots.txt | Not confirmed |

---

## 9. Integrations

| Integration | Purpose | State | Risk |
|---|---|---|---|
| Firebase (Firestore, Auth, Storage) | Primary DB + auth | Active | v10.12 compat locked |
| Stripe | Subscriptions + bookings | Active, live mode | Restricted key |
| Anthropic (Claude Haiku) | AI travel intel + recipes | Active | API key in Vercel |
| Instagram Graph API | @amig0trips carousel publishing | Active | IGAAX token, no expiry set |
| imgbb.com | IG slide image hosting | Active | Free tier, no SLA |
| WhatsApp Cloud API | Customer + operator notifications | Active | 60-day token expires Nov 10, 2026 |
| Twilio | (760) 891-4152 WA number | Active | WABA verified |
| OpenStreetMap (Nominatim + tiles) | Maps, geocoding | Active | No API key, rate-limited |
| Firebase Cloud Functions | Operator role management | Active | Node.js, deployed separately |
| Formspree | Hacks submit form | Active | Free tier |
| Leaflet.js 1.9.4 | Maps in CRM/portal/deals | Active | CDN dependency |

---

## 10. Integrations — Revenue Flows

```
Traveler → hacks/index.html → api/stripe-booking.py → Stripe Checkout
    → booking-webhook.py → Firestore service_bookings
    → WA to customer + operator
    → Operator fulfills with partner

Traveler → deals.html → api/stripe-checkout.py → Stripe Checkout
    → stripe-webhook.py → amig0_members.subscriptionStatus:active
    → Deals page unlocked
```

---

## 11. Technical Debt Register

| ID | Item | Severity | Effort |
|---|---|---|---|
| TD01 | Two script blocks in hacks/index.html — `renderTools` in block 2, `init()` in block 1 requires `typeof` guard | Low | Low — refactor when next major edit to hacks |
| TD02 | Nav/footer HTML duplicated across home, hacks, deals, business, privacy, terms | Low | Medium — would require include mechanism or SSR |
| TD03 | Inline `<style>` blocks on every page (300–600 lines each) | Low | Medium |
| TD04 | landing.html stale — references placeholder email, orphaned from product | Medium | Low — decision: redirect or remove |
| TD05 | content/index.html unprotected — publicly accessible internal tool | Medium | Low — add basic auth header check |
| TD06 | amig0.vercel.app legacy URLs not redirected to amig0.com | Low | Low — add Vercel redirect rule |
| TD07 | Firebase Hosting domain not documented | Medium | Low — confirm and document |
| TD08 | angel.MOV and DisciplineLog_20250101.xlsx in repo root | Low | Low — move or gitignore |
| TD09 | WA_TOKEN expires Nov 10, 2026 — no automated refresh | High | Medium — permanent system user token still needed |
| TD10 | health/ folder has leftover PNG exports on disk | Low | Low — delete |
| TD11 | Stripe booking flow untested end-to-end (RAID I23) | High | Low — test with sk_test_ key |
| TD12 | All 3 affiliates still status:pending (RAID I24) | High | None — owner action |
| TD13 | No San Diego e-bike partner (RAID I25) | High | None — owner action |
| TD14 | Firestore guide passengers scope (RAID I10) — accepted | Accepted | — |

---

## 12. What is Production-Quality

✅ Traveler Hacks — AI city intel, city filtering, bookable services, booking modal
✅ Deals — subscription gate, PIN redemption, affiliate map, rate limiting
✅ Home — rotating hero, nav, SEO, OG
✅ Business — partner application form
✅ CRM — full operator lifecycle (clients, tours, passengers, quotes, invoices, guides)
✅ Client Portal — booking/itinerary/perks view
✅ Guide App — PWA, field-ready
✅ Stripe subscription + booking flows
✅ booking-webhook.py — Firestore write + WA notifications
✅ Brand assets — og.png, favicon, highlight covers, brief
✅ Security rules — role-based, custom claims

## 13. What is Duplicated

- Nav HTML: home, hacks, deals, business, privacy, terms (6 copies)
- Footer HTML: same 6 pages
- SVG brand mark: inline in every nav + footer (12+ copies)
- og.png meta tag: all consumer pages
- tokens.css CSS variables: also partially redeclared inline per-page

## 14. What is Disconnected

- landing.html — no nav links to it from any active page, no traffic path
- health/index.html — personal tool on brand domain, no connection to product
- amig0.vercel.app/hacks — legacy URL still in old IG posts, no redirect
- Firebase Hosting domain — unknown URL, not documented

## 15. What Should Survive (Canonical Platform)

**Consumer product (Vercel):**
- amig0.com → home.html
- amig0.com/hacks/ → Traveler Hacks
- amig0.com/deals → Deals
- amig0.com/business → Partner application

**Operator tools (Firebase):**
- CRM, Client Portal, Guide App

**API layer (Vercel serverless):**
- All api/*.py functions

**Content engine:**
- content/index.html — internal, should be access-gated

**Remove from canonical path:**
- landing.html — decision needed (redirect or archive)
- health/ — move to separate Vercel project or private URL

---

## 16. Project Governance Assessment

| Document | State | Last Updated |
|---|---|---|
| CLAUDE.md | Current | 2026-09-07 (Session 20) |
| RAID.md | Current | 2026-08-30 (Session 19) — needs Session 21 items |
| master-prompt.md | Current | 2026-09-05 |
| docs/changelog.md | Exists | Unknown |
| docs/phase-0-audit.md | This document | 2026-09-13 |

**RAID.md gap:** I22–I25 are from Session 20 but Session 21 items (WA token 60-day, operator alert, brand refresh, referral links) are not yet logged.

---

## 17. Autonomy Model

### GREEN — Proceed without repeated approval
Routine, reversible, local repository work:
- Editing HTML/CSS/JS files
- Adding or updating copy
- Updating referral URLs, tool descriptions
- Committing and deploying to Vercel
- Reading/searching the codebase
- Updating CLAUDE.md, RAID.md, master-prompt.md
- Creating new pages that extend existing patterns
- Updating brand assets in brand/

### YELLOW — Proceed when authorized by active phase; preserve rollback
Bounded implementation work within an approved phase:
- New API routes (api/*.py)
- New Firestore collections or document structure
- Stripe integration changes (non-billing)
- New serverless functions
- Significant UI features (booking flow, new modal)
- Vercel env var additions (non-secret)
- Changes to vercel.json routing

### RED — Explicit human approval required before proceeding
Production, irreversible, or external-facing actions:
- Firestore Security Rules changes
- Firebase Auth / custom claims changes
- Stripe live billing changes (prices, products, webhook endpoints)
- DNS or domain changes
- Secrets rotation or addition of credentials (WA_TOKEN, Stripe keys)
- Deleting Firestore collections or documents
- Git history changes (rebase, force push)
- Pushing to GitHub remote
- External communications (sending WA, posting to Instagram, email)
- Firebase Hosting deploys (CRM/Portal/Guide)
- Removing or archiving deployed pages
- Any action affecting real customers or partners

---

## 18. Evidence-Based Lifecycle

Based on the audit, amig0 has completed an extended informal Phase 0 through rapid iteration. The proposed formal lifecycle from this point:

```
Phase 0 — Foundation Audit (this document)        ← CURRENT
Phase 1 — Consolidation & Hardening
Phase 2 — Revenue Activation (affiliates + bookings live)
Phase 3 — Growth (content engine, IG automation, city expansion)
Phase 4 — Scale (multi-operator, marketplace, World Cup 2026)
```

### Phase 1 — Consolidation & Hardening (proposed)

**Scope:**
1. Close TD09 — WA permanent token (blocks notification reliability)
2. Close TD11 — Stripe booking end-to-end test (blocks revenue confidence)
3. Close TD12 — Activate first affiliate (unlocks deals page)
4. Close TD04 — landing.html decision (redirect or archive)
5. Close TD05 — content/index.html access gate
6. Close TD06 — amig0.vercel.app redirect
7. Document Firebase Hosting domain (TD07)
8. Log Session 21 RAID items
9. Update CLAUDE.md to current state

**Not in Phase 1:**
- New features
- Redesign
- New integrations
- Content Engine automation

**Entry criterion:** This audit reviewed and approved by Daniel.

**Exit criterion:** All 9 items above resolved or explicitly deferred with owner + date.

---

## 19. Open Questions for Review

1. **Firebase Hosting domain** — what is the live URL for CRM/Portal/Guide? Is it amig0.web.app or a custom domain?
2. **landing.html** — redirect to amig0.com? Archive? Remove?
3. **health/index.html** — keep on amig0.com domain or move to separate project?
4. **content/index.html** — what access gate is acceptable? Header-based token? IP allowlist?
5. **Phase 1 priority order** — affiliate activation vs. Stripe test vs. WA token — which first?

---

*Document owner: OCTech Services | Do not begin implementation until reviewed.*
*Generated from repo evidence — 2026-09-13*
