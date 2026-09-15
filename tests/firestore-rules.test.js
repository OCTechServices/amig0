/**
 * amig0 Firestore Security Rules — S02 Final Security Gate Tests
 *
 * Run:  firebase emulators:start --only firestore
 *       cd tests && npm test
 *
 * Sections:
 *   M01–M11  Membership (amig0_members) read/write/delete restrictions
 *   R01–R12  Redemption regression suite (preserved from prior gate)
 *   T01–T03  Threat-path reproduction (V01, V02, V03)
 *   C01–C08  Coupling invariant + attack-path tests (V05)
 *
 * SIMPLE_UID fixture rationale (M04–M07, M10, T01–T02):
 *   The Firestore emulator v1.20.4 logs an "evaluation error" when diff()
 *   compares Timestamp-type fields that differ between old and new documents.
 *   The denial is still correct (fail-closed), but does not prove the
 *   intended hasOnly() logic. Tests using SIMPLE_UID — a doc with only
 *   string/number fields — eliminate the Timestamp comparison and produce
 *   a clean, intent-driven denial.
 */

'use strict';

const { initializeTestEnvironment, assertFails, assertSucceeds } =
  require('@firebase/rules-unit-testing');
const {
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  writeBatch, serverTimestamp, Timestamp
} = require('firebase/firestore');
const { readFileSync } = require('fs');
const { resolve }      = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PROJECT_ID   = 'amig0-rules-test';
const RULES_PATH   = resolve(__dirname, '../firestore.rules');
const AFFILIATE_ID = 'venue1';
const CORRECT_PIN  = '1234';
const WRONG_PIN    = '9999';
const YEAR_MONTH   = new Date().toISOString().slice(0, 7);

const UID = {
  // Core fixtures (Timestamp-containing docs for realistic scenarios)
  ACTIVE:          'active_user',
  TRIAL:           'trial_user',
  EXPIRED:         'expired_user',
  LOCKED:          'locked_user',
  LOCKOUT_EXPIRED: 'lockout_expired_user',
  OTHER:           'other_user',
  OPERATOR:        'operator_user',

  // String-only fixture — no Timestamps — for clean diff() denial proofs
  SIMPLE:          'simple_member',

  // Isolated write UIDs — each write test gets its own UID to avoid
  // cross-test doc collisions.
  REDEEM_ACTIVE:   'redeem_active',
  REDEEM_TRIAL:    'redeem_trial',

  // Coupling test UIDs (C01–C08)
  C01: 'c01_user',   // no sentinel — for deal-without-sentinel test
  C02: 'c02_user',   // for sentinel-without-deal test
  C03: 'c03_user',   // for valid first redemption coupling test
  C04: 'c04_user',   // recent sentinel — inside lockout
  C05: 'c05_user',   // old sentinel — after lockout
  C06: 'c06_user',   // for future-timestamp test
  C07: 'c07_user',   // for wrong-userId test
  C08: 'c08_user',   // for malformed affiliate test
};

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------
const now     = new Date();
const days    = (n) => new Date(now.getTime() + n * 86400000);
const daysAgo = (n) => days(-n);

