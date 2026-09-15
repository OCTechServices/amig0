/**
 * amig0 Firestore Security Rules — S02 Remediation Emulator Tests
 *
 * Run: firebase emulators:start --only firestore
 *      cd tests && npm test
 *
 * Covers:
 *   Membership (M01–M11): amig0_members/{uid} read/write/delete restrictions
 *   Redemption (R01–R12): deal_redemptions + sentinel create/update/delete
 *   Threat    (T01–T03):  explicit reproduction of former attack paths
 */

'use strict';

const { initializeTestEnvironment, assertFails, assertSucceeds } =
  require('@firebase/rules-unit-testing');
const {
  doc, collection, setDoc, getDoc, updateDoc, deleteDoc,
  writeBatch, serverTimestamp, Timestamp, FieldValue
} = require('firebase/firestore');
const { readFileSync } = require('fs');
const { resolve }      = require('path');
const assert           = require('assert');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PROJECT_ID   = 'amig0-rules-test';
const RULES_PATH   = resolve(__dirname, '../firestore.rules');
const AFFILIATE_ID = 'venue1';
const CORRECT_PIN  = '1234';
const WRONG_PIN    = '9999';
const YEAR_MONTH   = new Date().toISOString().slice(0, 7); // "2026-09"

// UIDs — each test scenario that writes deal_redemptions uses a unique UID
// to prevent doc-already-exists collisions between tests.
const UID = {
  ACTIVE:          'active_user',
  TRIAL:           'trial_user',
  EXPIRED:         'expired_user',
  LOCKED:          'locked_user',           // recent sentinel < 30 days
  LOCKOUT_EXPIRED: 'lockout_expired_user',  // old sentinel > 30 days
  OTHER:           'other_user',
  OPERATOR:        'operator_user',
  // Isolated UIDs for write tests (no sentinel on first call)
  REDEEM_ACTIVE:   'redeem_active',
  REDEEM_TRIAL:    'redeem_trial',
  REDEEM_ATOMICITY:'redeem_atomicity',
};

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------
const now         = new Date();
const days        = (n) => new Date(now.getTime() + n * 86400000);
const daysAgo     = (n) => days(-n);

let testEnv;

// ---------------------------------------------------------------------------
// Setup / teardown
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

  // Clear any state from a previous test run to guarantee clean fixtures.
  await testEnv.clearFirestore();

  // Write all fixture data with admin access (simulates server / Admin SDK writes).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // ── Member docs ──────────────────────────────────────────────────────────
    await setDoc(doc(db, 'amig0_members', UID.ACTIVE), {
      subscriptionStatus:  'active',
      trialStartedAt:      Timestamp.fromDate(daysAgo(40)),
      trialEndsAt:         Timestamp.fromDate(daysAgo(33)),
      stripeCustomerId:    'cus_test123',
      stripeSubscriptionId:'sub_test123',
      email:               'active@example.com',
      createdAt:           Timestamp.fromDate(daysAgo(40)),
      zeroVariant:         'amiga',
    });

    await setDoc(doc(db, 'amig0_members', UID.TRIAL), {
      subscriptionStatus: 'trial',
      trialStartedAt:     Timestamp.fromDate(daysAgo(3)),
      trialEndsAt:        Timestamp.fromDate(days(4)),  // 4 days remaining
      email:              'trial@example.com',
      createdAt:          Timestamp.fromDate(daysAgo(3)),
      zeroVariant:        'amiga',
    });

    await setDoc(doc(db, 'amig0_members', UID.EXPIRED), {
      subscriptionStatus: 'trial',
      trialStartedAt:     Timestamp.fromDate(daysAgo(10)),
      trialEndsAt:        Timestamp.fromDate(daysAgo(3)), // expired 3 days ago
      email:              'expired@example.com',
      createdAt:          Timestamp.fromDate(daysAgo(10)),
    });

    await setDoc(doc(db, 'amig0_members', UID.LOCKED), {
      subscriptionStatus: 'active',
      email:              'locked@example.com',
      createdAt:          Timestamp.fromDate(daysAgo(30)),
    });
    // Sentinel — recently redeemed (5 days ago, well within 30-day lockout)
    await setDoc(
      doc(db, 'amig0_members', UID.LOCKED, 'redemptions', AFFILIATE_ID),
      { redeemedAt: Timestamp.fromDate(daysAgo(5)) }
    );

    await setDoc(doc(db, 'amig0_members', UID.LOCKOUT_EXPIRED), {
      subscriptionStatus: 'active',
      email:              'lockout@example.com',
      createdAt:          Timestamp.fromDate(daysAgo(60)),
    });
    // Sentinel — old redemption (40 days ago, lockout has expired)
    await setDoc(
      doc(db, 'amig0_members', UID.LOCKOUT_EXPIRED, 'redemptions', AFFILIATE_ID),
      { redeemedAt: Timestamp.fromDate(daysAgo(40)) }
    );

    // Member docs for isolated redemption write tests
    for (const uid of [UID.REDEEM_ACTIVE, UID.REDEEM_TRIAL, UID.REDEEM_ATOMICITY]) {
      await setDoc(doc(db, 'amig0_members', uid), {
        subscriptionStatus: 'active',
        email:              uid + '@example.com',
        createdAt:          Timestamp.fromDate(daysAgo(10)),
      });
    }
    // REDEEM_ATOMICITY needs an existing recent sentinel to test the
    // "invalid sentinel in batch → entire batch fails" atomicity proof.
    await setDoc(
      doc(db, 'amig0_members', UID.REDEEM_ATOMICITY, 'redemptions', AFFILIATE_ID),
      { redeemedAt: Timestamp.fromDate(daysAgo(5)) } // within lockout
    );

    // ── Affiliate + secret ──────────────────────────────────────────────────
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
function operatorCtx() {
  return testEnv.authenticatedContext(UID.OPERATOR, { operator: true });
}
function unauthCtx() {
  return testEnv.unauthenticatedContext();
}

