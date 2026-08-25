# RAID Log: amig0-travel-company
# Tier 1 — Enterprise Grade | OCTech Services
# Last Updated: 2026-08-24 (Session 17)

---

## Risks
| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R01 | Firebase config committed with live keys | Medium | Critical | Exclude config from git; verify before first push |
| R02 | Firestore Security Rules misconfigured — client portal exposes other clients' data | Medium | Critical | Scope all reads to authenticated UID; test rules with Firebase emulator |
| R03 | Service worker caches stale data — guides in field receive outdated tour info | Medium | High | Version service worker cache on every deploy; force refresh strategy |
| R04 | Rule change in shared Firebase project breaks one of three apps silently | Medium | High | Test all three apps after any Firestore rule change |
| R05 | CLAUDE.md becomes stale across 18,600-line codebase | Medium | High | Update at session end; session-end hook enforces this |

## Assumptions
| ID | Assumption |
|---|---|
| A01 | No build step is intentional — bundler or npm will not be introduced |
| A02 | Firebase v10.12 compat SDK is the locked version |
| A03 | All three apps share one Firebase project and one set of Security Rules |
| A04 | GitHub Pages is current hosting — Firebase Hosting migration is a future decision |
| A05 | Mobile + desktop testing is manual — no automated E2E test runner |
| A06 | Group tour passengers self-select for structured social experiences — cold-start social problem is smaller than hostels but expectation gap ("I paid, entertain me") still exists and should be designed against |
| A07 | A pre-trip social layer in the Client Portal (passenger roster visibility, operator-seeded group chat link) will meaningfully improve group cohesion and reduce post-trip negative reviews citing "poor group dynamic" |