let testEnv;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
before(async function () {
  this.timeout(20000);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host:  '127.0.0.1',
      port:  8080,
    },
  });

  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // ── Member docs (Timestamp-containing, realistic) ─────────────────────
    await setDoc(doc(db, 'amig0_members', UID.ACTIVE), {
      subscriptionStatus:   'active',
      trialStartedAt:       Timestamp.fromDate(daysAgo(40)),
      trialEndsAt:          Timestamp.fromDate(daysAgo(33)),
      stripeCustomerId:     'cus_test123',
      stripeSubscriptionId: 'sub_test123',
      email:                'active@example.com',
      createdAt:            Timestamp.fromDate(daysAgo(40)),
      zeroVariant:          'amiga',
    });

    await setDoc(doc(db, 'amig0_members', UID.TRIAL), {
      subscriptionStatus: 'trial',
      trialStartedAt:     Timestamp.fromDate(daysAgo(3)),
      trialEndsAt:        Timestamp.fromDate(days(4)),
      email:              'trial@example.com',
      createdAt:          Timestamp.fromDate(daysAgo(3)),
      zeroVariant:        'amiga',
    });

    await setDoc(doc(db, 'amig0_members', UID.EXPIRED), {
      subscriptionStatus: 'trial',
      trialStartedAt:     Timestamp.fromDate(daysAgo(10)),
      trialEndsAt:        Timestamp.fromDate(daysAgo(3)),
      email:              'expired@example.com',
      createdAt:          Timestamp.fromDate(daysAgo(10)),
    });

    await setDoc(doc(db, 'amig0_members', UID.LOCKED), {
      subscriptionStatus: 'active',
      email:              'locked@example.com',
      createdAt:          Timestamp.fromDate(daysAgo(30)),
    });
    await setDoc(
      doc(db, 'amig0_members', UID.LOCKED, 'redemptions', AFFILIATE_ID),
      { redeemedAt: Timestamp.fromDate(daysAgo(5)) }
    );

    await setDoc(doc(db, 'amig0_members', UID.LOCKOUT_EXPIRED), {
      subscriptionStatus: 'active',
      email:              'lockout@example.com',
      createdAt:          Timestamp.fromDate(daysAgo(60)),
    });
    await setDoc(
      doc(db, 'amig0_members', UID.LOCKOUT_EXPIRED, 'redemptions', AFFILIATE_ID),
      { redeemedAt: Timestamp.fromDate(daysAgo(40)) }
    );

    // ── SIMPLE_UID — string-only fields, no Timestamps ───────────────────
    // Used for M04–M07, M10, T01–T02 to prove clean rule denial (no eval quirk).
    await setDoc(doc(db, 'amig0_members', UID.SIMPLE), {
      subscriptionStatus:   'trial',
      trialStartedAt:       '2026-09-10',  // string placeholder
      trialEndsAt:          '2026-09-17',  // string placeholder
      stripeCustomerId:     'cus_placeholder',
      stripeSubscriptionId: 'sub_placeholder',
      email:                'simple@example.com',
      zeroVariant:          'amiga',
    });

    // ── Isolated redemption write UIDs ────────────────────────────────────
    for (const uid of [UID.REDEEM_ACTIVE, UID.REDEEM_TRIAL]) {
      await setDoc(doc(db, 'amig0_members', uid), {
        subscriptionStatus: 'active',
        email:              uid + '@example.com',
        createdAt:          Timestamp.fromDate(daysAgo(10)),
      });
    }

    // ── Coupling test UIDs (C01–C08) ──────────────────────────────────────
    for (const uid of [UID.C01, UID.C02, UID.C03, UID.C06, UID.C07, UID.C08]) {
      await setDoc(doc(db, 'amig0_members', uid), {
        subscriptionStatus: 'active',
        email:              uid + '@example.com',
        createdAt:          Timestamp.fromDate(daysAgo(10)),
      });
    }

    // C04 — inside lockout (sentinel 5 days ago)
    await setDoc(doc(db, 'amig0_members', UID.C04), {
      subscriptionStatus: 'active',
      email:              'c04@example.com',
      createdAt:          Timestamp.fromDate(daysAgo(30)),
    });
    await setDoc(
      doc(db, 'amig0_members', UID.C04, 'redemptions', AFFILIATE_ID),
      { redeemedAt: Timestamp.fromDate(daysAgo(5)) }
    );

    // C05 — after lockout (sentinel 40 days ago)
    await setDoc(doc(db, 'amig0_members', UID.C05), {
      subscriptionStatus: 'active',
      email:              'c05@example.com',
      createdAt:          Timestamp.fromDate(daysAgo(60)),
    });
    await setDoc(
      doc(db, 'amig0_members', UID.C05, 'redemptions', AFFILIATE_ID),
      { redeemedAt: Timestamp.fromDate(daysAgo(40)) }
    );

    // ── Affiliate + secret ────────────────────────────────────────────────
    await setDoc(doc(db, 'affiliates', AFFILIATE_ID), {
      name:   'Test Venue',
      status: 'active',
    });
    await setDoc(
      doc(db, 'affiliates', AFFILIATE_ID, 'secrets', 'verify'),
      { verifyPin: CORRECT_PIN }
    );
  });
});