function redemptionDocId(uid, month) {
  return uid + '_' + AFFILIATE_ID + '_' + (month || YEAR_MONTH);
}

// ---------------------------------------------------------------------------
// M — MEMBERSHIP TESTS
// ---------------------------------------------------------------------------
describe('M — amig0_members', () => {

  // M01
  it('M01: unauthenticated read is rejected', async () => {
    const db = unauthCtx().firestore();
    await assertFails(getDoc(doc(db, 'amig0_members', UID.ACTIVE)));
  });

  // M02
  it('M02: authenticated user can read their own membership doc', async () => {
    const db = userCtx(UID.ACTIVE).firestore();
    await assertSucceeds(getDoc(doc(db, 'amig0_members', UID.ACTIVE)));
  });

  // M03
  it('M03: authenticated user cannot read another user\'s membership doc', async () => {
    const db = userCtx(UID.OTHER).firestore();
    await assertFails(getDoc(doc(db, 'amig0_members', UID.ACTIVE)));
  });

  // M04 — [T01] Entitlement bypass via subscriptionStatus write
  // Uses UID.TRIAL (status:'trial') so that writing 'active' is a real field change.
  it('M04 [T01]: user cannot set subscriptionStatus=\'active\' on their doc', async () => {
    const db = userCtx(UID.TRIAL).firestore();
    await assertFails(
      updateDoc(doc(db, 'amig0_members', UID.TRIAL), {
        subscriptionStatus: 'active',
      })
    );
  });

  // M05 — [T02] Trial extension via trialEndsAt write
  it('M05 [T02]: user cannot extend trialEndsAt', async () => {
    const db = userCtx(UID.ACTIVE).firestore();
    await assertFails(
      updateDoc(doc(db, 'amig0_members', UID.ACTIVE), {
        trialEndsAt: Timestamp.fromDate(days(365)),
      })
    );
  });

  // M06
  it('M06: user cannot reset trialStartedAt', async () => {
    const db = userCtx(UID.ACTIVE).firestore();
    await assertFails(
      updateDoc(doc(db, 'amig0_members', UID.ACTIVE), {
        trialStartedAt: Timestamp.fromDate(now),
      })
    );
  });

  // M07
  it('M07: user cannot modify stripeSubscriptionId', async () => {
    const db = userCtx(UID.ACTIVE).firestore();
    await assertFails(
      updateDoc(doc(db, 'amig0_members', UID.ACTIVE), {
        stripeSubscriptionId: 'sub_attacker',
      })
    );
  });

  // M08
  it('M08: user cannot delete their membership document', async () => {
    const db = userCtx(UID.ACTIVE).firestore();
    await assertFails(deleteDoc(doc(db, 'amig0_members', UID.ACTIVE)));
  });

  // M09
  it('M09: user can update zeroVariant (legitimate client profile write)', async () => {
    const db = userCtx(UID.ACTIVE).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'amig0_members', UID.ACTIVE), { zeroVariant: 'amigo' })
    );
  });

  // M10 — uses UID.TRIAL (status:'trial') so that the subscriptionStatus field
  // is a genuine change in the diff, proving the diff-check is field-aware.
  it('M10: update fails when zeroVariant change is bundled with an entitlement field', async () => {
    const db = userCtx(UID.TRIAL).firestore();
    await assertFails(
      updateDoc(doc(db, 'amig0_members', UID.TRIAL), {
        zeroVariant:        'amigo',
        subscriptionStatus: 'active',  // smuggled entitlement field — must be denied
      })
    );
  });

  // M11 — documents the trusted server path (Admin SDK bypasses rules)
  it('M11: trusted Admin SDK path can write entitlement fields (rules-disabled context)', async () => {
    // This test uses withSecurityRulesDisabled to simulate what api/stripe-webhook.py
    // and api/init-trial.py do via Firebase Admin SDK.
    // Firebase Admin SDK writes bypass all client Security Rules — this is
    // the correct trusted path for entitlement mutations.
    await assertSucceeds(
      testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'amig0_members', UID.ACTIVE), {
          subscriptionStatus: 'active',
        }, { merge: true });
      })
    );
  });

});

