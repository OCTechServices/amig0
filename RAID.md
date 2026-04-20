# RAID Log: amig0-travel-company
# Tier 1 — Enterprise Grade | OCTech Services
# Last Updated: 2026-04-19 (Session 2)

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
| I02 | Firestore Security Rules not reviewed for client portal UID scoping | Project intake | High | Closed — role-based rules written 2026-04-19; user_profiles collection required; deploy before portal goes live |
| I03 | Service worker cache versioning strategy not documented | Project intake | Medium | Open |
| I04 | GitHub Pages → Firebase Hosting migration decision pending | Project intake | Low | Open |
| I05 | Client Portal scoped as read-only (bookings + itineraries) — no pre-trip social layer designed yet | Session 2 design input | Low | Open — evaluate during portal design phase |

## Dependencies
| ID | Dependency | Type | Notes |
|---|---|---|---|
| D01 | Firebase v10.12 compat SDK | External | Firestore + Auth + Storage — version locked |
| D02 | Leaflet.js 1.9.4 | External | Maps — loaded via script tag |
| D03 | jsPDF | External | PDF generation — loaded via script tag |
| D04 | GitHub Pages + custom domain | Hosting | Current deployment target |
| D05 | Google Fonts (DM Sans + Playfair Display) | External | Typography — requires internet |
| D06 | Native mobile app (iOS/Android) | Future decision | Dan confirmed intent to ship a mobile app — stack decision (React Native vs Flutter vs PWA-only) pending; guide.html already scoped as installable PWA which may be sufficient |