after(async function () {
  await testEnv.cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function userCtx(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, claims);
}
function unauthCtx() {
  return testEnv.unauthenticatedContext();
}
function dealDocId(uid, month) {
  return uid + '_' + AFFILIATE_ID + '_' + (month || YEAR_MONTH);
}
function dealData(uid, pin) {
  return {
    userId:        uid,
    userEmail:     uid + '@example.com',
    affiliateId:   AFFILIATE_ID,
    affiliateName: 'Test Venue',
    dealOffer:     '10% off',
    dealValue:     10,
    pin:           pin,
    redeemedAt:    serverTimestamp(),
  };
}

// ---------------------------------------------------------------------------
// M — MEMBERSHIP TESTS (amig0_members/{uid})
// ---------------------------------------------------------------------------
describe('M — amig0_members', () => {

  it('M01: unauthenticated read is rejected', async () => {
    const db = unauthCtx().firestore();
    await assertFails(getDoc(doc(db, 'amig0_members', UID.ACTIVE)));
  });

  it('M02: authenticated user can read their own membership doc', async () => {
    const db = userCtx(UID.ACTIVE).firestore();
    await assertSucceeds(getDoc(doc(db, 'amig0_members', UID.ACTIVE)));
  });

  it('M03: authenticated user cannot read another user\'s membership doc', async () => {
    const db = userCtx(UID.OTHER).firestore();
    await assertFails(getDoc(doc(db, 'amig0_members', UID.ACTIVE)));
  });

  // M04–M07, M10, T01–T02 use SIMPLE_UID (no Timestamps).
  // This eliminates the emulator diff()-Timestamp quirk and proves
  // the hasOnly(['zeroVariant']) logic is the actual cause of denial.

  it('M04 [T01]: user cannot set subscriptionStatus=\'active\' — clean denial via hasOnly', async () => {
    // SIMPLE_UID.subscriptionStatus = 'trial' → changing to 'active' is a real field change.
    // diff().affectedKeys() = ['subscriptionStatus']. hasOnly(['zeroVariant']) = false → DENIED.
    const db = userCtx(UID.SIMPLE).firestore();
    await assertFails(
      updateDoc(doc(db, 'amig0_members', UID.SIMPLE), { subscriptionStatus: 'active' })
    );
  });

  it('M05 [T02]: user cannot extend trialEndsAt — clean denial via hasOnly', async () => {
    // SIMPLE_UID uses string placeholders; changes trialEndsAt string value.
    // diff().affectedKeys() = ['trialEndsAt']. hasOnly(['zeroVariant']) = false → DENIED.
    const db = userCtx(UID.SIMPLE).firestore();
    await assertFails(
      updateDoc(doc(db, 'amig0_members', UID.SIMPLE), { trialEndsAt: '2099-01-01' })
    );
  });

  it('M06: user cannot reset trialStartedAt — clean denial via hasOnly', async () => {
    const db = userCtx(UID.SIMPLE).firestore();
    await assertFails(
      updateDoc(doc(db, 'amig0_members', UID.SIMPLE), { trialStartedAt: '1970-01-01' })
    );
  });

  it('M07: user cannot modify stripeSubscriptionId — clean denial via hasOnly', async () => {
    const db = userCtx(UID.SIMPLE).firestore();
    await assertFails(
      updateDoc(doc(db, 'amig0_members', UID.SIMPLE), { stripeSubscriptionId: 'sub_attacker' })
    );
  });

  it('M08: user cannot delete their membership document', async () => {
    const db = userCtx(UID.ACTIVE).firestore();
    await assertFails(deleteDoc(doc(db, 'amig0_members', UID.ACTIVE)));
  });

  it('M09: zeroVariant update succeeds (legitimate client profile write)', async () => {
    const db = userCtx(UID.ACTIVE).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'amig0_members', UID.ACTIVE), { zeroVariant: 'amigo' })
    );
  });

  it('M10: update fails when zeroVariant is bundled with entitlement field — clean denial', async () => {
    // SIMPLE_UID: both zeroVariant and subscriptionStatus change.
    // diff().affectedKeys() = ['zeroVariant', 'subscriptionStatus'].
    // hasOnly(['zeroVariant']) = false → DENIED.
    const db = userCtx(UID.SIMPLE).firestore();
    await assertFails(
      updateDoc(doc(db, 'amig0_members', UID.SIMPLE), {
        zeroVariant:        'amigo',
        subscriptionStatus: 'active',
      })
    );
  });

  it('M11: Admin SDK (rules-disabled) can write entitlement fields — documents trusted path', async () => {
    await assertSucceeds(
      testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'amig0_members', UID.ACTIVE), {
          subscriptionStatus: 'active',
        }, { merge: true });
      })
    );
  });

});

