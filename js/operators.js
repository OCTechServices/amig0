// operators.js — amig0 | OCTech Services
// Operators module: manage Firebase Auth operator accounts
// Depends on: firebase-config.js, auth.js, nav.js
// Requires: Firebase Functions SDK (firebase-functions-compat.js)

(function () {
  'use strict';

  var db             = firebase.firestore();
  var col            = db.collection('operators');
  var fnAdd          = firebase.functions().httpsCallable('addOperator');
  var fnRemove       = firebase.functions().httpsCallable('removeOperator');
  var fnSetSuperAdmin = firebase.functions().httpsCallable('setSuperAdmin');

  window.Operators = { render: render };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',

        '<div class="module-header">',
          '<h3 class="module-title">Operators</h3>',
          '<button class="btn btn-primary" id="add-operator-btn">+ Add Operator</button>',
        '</div>',


        '<div class="card">',
          '<div id="operators-table-wrap"><p class="empty-state">Loading…</p></div>',
        '</div>',

      '</div>',
      buildModal(),
    ].join('');

    document.getElementById('add-operator-btn').addEventListener('click', function () {
      openModal();
    });
    document.getElementById('operator-modal-close').addEventListener('click', closeModal);
    document.getElementById('operator-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('operator-form').addEventListener('submit', handleSubmit);

    loadOperators();
  }

  // -------------------------------------------------------------------------
  // Load & render table
  // -------------------------------------------------------------------------
  function loadOperators() {
    var wrap = document.getElementById('operators-table-wrap');
    if (!wrap) return;

    col.orderBy('addedAt', 'asc').get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No operator records yet. Bootstrap your account first using the instructions above, then add it here.</p>';
          return;
        }

        var currentUser   = firebase.auth().currentUser;
        var currentUid    = currentUser && currentUser.uid;
        var isSuperAdmin  = false;

        // Check current user's superAdmin claim from token
        var tokenPromise = currentUser
          ? currentUser.getIdTokenResult().then(function (r) { isSuperAdmin = !!r.claims.superAdmin; })
          : Promise.resolve();

        tokenPromise.then(function () {
          var rows = snap.docs.map(function (doc) {
            var d     = doc.data();
            var self  = d.uid === currentUid;
            var added = d.addedAt ? formatDate(d.addedAt.toDate()) : '—';

            var actionCell;
            if (self) {
              actionCell = '<span class="badge badge-neutral">You</span>';
            } else if (d.superAdmin) {
              actionCell = '<span class="badge badge-info">Super Admin</span>';
            } else if (isSuperAdmin) {
              actionCell = '<button class="btn-table-action btn-table-danger" data-action="remove" data-id="' + esc(d.uid) + '">Remove</button>';
            } else {
              actionCell = '—';
            }

            return [
              '<tr>',
                '<td class="td-primary">',
                  esc(d.name || '—'),
                  d.superAdmin ? ' <span class="badge badge-info" style="margin-left:var(--space-2)">Super Admin</span>' : '',
                '</td>',
                '<td>' + esc(d.email || '—') + '</td>',
                '<td><code style="font-size:0.75rem">' + esc(d.uid) + '</code></td>',
                '<td>' + added + '</td>',
                '<td class="td-actions">' + actionCell + '</td>',
              '</tr>'
            ].join('');
          });

          wrap.innerHTML = [
            '<table class="data-table">',
              '<thead><tr>',
                '<th>Name</th><th>Email</th><th>UID</th><th>Added</th><th></th>',
              '</tr></thead>',
              '<tbody>' + rows.join('') + '</tbody>',
            '</table>'
          ].join('');

          wrap.querySelectorAll('[data-action="remove"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              confirmRemove(btn.getAttribute('data-id'), btn.closest('tr'));
            });
          });
        });
      })
      .catch(function (err) {
        console.error('[operators] load:', err.message);
        var wrap2 = document.getElementById('operators-table-wrap');
        if (wrap2) {
          wrap2.innerHTML = '<p class="error-state">Access denied or failed to load. Ensure your account has the operator custom claim and you have signed out and back in after it was set.</p>';
        }
      });
  }

  // -------------------------------------------------------------------------
  // Modal
  // -------------------------------------------------------------------------
  function openModal() {
    var form = document.getElementById('operator-form');
    form.reset();
    clearFormError();
    document.getElementById('operator-modal-overlay').classList.remove('hidden');
    form.elements['uid'].focus();
  }

  function closeModal() {
    document.getElementById('operator-modal-overlay').classList.add('hidden');
  }

  // -------------------------------------------------------------------------
  // Add operator
  // -------------------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    clearFormError();

    var form    = e.target;
    var saveBtn = document.getElementById('operator-save-btn');
    var uid     = form.elements['uid'].value.trim();
    var name    = form.elements['name'].value.trim();
    var email   = form.elements['email'].value.trim();

    if (!uid) {
      showFormError('Firebase Auth UID is required.');
      return;
    }

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Adding…';

    fnAdd({ uid: uid, name: name, email: email })
      .then(function () {
        closeModal();
        loadOperators();
      })
      .catch(function (err) {
        console.error('[operators] add:', err.message);
        showFormError(err.message || 'Failed to add operator. Check the UID and try again.');
      })
      .finally(function () {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Add Operator';
      });
  }

  // -------------------------------------------------------------------------
  // Remove operator
  // -------------------------------------------------------------------------
  function confirmRemove(uid, row) {
    if (!confirm('Remove operator access for this user? They will lose CRM access on their next sign-in.')) return;

    fnRemove({ uid: uid })
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#operators-table-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadOperators();
      })
      .catch(function (err) {
        console.error('[operators] remove:', err.message);
        alert(err.message || 'Failed to remove operator. Please try again.');
      });
  }

  // -------------------------------------------------------------------------
  // Modal HTML
  // -------------------------------------------------------------------------
  function buildModal() {
    return [
      '<div id="operator-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal">',
          '<div class="modal-header">',
            '<h3 id="operator-modal-title" class="modal-title">Add Operator</h3>',
            '<button id="operator-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="operator-form" class="modal-form" novalidate>',
            '<div class="field">',
              '<label for="operator-uid">Firebase Auth UID <span class="required">*</span></label>',
              '<input type="text" id="operator-uid" name="uid" placeholder="Paste from Firebase Console → Authentication → Users" autocomplete="off" spellcheck="false">',
            '</div>',
            '<div class="form-grid">',
              '<div class="field">',
                '<label for="operator-name">Name</label>',
                '<input type="text" id="operator-name" name="name" placeholder="Full name" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="operator-email">Email</label>',
                '<input type="email" id="operator-email" name="email" placeholder="operator@example.com" autocomplete="off">',
              '</div>',
            '</div>',
            '<p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin-top:var(--space-2)">',
              'The user must already have a Firebase Auth account. After adding, they will need to sign out and back in for the change to take effect.',
            '</p>',
            '<p id="operator-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'operator-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="operator-save-btn">Add Operator</button>',
            '</div>',
          '</form>',
        '</div>',
      '</div>'
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function showFormError(msg) {
    var el = document.getElementById('operator-form-error');
    if (el) el.textContent = msg;
  }

  function clearFormError() {
    var el = document.getElementById('operator-form-error');
    if (el) el.textContent = '';
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