// ---------------------------------------------------------------------------
// R — REDEMPTION TESTS
// ---------------------------------------------------------------------------
describe('R — deal_redemptions + sentinel', () => {

  // R01 — valid active subscriber, correct PIN, first redemption
  it('R01: active subscriber + correct PIN → first redemption batch succeeds', async () => {
    const db    = userCtx(UID.REDEEM_ACTIVE).firestore();
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'deal_redemptions', redemptionDocId(UID.REDEEM_ACTIVE)),
      {
        userId:        UID.REDEEM_ACTIVE,
        userEmail:     'redeem_active@example.com',
        affiliateId:   AFFILIATE_ID,
        affiliateName: 'Test Venue',
        dealOffer:     '10% off',
        dealValue:     10,
        pin:           CORRECT_PIN,
        redeemedAt:    serverTimestamp(),
      }
    );
    batch.set(
      doc(db, 'amig0_members', UID.REDEEM_ACTIVE, 'redemptions', AFFILIATE_ID),
      { redeemedAt: serverTimestamp() }
    );
    await assertSucceeds(batch.commit());
  });

  // R02 — valid trial user, correct PIN
  it('R02: valid trial user + correct PIN → redemption succeeds', async () => {
    const db    = userCtx(UID.REDEEM_TRIAL).firestore();
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'deal_redemptions', redemptionDocId(UID.REDEEM_TRIAL)),
      {
        userId:        UID.REDEEM_TRIAL,
        userEmail:     'redeem_trial@example.com',
        affiliateId:   AFFILIATE_ID,
        affiliateName: 'Test Venue',
        dealOffer:     '10% off',
        dealValue:     10,
        pin:           CORRECT_PIN,
        redeemedAt:    serverTimestamp(),
      }
    );
    batch.set(
      doc(db, 'amig0_members', UID.REDEEM_TRIAL, 'redemptions', AFFILIATE_ID),
      { redeemedAt: serverTimestamp() }
    );
    await assertSucceeds(batch.commit());
  });

  // R03 — wrong PIN
  it('R03: wrong PIN → redemption batch rejected', async () => {
    const db    = userCtx(UID.ACTIVE).firestore();
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'deal_redemptions', redemptionDocId(UID.ACTIVE, '2099-01')),
      {
        userId:      UID.ACTIVE,
        affiliateId: AFFILIATE_ID,
        pin:         WRONG_PIN,
        redeemedAt:  serverTimestamp(),
      }
    );
    batch.set(
      doc(db, 'amig0_members', UID.ACTIVE, 'redemptions', AFFILIATE_ID),
      { redeemedAt: serverTimestamp() }
    );
    await assertFails(batch.commit());
  });

  // R04 — expired trial
  it('R04: expired trial user → redemption rejected (isMemberAllowed fails)', async () => {
    const db    = userCtx(UID.EXPIRED).firestore();
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'deal_redemptions', redemptionDocId(UID.EXPIRED)),
      {
        userId:      UID.EXPIRED,
        affiliateId: AFFILIATE_ID,
        pin:         CORRECT_PIN,
        redeemedAt:  serverTimestamp(),
      }
    );
    batch.set(
      doc(db, 'amig0_members', UID.EXPIRED, 'redemptions', AFFILIATE_ID),
      { redeemedAt: serverTimestamp() }
    );
    await assertFails(batch.commit());
  });

  // R05 — unauthenticated
  it('R05: unauthenticated request → redemption rejected', async () => {
    const db    = unauthCtx().firestore();
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'deal_redemptions', 'anon_' + AFFILIATE_ID + '_' + YEAR_MONTH),
      {
        userId:      'anon',
        affiliateId: AFFILIATE_ID,
        pin:         CORRECT_PIN,
        redeemedAt:  serverTimestamp(),
      }
    );
    await assertFails(batch.commit());
  });

  // R06 — userId mismatch (cannot redeem for another user)
  it('R06: userId mismatch → redemption rejected', async () => {
    const db    = userCtx(UID.ACTIVE).firestore();
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'deal_redemptions', redemptionDocId(UID.ACTIVE, '2099-02')),
      {
        userId:      UID.TRIAL,        // different UID — impersonation attempt
        affiliateId: AFFILIATE_ID,
        pin:         CORRECT_PIN,
        redeemedAt:  serverTimestamp(),
      }
    );
    batch.set(
      doc(db, 'amig0_members', UID.ACTIVE, 'redemptions', AFFILIATE_ID),
      { redeemedAt: serverTimestamp() }
    );
    await assertFails(batch.commit());
  });

  // R07 — [T03] user cannot delete sentinel
  it('R07 [T03]: user cannot delete redemption sentinel', async () => {
    const db = userCtx(UID.LOCKED).firestore();
    await assertFails(
      deleteDoc(doc(db, 'amig0_members', UID.LOCKED, 'redemptions', AFFILIATE_ID))
    );
  });

  // R08 — user cannot set an old (backdated) redeemedAt on sentinel
  it('R08: sentinel create with backdated redeemedAt is rejected', async () => {
    // Create sentinel for a fresh UID with a timestamp > 5 minutes old
    const freshUid = 'backdating_test_user';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'amig0_members', freshUid), {
        subscriptionStatus: 'active',
        email:              freshUid + '@example.com',
        createdAt:          serverTimestamp(),
      });
    });
    const db = userCtx(freshUid).firestore();
    await assertFails(
      setDoc(
        doc(db, 'amig0_members', freshUid, 'redemptions', AFFILIATE_ID),
        { redeemedAt: Timestamp.fromDate(daysAgo(40)) } // 40 days old — not fresh
      )
    );
  });

  // R09 — sentinel update cannot decrease redeemedAt (non-decreasing constraint)
  it('R09: sentinel update with earlier timestamp is rejected (non-decreasing)', async () => {
    // LOCKOUT_EXPIRED has sentinel at 40 days ago.
    // Attempt to overwrite with an even older date.
    const db = userCtx(UID.LOCKOUT_EXPIRED).firestore();
    await assertFails(
      setDoc(
        doc(db, 'amig0_members', UID.LOCKOUT_EXPIRED, 'redemptions', AFFILIATE_ID),
        { redeemedAt: Timestamp.fromDate(daysAgo(60)) } // older than existing 40d-ago
      )
    );
  });

  // R10 — inside 30-day lockout
  it('R10: second redemption inside 30-day lockout is rejected', async () => {
    // UID.LOCKED has sentinel at 5 days ago — well within lockout.
    const db    = userCtx(UID.LOCKED).firestore();
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'deal_redemptions', redemptionDocId(UID.LOCKED)),
      {
        userId:      UID.LOCKED,
        affiliateId: AFFILIATE_ID,
        pin:         CORRECT_PIN,
        redeemedAt:  serverTimestamp(),
      }
    );
    batch.set(
      doc(db, 'amig0_members', UID.LOCKED, 'redemptions', AFFILIATE_ID),
      { redeemedAt: serverTimestamp() }
    );
    await assertFails(batch.commit());
  });

  // R11 — after lockout expires
  it('R11: legitimate redemption after 30-day lockout expires → succeeds', async () => {
    // UID.LOCKOUT_EXPIRED has sentinel at 40 days ago — lockout has expired.
    const db    = userCtx(UID.LOCKOUT_EXPIRED).firestore();
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'deal_redemptions', redemptionDocId(UID.LOCKOUT_EXPIRED)),
      {
        userId:        UID.LOCKOUT_EXPIRED,
        userEmail:     'lockout@example.com',
        affiliateId:   AFFILIATE_ID,
        affiliateName: 'Test Venue',
        dealOffer:     '10% off',
        dealValue:     10,
        pin:           CORRECT_PIN,
        redeemedAt:    serverTimestamp(),
      }
    );
    batch.set(
      doc(db, 'amig0_members', UID.LOCKOUT_EXPIRED, 'redemptions', AFFILIATE_ID),
      { redeemedAt: serverTimestamp() }
    );
    await assertSucceeds(batch.commit());
  });

  // R12 — atomicity: batch with valid deal_redemptions + invalid sentinel → entire batch fails
  it('R12: batch with valid deal + invalid sentinel (backdated) → entire batch fails', async () => {
    // REDEEM_ATOMICITY has a sentinel at 5 days ago (within lockout).
    // Attempting a redemption batch where the deal write would pass PIN/membership
    // checks but the sentinel write has an invalid (old) timestamp.
    // Both writes should fail atomically — deal NOT logged.
    const db    = userCtx(UID.REDEEM_ATOMICITY).firestore();
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'deal_redemptions', redemptionDocId(UID.REDEEM_ATOMICITY, '2099-03')),
      {
        userId:      UID.REDEEM_ATOMICITY,
        affiliateId: AFFILIATE_ID,
        pin:         CORRECT_PIN,
        redeemedAt:  serverTimestamp(),
      }
    );
    batch.set(
      doc(db, 'amig0_members', UID.REDEEM_ATOMICITY, 'redemptions', AFFILIATE_ID),
      { redeemedAt: Timestamp.fromDate(daysAgo(60)) } // invalid — old timestamp
    );
    await assertFails(batch.commit());
  });

});