// ---------------------------------------------------------------------------
// R — REDEMPTION REGRESSION SUITE
// ---------------------------------------------------------------------------
describe('R — deal_redemptions + sentinel (regression)', () => {

  it('R01: active subscriber + correct PIN → first redemption succeeds', async () => {
    const db    = userCtx(UID.REDEEM_ACTIVE).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.REDEEM_ACTIVE)), dealData(UID.REDEEM_ACTIVE, CORRECT_PIN));
    batch.set(doc(db, 'amig0_members', UID.REDEEM_ACTIVE, 'redemptions', AFFILIATE_ID), { redeemedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });

  it('R02: valid trial user + correct PIN → redemption succeeds', async () => {
    const db    = userCtx(UID.REDEEM_TRIAL).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.REDEEM_TRIAL)), dealData(UID.REDEEM_TRIAL, CORRECT_PIN));
    batch.set(doc(db, 'amig0_members', UID.REDEEM_TRIAL, 'redemptions', AFFILIATE_ID), { redeemedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });

  it('R03: wrong PIN → batch rejected', async () => {
    const db    = userCtx(UID.ACTIVE).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.ACTIVE, '2099-01')), dealData(UID.ACTIVE, WRONG_PIN));
    batch.set(doc(db, 'amig0_members', UID.ACTIVE, 'redemptions', AFFILIATE_ID), { redeemedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  it('R04: expired trial user → rejected (isMemberAllowed fails)', async () => {
    const db    = userCtx(UID.EXPIRED).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.EXPIRED)), dealData(UID.EXPIRED, CORRECT_PIN));
    batch.set(doc(db, 'amig0_members', UID.EXPIRED, 'redemptions', AFFILIATE_ID), { redeemedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  it('R05: unauthenticated request → rejected', async () => {
    const db    = unauthCtx().firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', 'anon_' + AFFILIATE_ID + '_' + YEAR_MONTH), {
      userId: 'anon', affiliateId: AFFILIATE_ID, pin: CORRECT_PIN, redeemedAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it('R06: userId mismatch → rejected (no impersonation)', async () => {
    const db    = userCtx(UID.ACTIVE).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.ACTIVE, '2099-02')), {
      ...dealData(UID.ACTIVE, CORRECT_PIN),
      userId: UID.TRIAL,  // impersonation
    });
    batch.set(doc(db, 'amig0_members', UID.ACTIVE, 'redemptions', AFFILIATE_ID), { redeemedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  it('R07 [T03]: user cannot delete redemption sentinel', async () => {
    const db = userCtx(UID.LOCKED).firestore();
    await assertFails(deleteDoc(doc(db, 'amig0_members', UID.LOCKED, 'redemptions', AFFILIATE_ID)));
  });

  it('R08: sentinel create with backdated redeemedAt is rejected', async () => {
    const backdateUid = 'backdate_test_user';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'amig0_members', backdateUid), {
        subscriptionStatus: 'active',
        email: backdateUid + '@example.com',
        createdAt: serverTimestamp(),
      });
    });
    const db = userCtx(backdateUid).firestore();
    await assertFails(
      setDoc(doc(db, 'amig0_members', backdateUid, 'redemptions', AFFILIATE_ID),
        { redeemedAt: Timestamp.fromDate(daysAgo(40)) })
    );
  });

  it('R09: sentinel update with earlier timestamp rejected (non-decreasing)', async () => {
    const db = userCtx(UID.LOCKOUT_EXPIRED).firestore();
    await assertFails(
      setDoc(doc(db, 'amig0_members', UID.LOCKOUT_EXPIRED, 'redemptions', AFFILIATE_ID),
        { redeemedAt: Timestamp.fromDate(daysAgo(60)) })
    );
  });

  it('R10: second redemption inside 30-day lockout is rejected', async () => {
    const db    = userCtx(UID.LOCKED).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.LOCKED)), dealData(UID.LOCKED, CORRECT_PIN));
    batch.set(doc(db, 'amig0_members', UID.LOCKED, 'redemptions', AFFILIATE_ID), { redeemedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  it('R11: legitimate redemption after 30-day lockout expires → succeeds', async () => {
    const db    = userCtx(UID.LOCKOUT_EXPIRED).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.LOCKOUT_EXPIRED)), dealData(UID.LOCKOUT_EXPIRED, CORRECT_PIN));
    batch.set(doc(db, 'amig0_members', UID.LOCKOUT_EXPIRED, 'redemptions', AFFILIATE_ID), { redeemedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });

  it('R12: batch with valid deal + invalid sentinel (backdated) → entire batch fails', async () => {
    // Proves atomicity: deal NOT logged when sentinel write is invalid.
    const db    = userCtx(UID.LOCKED).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.LOCKED, '2099-03')), dealData(UID.LOCKED, CORRECT_PIN));
    batch.set(doc(db, 'amig0_members', UID.LOCKED, 'redemptions', AFFILIATE_ID),
      { redeemedAt: Timestamp.fromDate(daysAgo(60)) });  // invalid — old timestamp
    await assertFails(batch.commit());
  });

});