## Issues
| ID | Issue | Source | Priority | Status |
|---|---|---|---|---|
| I01 | Firebase config key exposure risk — not yet verified as excluded from git | Project intake | High | Closed — .gitignore created 2026-04-11, firebase-config.js excluded before any keys exist |
| I02 | Firestore Security Rules — operator role enforcement | Project intake | Medium | Closed — Firebase Auth custom claims implemented via Cloud Functions (addOperator, removeOperator). Firestore rules updated to isOperator() for all CRM collections. Operators module added to CRM. Bootstrap: Firebase Console → Custom Claims: {"operator":true} on first account, then sign out/in. (2026-05-02) |
| I03 | Service worker cache versioning strategy not documented | Project intake | Medium | Closed — bump CACHE_NAME version on every guide app deploy. Activate handler purges old caches automatically. Documented in sw.js header. |
| I04 | GitHub Pages → Firebase Hosting migration decision pending | Project intake | Low | Closed — firebase.json hosting block configured and deployed (2026-05-02). sw.js no-cache header added. |
| I05 | Client Portal scoped as read-only (bookings + itineraries) — no pre-trip social layer designed yet | Session 2 design input | Low | Closed — Group chat link field added to tours.js. Portal Overview surfaces "Join Group Chat" card when link is set. (2026-05-03) |
| I06 | Fellow Travellers list requires cross-client booking reads — blocked by correct security rules | Session 3 | Low | Closed — resolved by current auth != null rules which allow all authenticated reads. Graceful fallback retained for network errors. |
| I07 | No in-CRM provisioning flow for client/guide Firebase Auth accounts | Session 5 review | High | Partially closed — Firebase Auth UID field added to clients form (2026-05-02). Portal Access column shows Linked/Not linked. Operator pastes UID from Firebase Console → Authentication → Users; user_profiles doc still created via Console. Full automation requires custom claims + Admin SDK (RAID I02). |
| I08 | guides.js form has no UID field — guide records cannot be linked to Firebase Auth for guide app login | Session 5 review | High | Closed — Firebase Auth UID field added to guide form (2026-05-02). App Access column in table shows Linked/Not linked. Operator pastes UID from Firebase Console → Authentication → Users. |
| I09 | No email delivery for quotes and invoices | Session 5 review | Medium | Closed — mailto: deep links added to Quotes and Invoicing modules (2026-05-02). Email button opens operator's email client pre-filled with client address, subject, and structured body. Falls back to alert if no client email on record. |
| I10 | Guide passengers rule-level scoping incomplete | Session 6 | Low | Open — passengers collection allows read by any authenticated guide (no tour-level restriction at rules layer). Guide app scopes in JS via booking-filtered passenger IDs. Full rules scoping requires adding tourId to passenger docs (denormalization). Accepted limitation for single-tenant. |
| I11 | landing.html contact email is placeholder — demo@amig0travel.com used in 5 locations (nav CTA, hero CTA x2, form handler, footer) | Session 7 | Low | Closed — replaced with contact@opcoretech.com across all 5 occurrences in landing.html, and portal-marketplace.js. (2026-05-03) |
| I12 | landing.html bracelet access section had no submission path — users read criteria then hit a dead end | Session 10 | Medium | Closed — apply form added (name, email, proof URL). Formspree submit + mailto fallback. (2026-05-04) |
| I13 | landing.html persona selector showed all page content by default — no progressive disclosure | Session 10 | Low | Closed — persona gate implemented. Sections below persona hidden until Pleasure or Revenue selected. Revenue reveals full operator page. Pleasure keeps gate closed, focuses onboarding CTA. (2026-05-04) |
| I14 | Habit Tracker needed a shareable live URL — local server not viable for two-person accountability use case | Session 11 | Medium | Closed — deployed to Vercel (amig0.vercel.app/health/) via CLI. api/recipe.py serverless function handles Anthropic API proxy. ANTHROPIC_API_KEY set as Vercel env var. (2026-08-16) |
| I15 | Traveler Hacks needed a public-facing tool for AI-generated city travel intel | Session 12 | Medium | Closed — hacks/index.html built + deployed at amig0.vercel.app/hacks/. Discover mode (interests → Claude picks venues) + Custom mode (named venues). api/hacks.py Vercel serverless. Copy as text export. Submit your city community form with mailto fallback. (2026-08-16) |
| I16 | Instagram carousel publishing failing — IG_USER_ID env var pointed to wrong account | Session 13 | High | Closed — IG_USER_ID corrected to 28153112260984867 (@amig0trips). Added GET handler to api/ig-post.py for token identity verification at /api/ig-post. Removed inter-child sleep, reduced container wait to 5s to fix 504 timeouts. (2026-08-16) |
| I17 | IG Graph API returns 403/400 on publish even when carousel posts successfully | Session 14 | Medium | Closed — _ig_post retries on 403 (4s wait). _ig_publish wraps 400/403 as soft 200 with amber warning to user. Post confirmed live on @amig0trips despite error codes. (2026-08-19) |
| I18 | Venue map slide pins missing — Nominatim too strict as gatekeeper for small bars/restaurants | Session 14 | Medium | Closed — 3-tier coordinate fallback: Nominatim → Claude lat/lng (schema) → city center. All 5 pins always render. City center anchor ensures map context regardless of geocoding accuracy. (2026-08-19) |
| I19 | deal_redemptions composite index missing — query (userId == x, redeemedAt >= cutoff) fails silently on fresh page load, card shows "Redeem deal" even after recent redemption | Session 15 | High | Closed — removed composite query entirely. renderCards now queries by userId only (single-field, no index needed) and filters redeemedAt >= cutoff in JS. Hard refresh now correctly shows "Redeemed this month". (2026-08-22) |

## Vision Backlog
Product ideas and strategic opportunities — captured for future prioritization. Not yet scoped or committed.