// ---------------------------------------------------------------------------
// T — THREAT REPRODUCTION TESTS
// (Explicitly prove former attack paths are blocked by new rules)
// ---------------------------------------------------------------------------
describe('T — Threat path reproduction', () => {

  // T01 — subscriptionStatus write bypass
  it('T01: attacker writes subscriptionStatus=\'active\' → DENIED', async () => {
    // Before remediation: a user could write subscriptionStatus:'active' to their
    // own amig0_members doc, bypassing the subscription gate.
    // After remediation: only zeroVariant is client-writable.
    const db = userCtx(UID.EXPIRED).firestore();
    await assertFails(
      setDoc(doc(db, 'amig0_members', UID.EXPIRED), {
        subscriptionStatus: 'active',
      }, { merge: true })
    );
  });

  // T02 — trial extension via trialEndsAt write
  it('T02: attacker extends trialEndsAt to perpetuate free access → DENIED', async () => {
    const db = userCtx(UID.EXPIRED).firestore();
    await assertFails(
      setDoc(doc(db, 'amig0_members', UID.EXPIRED), {
        trialEndsAt: Timestamp.fromDate(days(365)),
      }, { merge: true })
    );
  });

  // T03 — sentinel deletion to reset 30-day lockout
  it('T03: attacker deletes sentinel to reset lockout → DENIED', async () => {
    const db = userCtx(UID.LOCKED).firestore();
    await assertFails(
      deleteDoc(
        doc(db, 'amig0_members', UID.LOCKED, 'redemptions', AFFILIATE_ID)
      )
    );
  });

});
