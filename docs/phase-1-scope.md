# amig0 — Phase 1: Security, Reliability & Platform Rationalization
**OCTech Services | Tier 1 — Enterprise Grade**
**Status:** In progress
**Authorized:** 2026-09-13 (explicit authorization — Phase 1 entry message)
**Baseline:** docs/phase-0-audit.md

---

## Objective

Harden the existing platform without rebuilding it.

Close the security, reliability, and structural gaps identified in Phase 0.
Do not introduce new features. Do not redesign the consumer experience.
Do not consolidate Firebase and Vercel for architectural uniformity.

Rationalize and harden. The foundation is solid.

---

## Lifecycle Context

```
Phase 0 — Foundation & Forensic Current-State Audit          ✅ Complete
Phase 1 — Security, Reliability & Platform Rationalization   ← CURRENT
Phase 2 — Revenue Activation & Validation
Phase 3 — Experience & Design-System Consolidation
Phase 4 — Growth, Content & Geographic Discovery
Phase 5 — Scale / Marketplace / World Cup Readiness
```

These phases are planning boundaries, not immutable architecture.
Evidence discovered during delivery may justify refinement.
Document material changes rather than silently changing the lifecycle.

---

## Phase 1 Scope

### S01 — Content Engine Authorization (Priority: High)
**RAID I27 | Security finding**

- `/content/` is publicly accessible with no authentication gate
- `PUBLISH_SECRET` is transmitted as a client-side JS fetch header — visible in DevTools Network tab
- A browser-visible value is not an adequate authorization boundary
- Phase 1 action: investigate authorized-user model, implement server-side authorization
- Any auth/security-boundary change = **RED** — requires explicit approval before implementation

### S02 — Deals Subscription Gate Assessment (Priority: High)
**RAID I28 | Security assessment**

- `subscriptionStatus` check in deals.html is client-side Firestore read
- Four concerns to assess separately:
  1. UI/presentation gating (what users see)
  2. Membership entitlement verification (can this user access paid content)
  3. Redemption authorization (server-enforced per-redemption check)
  4. Firestore security-rule enforcement (server-side final authority)
- Phase 1 action: assess gap severity, document risk acceptance or implement hardening
- Any Firestore rules change = **RED**

### P01 — Stripe Booking End-to-End Validation
**RAID I23 | Revenue validation**

- Booking flow untested with live Stripe signature verification
- Test procedure: swap `STRIPE_SECRET_KEY` to `sk_test_...` in Vercel, book via amig0.com/hacks, card 4242 4242 4242 4242, confirm `service_bookings` write in Firestore, confirm operator WA alert fires
- Owner: Daniel

### P02 — WhatsApp Credential Lifecycle Planning
**RAID R06 / I22 | Operational risk**

- Current WA_TOKEN (60-day fb_exchange_token) expires Nov 10, 2026
- No automated refresh mechanism
- Phase 1 action: document refresh procedure, pursue permanent system user token, or establish calendar reminder for manual re-issue
- Credential change = **RED**

### P03 — Firebase Hosting Domain Documentation
**TD07 | Architecture/documentation**

- Live URL for CRM, Client Portal, and Guide App is not documented
- Phase 1 action: confirm domain, document in CLAUDE.md and RAID

### P04 — landing.html Disposition
**TD04 | Platform rationalization**

- landing.html is stale, references placeholder email, orphaned from active product
- Options: 301 redirect to amig0.com, archive, or remove
- Page removal = **RED** if it may affect indexed URLs

### P05 — health/ Disposition
**Architecture/rationalization**

- health/index.html is a personal habit tracker deployed on the amig0.com brand domain
- Leftover PNG exports exist on disk but are not committed
- Options: move to separate Vercel project, move to private URL, or leave as-is with documented decision
- Any domain/URL change = **RED**

### P06 — Legacy URL Redirect Rationalization
**TD06 | SEO/platform**

- amig0.vercel.app/hacks still referenced in old IG posts, no 301 redirect to amig0.com
- Phase 1 action: add Vercel redirect rule
- Vercel deployment = **RED**

### P07 — Repository Artifact Cleanup
**TD08, TD10 | Housekeeping**

- angel.MOV and DisciplineLog_20250101.xlsx in repo root
- health/ PNG exports on disk (not committed)
- Phase 1 action: move or gitignore personal files, delete disk artifacts

### P08 — Regression & Security Validation
**Phase exit requirement**

- After all security changes: verify Traveler Hacks, Deals, booking flow, WA notifications still function
- Manual test on mobile and desktop before exit

### P09 — Governance Documentation Reconciliation
**Phase exit requirement**

- CLAUDE.md, RAID.md, master-prompt.md current and accurate at phase close
- Phase 1 exit report committed to docs/

---

## Not in Phase 1

- New consumer features
- Consumer experience redesign
- New integrations
- Content Engine automation or new city series
- Affiliate activation (Revenue Backlog RB01 — business development)
- E-bike partner acquisition (Revenue Backlog RB02 — business development)
- Framework introduction to eliminate duplicated HTML/CSS
- Multi-agent implementation model

---

## Autonomy Model (Phase 1)

**GREEN** — Repository edits, documentation, local validation, commits, RAID/CLAUDE updates.

**YELLOW** — New Vercel routing rules, non-auth serverless function changes, non-security Firestore collection additions.

**RED** — Production deployment, auth/security-boundary changes, Firestore security rules, Stripe live billing, DNS, secrets, page removal, external communications.

---

## Rollback Strategy

**Pre-push (commits exist locally only):**
- `git revert <sha>` one or more commits, then discard or keep locally

**Post-push, pre-production-deploy:**
- `git revert <sha>` — create a normal revert commit, push to the branch
- Do NOT use `git push --force` or `git reset --hard` on shared branches (main/phase-1)

**Post-production-deploy:**
- Preferred: Vercel dashboard → Deployments → select prior deployment → Promote to Production (instant, no new deploy needed)
- Alternative: `git revert <sha>` → commit → `npx vercel --prod` (re-deploys the reverted state)
- Do NOT rewrite shared history (no force-push to main)

---

## Exit Criteria

All Phase 1 items resolved, explicitly deferred with owner + date, or accepted as known risk.
Exit report committed to docs/phase-1-exit.md.
CLAUDE.md, RAID.md updated to reflect Phase 1 complete.
Phase 2 authorized by Daniel before any Phase 2 work begins.

---

## Recommended First Workstream

**S01 — Content Engine Authorization**

Highest severity finding. Clear scope (investigate model, implement server-side gate).
Does not require new infrastructure — the Vercel serverless layer already exists.
Resolving this unblocks confident use of the Content Engine in Phase 4.

Do not begin implementation until authorization confirmed in session.

---

*Document owner: OCTech Services*
*Do not begin implementation until authorized per workstream.*