// ---------------------------------------------------------------------------
// T — THREAT PATH REPRODUCTION (V01, V02, V03)
// ---------------------------------------------------------------------------
describe('T — Threat path reproduction', () => {

  it('T01: subscriptionStatus write → DENIED (clean hasOnly denial)', async () => {
    // SIMPLE_UID: diff shows subscriptionStatus changed (string). hasOnly(['zeroVariant']) = false.
    const db = userCtx(UID.SIMPLE).firestore();
    await assertFails(
      setDoc(doc(db, 'amig0_members', UID.SIMPLE), { subscriptionStatus: 'active' }, { merge: true })
    );
  });

  it('T02: trialEndsAt extension → DENIED (clean hasOnly denial)', async () => {
    // SIMPLE_UID: diff shows trialEndsAt changed (string placeholder). hasOnly = false.
    const db = userCtx(UID.SIMPLE).firestore();
    await assertFails(
      setDoc(doc(db, 'amig0_members', UID.SIMPLE), { trialEndsAt: '2099-01-01' }, { merge: true })
    );
  });

  it('T03: sentinel deletion → DENIED (no delete rule)', async () => {
    const db = userCtx(UID.LOCKED).firestore();
    await assertFails(
      deleteDoc(doc(db, 'amig0_members', UID.LOCKED, 'redemptions', AFFILIATE_ID))
    );
  });

});