| ID  | Idea | Origin | Notes |
|-----|------|--------|-------|
| V01 | Guide + Driver partnership model — Pueblo Mágico tours | Session 7 | Two independent operators (guide + driver) co-run a tour on one platform. Guide manages itinerary/briefings; driver manages transport/pax. Client sees one seamless experience. Multi-operator architecture already supported by current data model (multiple guides, providers on one tour). First real multi-role partnership use case. |
| V02 | Private transport / independent driver ICP | Session 7 | Dan has confirmed partners (Mexico City drivers) who would adopt this. Driver = guide role, transfer = tour, passengers = clients. Invoices and portal replace WhatsApp. Immediate pipeline opportunity before World Cup. |
| V03 | Exclusive tour marketplace — open slots for 1–2 travelers | Session 7 | Operators list tours with open seats. Access restricted to vetted/previous users only. Invite-only onboarding: invitation comes from a vetted existing user or operator. World Cup 2026 as the launch moment. Physical bracelet as access/identity artifact. Premium, exclusive feel. |
| V04 | Invite-only user onboarding with physical bracelet | Session 7 | Pairs with V03. Users gain access via invitation from a vetted source. Bracelet = physical token of membership. Creates scarcity, exclusivity, and word-of-mouth growth vector. Aligns with sales motion: no public signup, earned access. |
| V05 | Rental home long-term management | Session 7 | Separate product category from group experience management. Property management vs. group operations. Deferred — out of current scope. The curated group stays use case (co-living, retreats) is already in scope under V03/ICP. |
| V06 | Multi-operator partnership tours (multi-guide assignment per tour) | Session 7 | Current data model supports one guideId per tour. V01 (Guide+Driver) requires multiple operator roles on a single tour. Platform implementation needed: array of guide/role assignments, each with a role label (guide, driver, host, facilitator). Revenue split tracking between co-operators. |
| V07 | Platform roadmap — Private transport as a configurable tour type | Session 7 | Transport operators (drivers, shuttle services) are a confirmed ICP. Dan has partners ready. No code change required — current platform supports this with existing tour/guide/passenger model. Sales motion only. |
| V08 | NFC/QR physical bracelet as platform access credential | Session 7 | Bracelet = physical proof of attendance + digital access token for marketplace. Scan → portal access or marketplace invite. World Cup 2026 as launch artifact. Creates scarcity, word-of-mouth, and collectible value. Stack: Firebase Dynamic Links or custom QR to portal auth flow. |
| V09 | Invite-only marketplace access — vetted invitation chain | Session 7 | No public signup. Access granted by invitation from a vetted existing user or operator. Invitation chain ensures quality control. Firebase Auth + custom claims for marketplace access tier. Invite tokens stored in Firestore, single-use, expiring. |
| V10 | Marketplace module — open tour seat listings for travelers | Session 7 | Operators list tours with available seats (1–2 spots). Accessible only to users with marketplace access claim. Traveler opts in, operator confirms. Builds supply from existing operator base, demand from World Cup traveler wave. Separate Firestore collection: marketplace_listings. |
| V11 | Verified partner merchant network | Session 8 | Restaurants, bars, venues, transport, shops near stadiums apply to become verified Amig0 partners. They offer exclusive discounts/perks to Amig0 travelers. They get a QR/window badge of verification and exposure to high-spending international World Cup travelers. Platform becomes a local commerce layer on top of the travel coordination stack. |
| V12 | QR/NFC check-in system — traveler perks at partner venues | Session 8 | Traveler scans their Amig0 QR (or bracelet NFC) at a partner venue to claim their perk. Check-in logged to Firestore: userId, partnerId, timestamp, country. Bracelet (V08) becomes the physical credential for this system — no phone needed at the venue. |
| V13 | Partner analytics dashboard — visitor intelligence | Session 8 | Per-partner: total Amig0 visitors, top nationalities, peak visit times. Per-operator: which venues your group visited. Platform-wide: real-time heatmap of active Amig0 travelers in the city, country breakdown. Sales pitch to merchants: "340 Amig0 travelers visited partner venues last week — 42% US, 28% Canada." |
| V14 | Creator-guide — creator IS the guide, not just the distributor | Session 8 | Content creator registers as both operator and guide on their own tours. They lead the experience in the field (guide app), manage it from the CRM, and their followers book via the client portal. The trip is the content; the content markets the next trip. Creator-guides have maximum skin in the game — a bad trip is a bad video. Audience self-selects → expectation gap near zero. Credential: engagement rate screenshot from Instagram/YouTube (quality over follower count). Platform already supports this architecture — no new role needed, creator assigns themselves as guide on their own tour. |
| V15 | Dual-currency pricing — MXN + USD side-by-side | Session 8 | International World Cup travelers need USD pricing; local operators think in MXN. Display both on quotes, invoices, and client portal. Exchange rate applied at time of quote generation, locked on invoice. Short-term: static rate input on quote form. Long-term: live exchange rate API. |

## Platform Implementation Backlog
Features confirmed for future build — not yet in active sprint.

