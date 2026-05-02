// guide-auth.js — amig0-travel-company | OCTech Services
// Guide PWA: Firebase Auth + user_profiles role check
// Exposes: window.GuideAuth.guideId, window.GuideAuth.guideName, window.GuideAuth.tourId

(function () {
  'use strict';

  var auth = firebase.auth();
  var db   = firebase.firestore();

  // Apply branding from config
  if (window.AppConfig) {
    document.title = window.AppConfig.guideTitle || document.title;
  }

  window.GuideAuth = {
    guideId:   null,
    guideName: null,
    tourId:    null
  };

  var loginScreen = document.getElementById('guide-login');
  var guideShell  = document.getElementById('guide-shell');
  var loginForm   = document.getElementById('guide-login-form');
  var loginError  = document.getElementById('guide-login-error');
  var loginBtn    = document.getElementById('guide-login-btn');
  var signOutBtn  = document.getElementById('guide-sign-out');
  var tourNameEl  = document.getElementById('guide-tour-name');

  // ---------------------------------------------------------------------------
  // Auth state
  // ---------------------------------------------------------------------------
  auth.onAuthStateChanged(function (user) {
    if (!user) {
      showLogin();
      return;
    }

    db.collection('user_profiles').doc(user.uid).get()
      .then(function (doc) {
        if (!doc.exists) {
          showError('Your account is not set up. Please contact your operator.');
          auth.signOut();
          return;
        }

        var profile = doc.data();

        if (profile.role !== 'guide') {
          showError('This app is for tour guides only.');
          auth.signOut();
          return;
        }

        if (!profile.guideId) {
          showError('Your account is not linked to a guide record. Please contact your operator.');
          auth.signOut();
          return;
        }

        window.GuideAuth.guideId = profile.guideId;

        // Load guide record for name
        return db.collection('guides').doc(profile.guideId).get()
          .then(function (guideDoc) {
            var name = guideDoc.exists
              ? ([guideDoc.data().firstName, guideDoc.data().lastName].filter(Boolean).join(' ') || 'Guide')
              : 'Guide';
            window.GuideAuth.guideName = name;

            // Find guide's active or confirmed tour (guideId field on tour = guides doc ID)
            return db.collection('tours')
              .where('guideId', '==', profile.guideId)
              .get()
              .then(function (toursSnap) {
                // Prefer active, then confirmed, then first available
                var tours = toursSnap.docs.map(function (d) {
                  return { id: d.id, data: d.data() };
                });

                var active    = tours.filter(function (t) { return t.data.status === 'active'; });
                var confirmed = tours.filter(function (t) { return t.data.status === 'confirmed'; });
                var chosen    = active[0] || confirmed[0] || tours[0];

                if (!chosen) {
                  showError('No tour assigned to your account. Please contact your operator.');
                  auth.signOut();
                  return;
                }

                window.GuideAuth.tourId = chosen.id;
                tourNameEl.textContent  = chosen.data.name || '';

                showGuide();
              });
          });
      })
      .catch(function (err) {
        console.error('[guide-auth] profile load:', err.message);
        showError('Failed to load your account. Please try again.');
        auth.signOut();
      });
  });

  // ---------------------------------------------------------------------------
  // Login form
  // ---------------------------------------------------------------------------
  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();
    setLoading(true);

    var email    = document.getElementById('g-email').value.trim();
    var password = document.getElementById('g-password').value;

    auth.signInWithEmailAndPassword(email, password)
      .catch(function (err) {
        showError(friendlyError(err.code));
      })
      .finally(function () { setLoading(false); });
  });

  // ---------------------------------------------------------------------------
  // Sign out
  // ---------------------------------------------------------------------------
  signOutBtn.addEventListener('click', function () {
    window.GuideAuth.guideId   = null;
    window.GuideAuth.guideName = null;
    window.GuideAuth.tourId    = null;
    auth.signOut().catch(function (err) {
      console.error('[guide-auth] sign out:', err.message);
    });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function showLogin() {
    loginScreen.classList.remove('hidden');
    guideShell.classList.add('hidden');
  }

  function showGuide() {
    loginScreen.classList.add('hidden');
    guideShell.classList.remove('hidden');
    if (window.GuideNav) window.GuideNav.init();
  }

  function showError(msg) { loginError.textContent = msg; }
  function clearError()   { loginError.textContent = ''; }

  function setLoading(on) {
    loginBtn.disabled    = on;
    loginBtn.textContent = on ? 'Signing in…' : 'Sign In';
  }

  function friendlyError(code) {
    var map = {
      'auth/user-not-found':         'No account found with that email.',
      'auth/wrong-password':         'Incorrect password.',
      'auth/invalid-email':          'Please enter a valid email address.',
      'auth/invalid-credential':     'Email or password is incorrect.',
      'auth/too-many-requests':      'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Check your connection.'
    };
    return map[code] || 'Sign in failed. Please try again.';
  }

})();
