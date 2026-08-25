// passengers.js — amig0 | OCTech Services
// Passengers module: list, add, edit, delete
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db     = firebase.firestore();
  var col    = db.collection('passengers');
  var clients = {};  // id → name cache

  window.Passengers = {
    render: render
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">All ' + cfg('passengers') + '</h3>',
          '<button class="btn btn-primary" id="add-passenger-btn">+ ' + cfg('addPassenger') + '</button>',
        '</div>',
        '<div class="card">',
          '<div id="passengers-table-wrap">',
            '<p class="empty-state">Loading…</p>',
          '</div>',
        '</div>',
      '</div>',
      buildModal(),
    ].join('');

    document.getElementById('add-passenger-btn').addEventListener('click', function () {
      openModal(null);
    });
    document.getElementById('passenger-modal-close').addEventListener('click', closeModal);
    document.getElementById('passenger-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('passenger-form').addEventListener('submit', handleSubmit);

    // Load clients cache then render table
    loadClientsCache().then(loadPassengers);
  }

  // -------------------------------------------------------------------------
  // Load clients into cache for name lookups and dropdowns
  // -------------------------------------------------------------------------
  function loadClientsCache() {
    return db.collection('clients').orderBy('name').get()
      .then(function (snap) {
        clients = {};
        snap.forEach(function (doc) {
          clients[doc.id] = doc.data().name || 'Unnamed';
        });
        populateClientDropdown();
      })
      .catch(function (err) {
        console.error('[passengers] clients cache:', err.message);
      });
  }

  function populateClientDropdown() {
    var sel = document.getElementById('passenger-client');
    if (!sel) return;
    var options = '<option value="">— No client —</option>';
    Object.keys(clients).forEach(function (id) {
      options += '<option value="' + id + '">' + esc(clients[id]) + '</option>';
    });
    sel.innerHTML = options;
  }

  // -------------------------------------------------------------------------
  // Load & render table
  // -------------------------------------------------------------------------
  function loadPassengers() {
    var wrap = document.getElementById('passengers-table-wrap');
    if (!wrap) return;

    col.orderBy('createdAt', 'desc').get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No ' + cfg('passengers').toLowerCase() + ' yet. Add your first ' + cfg('passenger').toLowerCase() + ' to get started.</p>';
          return;
        }

        var rows = snap.docs.map(function (doc) {
          var d         = doc.data();
          var fullName  = [d.firstName, d.lastName].filter(Boolean).join(' ') || '—';
          var clientName = d.clientId ? (clients[d.clientId] || '—') : '—';
          var dob       = d.dob ? formatDate(d.dob.toDate()) : '—';

          return [
            '<tr>',
              '<td class="td-primary">' + esc(fullName) + '</td>',
              '<td>' + esc(d.email || '—') + '</td>',
              '<td>' + esc(d.nationality || '—') + '</td>',
              '<td>' + dob + '</td>',
              '<td>' + esc(clientName) + '</td>',
              '<td class="td-actions">',
                '<button class="btn-table-action" data-action="edit" data-id="' + doc.id + '">Edit</button>',
                '<button class="btn-table-action btn-table-danger" data-action="delete" data-id="' + doc.id + '">Delete</button>',
              '</td>',
            '</tr>'
          ].join('');
        });

        wrap.innerHTML = [
          '<table class="data-table">',
            '<thead><tr>',
              '<th>Name</th>',
              '<th>Email</th>',
              '<th>Nationality</th>',
              '<th>Date of Birth</th>',
              '<th>Client</th>',
              '<th></th>',
            '</tr></thead>',
            '<tbody>' + rows.join('') + '</tbody>',
          '</table>'
        ].join('');

        wrap.querySelectorAll('[data-action]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id     = btn.getAttribute('data-id');
            var action = btn.getAttribute('data-action');
            if (action === 'edit') {
              loadAndOpenEdit(id);
            } else if (action === 'delete') {
              confirmDelete(id, btn.closest('tr'));
            }
          });
        });
      })
      .catch(function (err) {
        console.error('[passengers] load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load passengers. Check your connection and try again.</p>';
      });
  }

  // -------------------------------------------------------------------------
  // Modal
  // -------------------------------------------------------------------------
  function openModal(data) {
    var modal = document.getElementById('passenger-modal-overlay');
    var title = document.getElementById('passenger-modal-title');
    var form  = document.getElementById('passenger-form');

    title.textContent = data ? 'Edit ' + cfg('passenger') : 'Add ' + cfg('passenger');
    form.reset();
    clearFormError();
    populateClientDropdown();

    if (data) {
      form.elements['firstName'].value            = data.firstName            || '';
      form.elements['lastName'].value             = data.lastName             || '';
      form.elements['email'].value                = data.email                || '';
      form.elements['phone'].value                = data.phone                || '';
      form.elements['passport'].value             = data.passport             || '';
      form.elements['nationality'].value          = data.nationality          || '';
      form.elements['dietaryRequirements'].value  = data.dietaryRequirements  || '';
      form.elements['medicalNotes'].value         = data.medicalNotes         || '';
      form.elements['clientId'].value             = data.clientId             || '';
      if (data.dob) {
        form.elements['dob'].value = toDateInput(data.dob.toDate());
      }
      form.dataset.editId = data._id;
    } else {
      delete form.dataset.editId;
    }

    modal.classList.remove('hidden');
    form.elements['firstName'].focus();
  }

  function closeModal() {
    document.getElementById('passenger-modal-overlay').classList.add('hidden');
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
        console.error('[passengers] load for edit:', err.message);
      });
  }

  // -------------------------------------------------------------------------
  // Form submit
  // -------------------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    clearFormError();

    var form    = e.target;
    var editId  = form.dataset.editId;
    var saveBtn = document.getElementById('passenger-save-btn');

    if (!form.elements['firstName'].value.trim()) {
      showFormError('First name is required.');
      return;
    }

    var dobVal = form.elements['dob'].value;

    var payload = {
      firstName:           form.elements['firstName'].value.trim(),
      lastName:            form.elements['lastName'].value.trim(),
      email:               form.elements['email'].value.trim(),
      phone:               form.elements['phone'].value.trim(),
      passport:            form.elements['passport'].value.trim(),
      nationality:         form.elements['nationality'].value.trim(),
      dietaryRequirements: form.elements['dietaryRequirements'].value.trim(),
      medicalNotes:        form.elements['medicalNotes'].value.trim(),
      clientId:            form.elements['clientId'].value || null,
      dob:                 dobVal ? firebase.firestore.Timestamp.fromDate(new Date(dobVal)) : null,
      updatedAt:           firebase.firestore.FieldValue.serverTimestamp()
    };

    saveBtn.disabled    = true;
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
      loadPassengers();
    })
    .catch(function (err) {
      console.error('[passengers] save:', err.message);
      showFormError('Failed to save. Please try again.');
    })
    .finally(function () {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save ' + cfg('passenger');
    });
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  function confirmDelete(id, row) {
    if (!confirm('Delete this ' + cfg('passenger').toLowerCase() + '? This cannot be undone.')) return;

    col.doc(id).delete()
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#passengers-table-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadPassengers();
      })
      .catch(function (err) {
        console.error('[passengers] delete:', err.message);
        alert('Failed to delete passenger. Please try again.');
      });
  }

  // -------------------------------------------------------------------------
  // Modal HTML
  // -------------------------------------------------------------------------
  function buildModal() {
    return [
      '<div id="passenger-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-lg">',
          '<div class="modal-header">',
            '<h3 id="passenger-modal-title" class="modal-title">Add ' + cfg('passenger') + '</h3>',
            '<button id="passenger-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="passenger-form" class="modal-form" novalidate>',

            '<div class="form-section-label">Personal Details</div>',
            '<div class="form-grid">',
              '<div class="field">',
                '<label for="p-first">First Name <span class="required">*</span></label>',
                '<input type="text" id="p-first" name="firstName" placeholder="First name" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="p-last">Last Name</label>',
                '<input type="text" id="p-last" name="lastName" placeholder="Last name" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="p-email">Email</label>',
                '<input type="email" id="p-email" name="email" placeholder="email@example.com" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="p-phone">Phone</label>',
                '<input type="tel" id="p-phone" name="phone" placeholder="+1 555 000 0000" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="p-dob">Date of Birth</label>',
                '<input type="date" id="p-dob" name="dob">',
              '</div>',
              '<div class="field">',
                '<label for="p-nationality">Nationality</label>',
                '<input type="text" id="p-nationality" name="nationality" placeholder="e.g. British" autocomplete="off">',
              '</div>',
            '</div>',

            '<div class="form-section-label">Travel Documents</div>',
            '<div class="form-grid">',
              '<div class="field">',
                '<label for="p-passport">Passport Number</label>',
                '<input type="text" id="p-passport" name="passport" placeholder="Passport number" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="p-client">Linked Client</label>',
                '<select id="passenger-client" name="clientId"><option value="">Loading…</option></select>',
              '</div>',
            '</div>',

            '<div class="form-section-label">Health & Dietary</div>',
            '<div class="form-grid">',
              '<div class="field field-full">',
                '<label for="p-dietary">Dietary Requirements</label>',
                '<input type="text" id="p-dietary" name="dietaryRequirements" placeholder="e.g. Vegetarian, Gluten-free" autocomplete="off">',
              '</div>',
              '<div class="field field-full">',
                '<label for="p-medical">Medical Notes</label>',
                '<textarea id="p-medical" name="medicalNotes" placeholder="Any relevant medical information…" rows="2"></textarea>',
              '</div>',
            '</div>',

            '<p id="passenger-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'passenger-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="passenger-save-btn">Save ' + cfg('passenger') + '</button>',
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
    var el = document.getElementById('passenger-form-error');
    if (el) el.textContent = msg;
  }

  function clearFormError() {
    var el = document.getElementById('passenger-form-error');
    if (el) el.textContent = '';
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function toDateInput(date) {
    return date.toISOString().split('T')[0];
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
