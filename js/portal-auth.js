// portal-auth.js — amig0 | OCTech Services
// Client portal: Firebase Auth + user_profiles role check
// Exposes: window.PortalAuth.clientId, window.PortalAuth.clientName

(function () {
  'use strict';

  var auth = firebase.auth();
  var db   = firebase.firestore();

  // Apply branding from config
  if (window.AppConfig) {
    document.title = window.AppConfig.portalTitle || document.title;
  }

  window.PortalAuth = {
    clientId:   null,
    clientName: null
  };

  var loginScreen = document.getElementById('portal-login');
  var portalShell = document.getElementById('portal-shell');
  var loginForm   = document.getElementById('portal-login-form');
  var loginError  = document.getElementById('portal-login-error');
  var loginBtn    = document.getElementById('portal-login-btn');
  var signOutBtn  = document.getElementById('portal-sign-out');
  var greetingEl  = document.getElementById('portal-client-name');

  // -------------------------------------------------------------------------
  // Auth state
  // -------------------------------------------------------------------------
  auth.onAuthStateChanged(function (user) {
    if (!user) {
      showLogin();
      return;
    }

    // Load user_profiles to verify role
    db.collection('user_profiles').doc(user.uid).get()
      .then(function (doc) {
        if (!doc.exists) {
          showError('Your account is not set up. Please contact your tour operator.');
          auth.signOut();
          return;
        }

        var profile = doc.data();

        if (profile.role !== 'client') {
          showError('This portal is for clients only.');
          auth.signOut();
          return;
        }

        if (!profile.clientId) {
          showError('Your account is not linked to a client record. Please contact your tour operator.');
          auth.signOut();
          return;
        }

        // Load client name for greeting
        return db.collection('clients').doc(profile.clientId).get()
          .then(function (clientDoc) {
            var name = clientDoc.exists ? (clientDoc.data().name || 'Traveller') : 'Traveller';
            window.PortalAuth.clientId   = profile.clientId;
            window.PortalAuth.clientName = name;
            greetingEl.textContent       = 'Hello, ' + name.split(' ')[0];
            showPortal();
          });
      })
      .catch(function (err) {
        console.error('[portal-auth] profile load:', err.message);
        showError('Failed to load your account. Please try again.');
        auth.signOut();
      });
  });

  // -------------------------------------------------------------------------
  // Login form
  // -------------------------------------------------------------------------
  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();
    setLoading(true);

    var email    = document.getElementById('p-email').value.trim();
    var password = document.getElementById('p-password').value;

    auth.signInWithEmailAndPassword(email, password)
      .catch(function (err) {
        showError(friendlyError(err.code));
      })
      .finally(function () { setLoading(false); });
  });

  // -------------------------------------------------------------------------
  // Forgot password
  // -------------------------------------------------------------------------
  document.getElementById('portal-forgot-btn').addEventListener('click', function () {
    clearError();
    var email = document.getElementById('p-email').value.trim();
    if (!email) {
      showError('Enter your email above, then click Forgot password.');
      return;
    }
    auth.sendPasswordResetEmail(email)
      .then(function () {
        showError('Reset link sent — check your email.');
      })
      .catch(function (err) {
        showError(friendlyError(err.code));
      });
  });

  // -------------------------------------------------------------------------
  // Sign out
  // -------------------------------------------------------------------------
  signOutBtn.addEventListener('click', function () {
    window.PortalAuth.clientId   = null;
    window.PortalAuth.clientName = null;
    auth.signOut().catch(function (err) {
      console.error('[portal-auth] sign out:', err.message);
    });
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function showLogin() {
    loginScreen.classList.remove('hidden');
    portalShell.classList.add('hidden');
  }

  function showPortal() {
    loginScreen.classList.add('hidden');
    portalShell.classList.remove('hidden');
    if (window.PortalNav) window.PortalNav.init();
  }

  function showError(msg)  { loginError.textContent = msg; }
  function clearError()    { loginError.textContent = ''; }

  function setLoading(on) {
    loginBtn.disabled    = on;
    loginBtn.textContent = on ? 'Signing in…' : 'Sign In';
  }

  function friendlyError(code) {
    var map = {
      'auth/user-not-found':        'No account found with that email.',
      'auth/wrong-password':        'Incorrect password.',
      'auth/invalid-email':         'Please enter a valid email address.',
      'auth/invalid-credential':    'Email or password is incorrect.',
      'auth/too-many-requests':     'Too many attempts. Please try again later.',
      'auth/network-request-failed':'Network error. Check your connection.',
    };
    return map[code] || 'Sign in failed. Please try again.';
  }

})();
