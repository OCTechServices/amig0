// functions/index.js — amig0-travel-company | OCTech Services
// Cloud Functions: operator role management via Firebase Auth custom claims
//
// addOperator(uid, name, email)  — grants operator claim + creates operators/ record (superAdmin only)
// removeOperator(uid)            — revokes operator claim + deletes operators/ record (superAdmin only)
// setSuperAdmin(uid)             — grants superAdmin claim (superAdmin only)
// bootstrapSuperAdmin            — HTTP, one-time: elevates uid to superAdmin if none exist yet
//
// Deploy: firebase deploy --only functions

'use strict';

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
admin.initializeApp();

// ---------------------------------------------------------------------------
// addOperator
// ---------------------------------------------------------------------------
exports.addOperator = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth || !context.auth.token.superAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only super admins can add operators.'
      );
    }

    var uid   = (data.uid   || '').trim();
    var name  = (data.name  || '').trim();
    var email = (data.email || '').trim();

    if (!uid) {
      throw new functions.https.HttpsError('invalid-argument', 'uid is required.');
    }

    try {
      await admin.auth().getUser(uid);
    } catch (e) {
      throw new functions.https.HttpsError(
        'not-found',
        'No Firebase Auth user found with that UID. Verify in Firebase Console → Authentication → Users.'
      );
    }

    await admin.auth().setCustomUserClaims(uid, { operator: true });

    await admin.firestore().collection('operators').doc(uid).set({
      uid:     uid,
      name:    name,
      email:   email,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      addedBy: context.auth.uid
    });

    return { success: true };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('internal', err.message);
  }
});

// ---------------------------------------------------------------------------
// removeOperator
// ---------------------------------------------------------------------------
exports.removeOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.superAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only super admins can remove operators.'
    );
  }

  var uid = (data.uid || '').trim();

  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'uid is required.');
  }

  if (uid === context.auth.uid) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Cannot remove your own operator access.'
    );
  }

  // Prevent removing another superAdmin
  try {
    var targetUser = await admin.auth().getUser(uid);
    if (targetUser.customClaims && targetUser.customClaims.superAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Cannot remove a super admin account.'
      );
    }
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
  }

  await admin.auth().setCustomUserClaims(uid, { operator: false });
  await admin.firestore().collection('operators').doc(uid).delete();

  return { success: true };
});

// ---------------------------------------------------------------------------
// provisionClient — creates user_profiles/{uid} for client portal access
// ---------------------------------------------------------------------------
exports.provisionClient = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.operator) {
    throw new functions.https.HttpsError('permission-denied', 'Operators only.');
  }

  var uid      = (data.uid      || '').trim();
  var clientId = (data.clientId || '').trim();

  if (!uid || !clientId) {
    throw new functions.https.HttpsError('invalid-argument', 'uid and clientId are required.');
  }

  try {
    await admin.auth().getUser(uid);
  } catch (e) {
    throw new functions.https.HttpsError('not-found', 'No Firebase Auth user found with that UID.');
  }

  await admin.firestore().collection('user_profiles').doc(uid).set({
    role:      'client',
    clientId:  clientId,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true };
});

// ---------------------------------------------------------------------------
// provisionGuide — creates user_profiles/{uid} for guide app access
// ---------------------------------------------------------------------------
exports.provisionGuide = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.operator) {
    throw new functions.https.HttpsError('permission-denied', 'Operators only.');
  }

  var uid     = (data.uid     || '').trim();
  var guideId = (data.guideId || '').trim();

  if (!uid || !guideId) {
    throw new functions.https.HttpsError('invalid-argument', 'uid and guideId are required.');
  }

  try {
    await admin.auth().getUser(uid);
  } catch (e) {
    throw new functions.https.HttpsError('not-found', 'No Firebase Auth user found with that UID.');
  }

  await admin.firestore().collection('user_profiles').doc(uid).set({
    role:      'guide',
    guideId:   guideId,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true };
});

// ---------------------------------------------------------------------------
// setSuperAdmin — elevates an existing operator to superAdmin (superAdmin only)
// ---------------------------------------------------------------------------
exports.setSuperAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.superAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only super admins can grant super admin access.'
    );
  }

  var uid = (data.uid || '').trim();
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'uid is required.');
  }

  await admin.auth().setCustomUserClaims(uid, { operator: true, superAdmin: true });
  await admin.firestore().collection('operators').doc(uid).update({
    superAdmin: true,
    superAdminGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
    superAdminGrantedBy: context.auth.uid
  });

  return { success: true };
});

