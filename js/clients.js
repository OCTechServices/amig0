// clients.js — amig0-travel-company | OCTech Services
// Clients module: list, add, edit, delete
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db              = firebase.firestore();
  var col             = db.collection('clients');
  var fnProvision     = firebase.functions().httpsCallable('provisionClient');

  window.Clients = {
    render: render
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">All Clients</h3>',
          '<button class="btn btn-primary" id="add-client-btn">+ Add Client</button>',
        '</div>',
        '<div class="card">',
          '<div id="clients-table-wrap">',
            '<p class="empty-state">Loading…</p>',
          '</div>',
        '</div>',
      '</div>',
      buildModal(),
    ].join('');

    document.getElementById('add-client-btn').addEventListener('click', function () {
      openModal(null);
    });

    document.getElementById('client-modal-close').addEventListener('click', closeModal);
    document.getElementById('client-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('client-form').addEventListener('submit', handleSubmit);

    loadClients();
  }

  // -------------------------------------------------------------------------
  // Load & render table
  // -------------------------------------------------------------------------
  function loadClients() {
    var wrap = document.getElementById('clients-table-wrap');
    if (!wrap) return;

    col.orderBy('createdAt', 'desc').get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No clients yet. Add your first client to get started.</p>';
          return;
        }

        var rows = snap.docs.map(function (doc) {
          var d = doc.data();
          return [
            '<tr>',
              '<td class="td-primary">' + esc(d.name || '—') + '</td>',
              '<td>' + esc(d.email || '—') + '</td>',
              '<td>' + esc(d.phone || '—') + '</td>',
              '<td>' + esc(d.country || '—') + '</td>',
              '<td>',
                d.uid
                  ? '<button class="btn-table-action btn-table-pay" data-action="provision" data-id="' + doc.id + '" data-uid="' + esc(d.uid) + '">Grant Access</button>'
                  : '<span class="badge badge-neutral">Not linked</span>',
              '</td>',
              '<td class="td-actions">',
                '<button class="btn-table-action" data-action="edit" data-id="' + doc.id + '">Edit</button>',
                '<button class="btn-table-action btn-table-danger" data-action="delete" data-id="' + doc.id + '">Delete</button>',
              '</td>',
            '</tr>'
          ].join('');
        });

        wrap.innerHTML = [
          '<table class="data-table">',
            '<thead>',
              '<tr>',
                '<th>Name</th>',
                '<th>Email</th>',
                '<th>Phone</th>',
                '<th>Country</th>',
                '<th>Portal Access</th>',
                '<th></th>',
              '</tr>',
            '</thead>',
            '<tbody>' + rows.join('') + '</tbody>',
          '</table>'
        ].join('');

        // Attach row action listeners
        wrap.querySelectorAll('[data-action]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            var action = btn.getAttribute('data-action');
            if (action === 'edit') {
              loadAndOpenEdit(id);
            } else if (action === 'provision') {
              provisionPortalAccess(id, btn.getAttribute('data-uid'), btn);
            } else if (action === 'delete') {
              confirmDelete(id, btn.closest('tr'));
            }
          });
        });
      })
      .catch(function (err) {
        console.error('[clients] load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load clients. Check your connection and try again.</p>';
      });
  }

  // -------------------------------------------------------------------------
  // Modal: open for add or edit
  // -------------------------------------------------------------------------
  function openModal(data) {
    var modal = document.getElementById('client-modal-overlay');
    var title = document.getElementById('client-modal-title');
    var form  = document.getElementById('client-form');

    title.textContent = data ? 'Edit Client' : 'Add Client';
    form.reset();
    clearFormError();

    if (data) {
      form.elements['name'].value    = data.name    || '';
      form.elements['email'].value   = data.email   || '';
      form.elements['phone'].value   = data.phone   || '';
      form.elements['country'].value = data.country || '';
      form.elements['uid'].value     = data.uid     || '';
      form.elements['notes'].value   = data.notes   || '';
      form.dataset.editId = data._id;
    } else {
      delete form.dataset.editId;
    }

    modal.classList.remove('hidden');
    form.elements['name'].focus();
  }

  function closeModal() {
    document.getElementById('client-modal-overlay').classList.add('hidden');
  }

  function loadAndOpenEdit(id) {
    col.doc(id).get()
      .then(function (doc) {
        if (!doc.exists) return;
        var data = doc.data();
        data._id = doc.id;
        openModal(data);
      })
      .catch(function (err) {
        console.error('[clients] load for edit:', err.message);
      });
  }

  // -------------------------------------------------------------------------
  // Form submit: add or update
  // -------------------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    clearFormError();

    var form    = e.target;
    var editId  = form.dataset.editId;
    var saveBtn = document.getElementById('client-save-btn');

    var payload = {
      name:    form.elements['name'].value.trim(),
      email:   form.elements['email'].value.trim(),
      phone:   form.elements['phone'].value.trim(),
      country: form.elements['country'].value.trim(),
      uid:     form.elements['uid'].value.trim() || null,
      notes:   form.elements['notes'].value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!payload.name) {
      showFormError('Name is required.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    var op;
    if (editId) {
      op = col.doc(editId).update(payload);
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      op = col.add(payload);
    }

    op.then(function () {
      closeModal();
      loadClients();
    })
    .catch(function (err) {
      console.error('[clients] save:', err.message);
      showFormError('Failed to save. Please try again.');
    })
    .finally(function () {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Client';
    });
  }

  // -------------------------------------------------------------------------
  // Portal provisioning
  // -------------------------------------------------------------------------
  function provisionPortalAccess(clientId, uid, btn) {
    if (!uid) return;
    var original = btn.textContent;
    btn.disabled    = true;
    btn.textContent = 'Granting…';

    fnProvision({ clientId: clientId, uid: uid })
      .then(function () {
        btn.outerHTML = '<span class="badge badge-success">Active</span>';
      })
      .catch(function (err) {
        console.error('[clients] provision:', err.message);
        alert(err.message || 'Failed to grant access. Check the UID and try again.');
        btn.disabled    = false;
        btn.textContent = original;
      });
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  function confirmDelete(id, row) {
    if (!confirm('Delete this client? This cannot be undone.')) return;

    col.doc(id).delete()
      .then(function () {
        if (row) row.remove();
        // If table is now empty, reload to show empty state
        var tbody = document.querySelector('.data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadClients();
      })
      .catch(function (err) {
        console.error('[clients] delete:', err.message);
        alert('Failed to delete client. Please try again.');
      });
  }

  // -------------------------------------------------------------------------
  // Modal HTML
  // -------------------------------------------------------------------------
  function buildModal() {
    return [
      '<div id="client-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal">',
          '<div class="modal-header">',
            '<h3 id="client-modal-title" class="modal-title">Add Client</h3>',
            '<button id="client-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="client-form" class="modal-form" novalidate>',
            '<div class="form-grid">',
              '<div class="field">',
                '<label for="client-name">Name <span class="required">*</span></label>',
                '<input type="text" id="client-name" name="name" placeholder="Full name or company" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="client-email">Email</label>',
                '<input type="email" id="client-email" name="email" placeholder="email@example.com" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="client-phone">Phone</label>',
                '<input type="tel" id="client-phone" name="phone" placeholder="+1 555 000 0000" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="client-country">Country</label>',
                '<input type="text" id="client-country" name="country" placeholder="e.g. United States" autocomplete="off">',
              '</div>',
            '</div>',
            '<div class="field">',
              '<label for="client-uid">Firebase Auth UID <span class="field-hint">— paste from Firebase Console → Authentication → Users</span></label>',
              '<input type="text" id="client-uid" name="uid" placeholder="e.g. abc123XYZ…" autocomplete="off" spellcheck="false">',
            '</div>',
            '<div class="field">',
              '<label for="client-notes">Notes</label>',
              '<textarea id="client-notes" name="notes" placeholder="Internal notes…" rows="3"></textarea>',
            '</div>',
            '<p id="client-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" id="client-cancel-btn" onclick="document.getElementById(\'client-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="client-save-btn">Save Client</button>',
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
    var el = document.getElementById('client-form-error');
    if (el) el.textContent = msg;
  }

  function clearFormError() {
    var el = document.getElementById('client-form-error');
    if (el) el.textContent = '';
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
