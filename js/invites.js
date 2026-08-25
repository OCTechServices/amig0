// invites.js — amig0 | OCTech Services
// Invite management: generate, track, and revoke invite codes
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db  = firebase.firestore();
  var col = db.collection('invites');

  window.Invites = { render: render };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">Invite Codes</h3>',
          '<button class="btn btn-primary" id="gen-invite-btn">+ Generate Invite</button>',
        '</div>',
        '<div class="card">',
          '<p style="font-size:0.85rem;color:var(--color-text-muted);padding:var(--space-4) var(--space-5) 0">',
            'Invite codes grant access to the Marketplace tab in the client portal. Each code is single-use.',
          '</p>',
          '<div id="invites-table-wrap"><p class="empty-state">Loading…</p></div>',
        '</div>',
      '</div>',
      buildModal(),
    ].join('');

    document.getElementById('gen-invite-btn').addEventListener('click', function () { openModal(); });
    document.getElementById('invite-modal-close').addEventListener('click', closeModal);
    document.getElementById('invite-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('invite-form').addEventListener('submit', handleSubmit);

    loadInvites();
  }

  // ---------------------------------------------------------------------------
  // Load & render table
  // ---------------------------------------------------------------------------
  function loadInvites() {
    var wrap = document.getElementById('invites-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<p class="empty-state">Loading…</p>';

    col.orderBy('createdAt', 'desc').get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No invite codes yet. Generate your first to grant marketplace access.</p>';
          return;
        }

        var now = new Date();
        var rows = snap.docs.map(function (doc) {
          var d       = doc.data();
          var used    = !!d.usedByUid;
          var expired = d.expiresAt && d.expiresAt.toDate() < now;
          var status  = used ? 'used' : (expired ? 'expired' : 'active');
          var created = d.createdAt ? formatDate(d.createdAt.toDate()) : '—';
          var expires = d.expiresAt ? formatDate(d.expiresAt.toDate()) : 'Never';
          var usedBy  = used ? esc(d.usedByEmail || d.usedByUid || '—') : '—';

          return [
            '<tr>',
              '<td class="td-primary" style="font-family:monospace;letter-spacing:0.05em">' + esc(d.code || '—') +
                '<button class="btn-table-action" style="margin-left:var(--space-2)" data-action="copy" data-code="' + esc(d.code || '') + '">Copy</button>' +
              '</td>',
              '<td><span class="badge badge-info">Marketplace</span></td>',
              '<td>' + created + '</td>',
              '<td>' + expires + '</td>',
              '<td>' + usedBy + '</td>',
              '<td><span class="badge badge-' + inviteStatusClass(status) + '">' + status + '</span></td>',
              '<td class="td-actions">',
                !used
                  ? '<button class="btn-table-action btn-table-danger" data-action="delete" data-id="' + doc.id + '">Revoke</button>'
                  : '<span style="font-size:0.8rem;color:var(--color-text-muted)">Redeemed</span>',
              '</td>',
            '</tr>'
          ].join('');
        });

        wrap.innerHTML = [
          '<table class="data-table">',
            '<thead><tr>',
              '<th>Code</th><th>Access</th><th>Created</th><th>Expires</th><th>Used By</th><th>Status</th><th></th>',
            '</tr></thead>',
            '<tbody>' + rows.join('') + '</tbody>',
          '</table>'
        ].join('');

        wrap.querySelectorAll('[data-action]').forEach(function (btn) {
          var action = btn.getAttribute('data-action');
          if (action === 'copy') {
            btn.addEventListener('click', function () {
              var code = btn.getAttribute('data-code');
              navigator.clipboard.writeText(code).then(function () {
                btn.textContent = 'Copied!';
                setTimeout(function () { btn.textContent = 'Copy'; }, 2000);
              });
            });
          } else if (action === 'delete') {
            btn.addEventListener('click', function () {
              confirmRevoke(btn.getAttribute('data-id'), btn.closest('tr'));
            });
          }
        });
      })
      .catch(function (err) {
        console.error('[invites] load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load invites.</p>';
      });
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  function openModal() {
    var modal = document.getElementById('invite-modal-overlay');
    document.getElementById('invite-form').reset();
    document.getElementById('invite-preview-code').textContent = generateCode();
    document.getElementById('invite-form-error').textContent = '';
    modal.classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('invite-modal-overlay').classList.add('hidden');
  }

  function handleSubmit(e) {
    e.preventDefault();
    var form    = e.target;
    var saveBtn = document.getElementById('invite-save-btn');
    var code    = document.getElementById('invite-preview-code').textContent.trim();
    var expiresVal = form.elements['expiresAt'].value;

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Generating…';

    var payload = {
      code:        code,
      accessLevel: 'marketplace',
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt:   expiresVal ? firebase.firestore.Timestamp.fromDate(new Date(expiresVal)) : null,
      usedByUid:   null,
      usedByEmail: null,
      usedAt:      null,
      notes:       form.elements['notes'].value.trim()
    };

    col.add(payload)
      .then(function () {
        closeModal();
        loadInvites();
      })
      .catch(function (err) {
        console.error('[invites] save:', err.message);
        document.getElementById('invite-form-error').textContent = 'Failed to generate. Please try again.';
      })
      .finally(function () {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Generate Invite';
      });
  }

  // ---------------------------------------------------------------------------
  // Revoke
  // ---------------------------------------------------------------------------
  function confirmRevoke(id, row) {
    if (!confirm('Revoke this invite code? It will no longer work.')) return;
    col.doc(id).delete()
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#invites-table-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadInvites();
      })
      .catch(function (err) {
        console.error('[invites] revoke:', err.message);
        alert('Failed to revoke. Please try again.');
      });
  }

  // ---------------------------------------------------------------------------
  // Modal HTML
  // ---------------------------------------------------------------------------
  function buildModal() {
    return [
      '<div id="invite-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal" style="max-width:440px">',
          '<div class="modal-header">',
            '<h3 class="modal-title">Generate Invite Code</h3>',
            '<button id="invite-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="invite-form" class="modal-form" novalidate>',

            '<div style="text-align:center;margin-bottom:var(--space-6)">',
              '<p style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-text-muted);margin-bottom:var(--space-2)">Generated Code</p>',
              '<div id="invite-preview-code" style="font-family:monospace;font-size:1.6rem;font-weight:700;letter-spacing:0.15em;color:var(--color-primary);background:var(--color-bg);border:1.5px solid var(--color-border);border-radius:var(--radius-md);padding:var(--space-4) var(--space-6)"></div>',
              '<p style="font-size:0.78rem;color:var(--color-text-muted);margin-top:var(--space-2)">Access level: Marketplace</p>',
            '</div>',

            '<div class="form-grid">',
              '<div class="field field-full">',
                '<label>Expires (optional)</label>',
                '<input type="date" name="expiresAt">',
              '</div>',
              '<div class="field field-full">',
                '<label>Notes (internal)</label>',
                '<input type="text" name="notes" placeholder="e.g. For Sarah — World Cup group" autocomplete="off">',
              '</div>',
            '</div>',

            '<p id="invite-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'invite-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="invite-save-btn">Generate Invite</button>',
            '</div>',
          '</form>',
        '</div>',
      '</div>'
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function generateCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code  = '';
    for (var i = 0; i < 8; i++) {
      if (i === 4) code += '-';
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code; // format: XXXX-XXXX
  }

  function inviteStatusClass(status) {
    return { active: 'success', used: 'neutral', expired: 'warning' }[status] || 'neutral';
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