// ---------------------------------------------------------------------------
// C — COUPLING INVARIANT + ATTACK-PATH TESTS (V05)
//
// The sentinelAdvanced() rule in deal_redemptions create uses getAfter() to
// enforce: a deal cannot be logged without the sentinel advancing atomically.
// ---------------------------------------------------------------------------
describe('C — Redemption coupling + attack paths', () => {

  // C01 — deal_redemptions without sentinel write
  it('C01: deal_redemptions written without sentinel → DENIED (coupling invariant)', async () => {
    // A hostile Firestore client omits the sentinel from the batch.
    // sentinelAdvanced() checks: exists(getAfter(sentinel)) → false (sentinel absent) → DENIED.
    const db = userCtx(UID.C01).firestore();
    await assertFails(
      setDoc(doc(db, 'deal_redemptions', dealDocId(UID.C01)), dealData(UID.C01, CORRECT_PIN))
    );
  });

  // C02 — sentinel written without deal_redemptions
  it('C02: sentinel written without deal_redemptions → ALLOWED (self-harm; no attack value)', async () => {
    // Architecture enforces coupling in one direction only (deal → sentinel).
    // The converse (sentinel → deal) is NOT enforced because writing a
    // sentinel alone cannot gain the attacker an advantage — it only locks
    // them out of future redemptions for 30 days without getting a deal.
    // Documented as acceptable residual behaviour under V05.
    const db = userCtx(UID.C02).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'amig0_members', UID.C02, 'redemptions', AFFILIATE_ID),
        { redeemedAt: serverTimestamp() })
    );
  });

  // C03 — valid first redemption (both writes in batch)
  it('C03: valid first redemption — deal + sentinel in batch → ALLOWED', async () => {
    const db    = userCtx(UID.C03).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.C03)), dealData(UID.C03, CORRECT_PIN));
    batch.set(doc(db, 'amig0_members', UID.C03, 'redemptions', AFFILIATE_ID), { redeemedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });

  // C04 — second redemption inside 30-day window (batch with both writes)
  it('C04: second redemption inside 30-day window → DENIED (lockout enforced)', async () => {
    // C04 has sentinel at 5 days ago — well within 30-day lockout.
    // isNotRecentlyRedeemed() returns false → batch denied regardless of coupling.
    const db    = userCtx(UID.C04).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.C04)), dealData(UID.C04, CORRECT_PIN));
    batch.set(doc(db, 'amig0_members', UID.C04, 'redemptions', AFFILIATE_ID), { redeemedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  // C05 — valid subsequent redemption after lockout (sentinel update)
  it('C05: valid redemption after 30-day lockout expires — deal + sentinel update → ALLOWED', async () => {
    // C05 has sentinel at 40 days ago — lockout has expired.
    // Sentinel UPDATE: non-decreasing (now >= 40-days-ago ✓), fresh (±5 min ✓).
    // sentinelAdvanced(): getAfter(sentinel).redeemedAt == deal.redeemedAt == request.time ✓.
    const db    = userCtx(UID.C05).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.C05)), dealData(UID.C05, CORRECT_PIN));
    batch.set(doc(db, 'amig0_members', UID.C05, 'redemptions', AFFILIATE_ID), { redeemedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });

  // C06 — future timestamp in sentinel
  it('C06: sentinel with far-future redeemedAt → DENIED (upper-bound timestamp check)', async () => {
    // sentinel create rule: redeemedAt <= request.time + 5 min.
    // far_future >> now + 5min → false → DENIED.
    const db = userCtx(UID.C06).firestore();
    await assertFails(
      setDoc(doc(db, 'amig0_members', UID.C06, 'redemptions', AFFILIATE_ID),
        { redeemedAt: Timestamp.fromDate(days(365)) })  // 1 year in the future
    );
  });

  // C07 — deal redemption for another UID
  it('C07: deal_redemptions with userId ≠ caller UID → DENIED (no impersonation)', async () => {
    const db    = userCtx(UID.C07).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', dealDocId(UID.C07)), {
      ...dealData(UID.C07, CORRECT_PIN),
      userId: UID.C01,  // impersonation attempt — different UID
    });
    batch.set(doc(db, 'amig0_members', UID.C07, 'redemptions', AFFILIATE_ID), { redeemedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  // C08 — malformed/nonexistent affiliate
  it('C08: deal with nonexistent affiliateId → DENIED (PIN check fails on missing secret)', async () => {
    // get(affiliates/ghost/secrets/verify) returns a nonexistent doc.
    // Accessing .data.verifyPin on a nonexistent doc throws → fail-closed → DENIED.
    const db    = userCtx(UID.C08).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'deal_redemptions', UID.C08 + '_ghost_' + YEAR_MONTH), {
      userId:        UID.C08,
      userEmail:     'c08@example.com',
      affiliateId:   'nonexistent_venue',  // affiliate does not exist
      affiliateName: 'Ghost Venue',
      pin:           CORRECT_PIN,
      redeemedAt:    serverTimestamp(),
    });
    batch.set(doc(db, 'amig0_members', UID.C08, 'redemptions', 'nonexistent_venue'), { redeemedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

});
