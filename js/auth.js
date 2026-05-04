// auth.js — amig0-travel-company | OCTech Services
// Firebase Auth: state listener, login form, sign-out
// Depends on: firebase-config.js (firebase already initialised via compat SDK)

(function () {
  'use strict';

  const auth = firebase.auth();

  // Apply branding from config
  if (window.AppConfig) {
    document.title = window.AppConfig.crmTitle || document.title;
    var loginTitle = document.querySelector('.login-title');
    if (loginTitle) loginTitle.textContent = window.AppConfig.brandName;
  }

  // DOM refs
  const loginScreen = document.getElementById('login-screen');
  const appShell    = document.getElementById('app-shell');
  const loginForm   = document.getElementById('login-form');
  const loginError  = document.getElementById('login-error');
  const loginBtn    = document.getElementById('login-btn');
  const signOutBtn  = document.getElementById('sign-out-btn');
  const userEmailEl = document.getElementById('user-email');

  // -------------------------------------------------------------------------
  // Auth state — single source of truth for app visibility
  // -------------------------------------------------------------------------
  auth.onAuthStateChanged(function (user) {
    if (user) {
      loginScreen.classList.add('hidden');
      appShell.classList.remove('hidden');
      userEmailEl.textContent = user.email;
    } else {
      loginScreen.classList.remove('hidden');
      appShell.classList.add('hidden');
      userEmailEl.textContent = '';
    }
  });

  // -------------------------------------------------------------------------
  // Login form
  // -------------------------------------------------------------------------
  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();
    setLoading(true);

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    auth.signInWithEmailAndPassword(email, password)
      .catch(function (err) {
        showError(friendlyAuthError(err.code));
      })
      .finally(function () {
        setLoading(false);
      });
  });

  // -------------------------------------------------------------------------
  // Forgot password
  // -------------------------------------------------------------------------
  document.getElementById('forgot-btn').addEventListener('click', function () {
    clearError();
    var email = document.getElementById('email').value.trim();
    if (!email) {
      showError('Enter your email above, then click Forgot password.');
      return;
    }
    auth.sendPasswordResetEmail(email)
      .then(function () {
        showError('Reset link sent — check your email.');
      })
      .catch(function (err) {
        showError(friendlyAuthError(err.code));
      });
  });

  // -------------------------------------------------------------------------
  // Sign out
  // -------------------------------------------------------------------------
  signOutBtn.addEventListener('click', function () {
    auth.signOut().catch(function (err) {
      console.error('[auth] Sign out failed:', err.message);
    });
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function showError(message) {
    loginError.textContent = message;
  }

  function clearError() {
    loginError.textContent = '';
  }

  function setLoading(isLoading) {
    loginBtn.disabled = isLoading;
    loginBtn.textContent = isLoading ? 'Signing in…' : 'Sign In';
  }

  function friendlyAuthError(code) {
    var messages = {
      'auth/user-not-found':        'No account found with that email.',
      'auth/wrong-password':        'Incorrect password.',
      'auth/invalid-email':         'Please enter a valid email address.',
      'auth/invalid-credential':    'Email or password is incorrect.',
      'auth/too-many-requests':     'Too many attempts. Please try again later.',
      'auth/network-request-failed':'Network error. Check your connection.',
      'auth/user-disabled':         'This account has been disabled.',
    };
    return messages[code] || 'Sign in failed. Please try again.';
  }

})();