| ID  | Feature | Priority | Notes |
|-----|---------|----------|-------|
| P01 | Multi-guide/role assignment per tour | High | **Shipped Session 8.** tours doc now stores guideAssignments [{guideId, role, name}] + teamIds []. guide-auth.js queries teamIds array-contains with legacy guideId fallback. window.GuideAuth.role set on login. Role badges (Guide/Driver/Host) in CRM tours table. |
| P02 | Marketplace listings module | Medium | **Shipped Session 9.** marketplace.js CRM module + portal-marketplace.js invite-gated portal tab. Collection: marketplace_listings. Fields: tourId, title, destination, seatsAvailable, pricePerSeat, currency, status, featured, startDate, endDate. |
| P03 | Invite-only access system | Medium | **Shipped Session 9.** invites.js CRM module. Collection: invites {code XXXX-XXXX, createdBy, usedByUid, usedByEmail, usedAt, expiresAt, accessLevel}. Portal redemption flow in portal-marketplace.js. Batch write grants marketplaceAccess on user_profiles. |
| P04 | Revenue split tracking between co-operators | Low | Extend invoices/bookings with splitConfig: [{operatorId, percentage}]. Reporting shows split breakdown. Required before marketplace commissions can be calculated. |
| P05 | Replace contact form mailto: with Formspree or backend handler | High | Current demo form opens user's mail client — leads may be lost. Formspree endpoint captures email server-side. 5-minute change when real contact email is confirmed (RAID I11). |
| P06 | Cross-platform reputation import — provider vetting | High | Screenshot upload field on provider/guide record for Uber, GetYourGuide, Viator, Airbnb Experiences ratings. Minimum thresholds: driver 4.7⭐, guide 4.8⭐, host Superhost or equivalent. Operator reviews and sets Verified badge. MVP: screenshot stored in Firebase Storage linked to provider doc. Long-term: API pull where available. |
| P07 | Partner/merchant Firestore collection + QR token generation | Medium | **Shipped Session 9.** partners.js CRM module. Collection: partners {name, category, location, country, discountOffer, perks, contactName, contactPhone, website, lat, lng, qrToken, active, verifiedAt}. qrToken = 12-char alphanumeric, auto-generated on create. |
| P08 | Check-in collection + portal check-in flow | Medium | **Shipped Session 9.** checkin.html standalone QR deep-link page. portal-perks.js shows active partners + check-in history. Collection: checkins {userId, partnerId, clientId, country, timestamp, tourId}. Firestore rule: client creates own check-in only. |
| P09 | Portal map tab — verified partner discovery | Medium | **Shipped Session 9.** portal-map.js Leaflet map tab with category-colored divIcon pins. Partner popup on click. User QR pass (api.qrserver.com) shown below map. mapInstance.remove() prevents "already initialised" error on tab revisit. |
| P10 | Dual-currency display on quotes, invoices, and portal | Medium | **Shipped Session 9.** exchangeRate field on quotes/invoices. formatSecondary() helper: MXN÷rate=USD or USD×rate=MXN. Shown in table TD, portal rows, and PDF totals block (muted secondary line). |

## Dependencies
| ID | Dependency | Type | Notes |
|---|---|---|---|
| D01 | Firebase v10.12 compat SDK | External | Firestore + Auth + Storage — version locked |
| D02 | Leaflet.js 1.9.4 | External | Maps — loaded via script tag |
| D03 | jsPDF | External | PDF generation — loaded via script tag |
| D04 | GitHub Pages + custom domain | Hosting | Current deployment target |
| D05 | Google Fonts (DM Sans + Playfair Display) | External | Typography — requires internet |

---

## Governance Backlog
| ID | Item | Priority | Notes |
|---|---|---|---|
| GB-01 | Trim CLAUDE.md to PP01 200-line limit | Medium | Closed — session changelogs moved to docs/changelog.md (2026-08-16). CLAUDE.md trimmed to current-state facts only. |
| D06 | Native mobile app (iOS/Android) | Future decision | Dan confirmed intent to ship a mobile app — stack decision (React Native vs Flutter vs PWA-only) pending; guide.html already scoped as installable PWA which may be sufficient |
