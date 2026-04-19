// providers.js — amig0-travel-company | OCTech Services
// Providers module: accommodation, transport, activity, restaurant vendors
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db  = firebase.firestore();
  var col = db.collection('providers');

  var TYPES = ['accommodation', 'transport', 'activity', 'restaurant', 'other'];

  window.Providers = {
    render: render
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">Providers</h3>',
          '<button class="btn btn-primary" id="add-provider-btn">+ Add Provider</button>',
        '</div>',
        '<div class="providers-filter">',
          '<button class="filter-btn active" data-type="all">All</button>',
          TYPES.map(function (t) {
            return '<button class="filter-btn" data-type="' + t + '">' + capitalise(t) + '</button>';
          }).join(''),
        '</div>',
        '<div class="card">',
          '<div id="providers-table-wrap"><p class="empty-state">Loading…</p></div>',
        '</div>',
      '</div>',
      buildModal(),
    ].join('');

    document.getElementById('add-provider-btn').addEventListener('click', function () { openModal(null); });
    document.getElementById('provider-modal-close').addEventListener('click', closeModal);
    document.getElementById('provider-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('provider-form').addEventListener('submit', handleSubmit);

    // Filter buttons
    container.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        loadProviders(btn.getAttribute('data-type'));
      });
    });

    loadProviders('all');
  }

  // -------------------------------------------------------------------------
  // Load & render table
  // -------------------------------------------------------------------------
  function loadProviders(typeFilter) {
    var wrap = document.getElementById('providers-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<p class="empty-state">Loading…</p>';

    var query = typeFilter && typeFilter !== 'all'
      ? col.where('type', '==', typeFilter).orderBy('name')
      : col.orderBy('name');

    query.get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No providers' +
            (typeFilter && typeFilter !== 'all' ? ' of type "' + typeFilter + '"' : '') + '.</p>';
          return;
        }

        var rows = snap.docs.map(function (doc) {
          var d = doc.data();
          return [
            '<tr>',
              '<td class="td-primary">' + esc(d.name || '—') + '</td>',
              '<td><span class="badge badge-' + typeClass(d.type) + '">' + esc(d.type || '—') + '</span></td>',
              '<td>' + esc(d.contact || '—') + '</td>',
              '<td>' + esc(d.email || '—') + '</td>',
              '<td>' + esc(d.phone || '—') + '</td>',
              '<td>' + esc(d.country || '—') + '</td>',
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
              '<th>Name</th><th>Type</th><th>Contact</th><th>Email</th><th>Phone</th><th>Country</th><th></th>',
            '</tr></thead>',
            '<tbody>' + rows.join('') + '</tbody>',
          '</table>'
        ].join('');

        wrap.querySelectorAll('[data-action]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            if (btn.getAttribute('data-action') === 'edit') {
              loadAndOpenEdit(id);
            } else {
              confirmDelete(id, btn.closest('tr'));
            }
          });
        });
      })
      .catch(function (err) {
        console.error('[providers] load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load providers.</p>';
      });
  }

  // -------------------------------------------------------------------------
  // Modal
  // -------------------------------------------------------------------------
  function openModal(data) {
    var modal = document.getElementById('provider-modal-overlay');
    var title = document.getElementById('provider-modal-title');
    var form  = document.getElementById('provider-form');

    title.textContent = data ? 'Edit Provider' : 'Add Provider';
    form.reset();
    clearFormError();

    if (data) {
      form.elements['name'].value    = data.name    || '';
      form.elements['type'].value    = data.type    || 'accommodation';
      form.elements['contact'].value = data.contact || '';
      form.elements['email'].value   = data.email   || '';
      form.elements['phone'].value   = data.phone   || '';
      form.elements['address'].value = data.address || '';
      form.elements['country'].value = data.country || '';
      form.elements['notes'].value   = data.notes   || '';
      form.dataset.editId = data._id;
    } else {
      form.elements['type'].value = 'accommodation';
      delete form.dataset.editId;
    }

    modal.classList.remove('hidden');
    form.elements['name'].focus();
  }

  function closeModal() {
    document.getElementById('provider-modal-overlay').classList.add('hidden');
  }

  function loadAndOpenEdit(id) {
    col.doc(id).get()
      .then(function (doc) {
        if (!doc.exists) return;
        var data = doc.data();
        data._id = doc.id;
        openModal(data);
      })
      .catch(function (err) { console.error('[providers] load for edit:', err.message); });
  }

  // -------------------------------------------------------------------------
  // Form submit
  // -------------------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    clearFormError();

    var form    = e.target;
    var editId  = form.dataset.editId;
    var saveBtn = document.getElementById('provider-save-btn');

    if (!form.elements['name'].value.trim()) {
      showFormError('Provider name is required.');
      return;
    }

    var payload = {
      name:      form.elements['name'].value.trim(),
      type:      form.elements['type'].value,
      contact:   form.elements['contact'].value.trim(),
      email:     form.elements['email'].value.trim(),
      phone:     form.elements['phone'].value.trim(),
      address:   form.elements['address'].value.trim(),
      country:   form.elements['country'].value.trim(),
      notes:     form.elements['notes'].value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    var op = editId ? col.doc(editId).update(payload) : (payload.createdAt = firebase.firestore.FieldValue.serverTimestamp(), col.add(payload));

    op.then(function () {
      closeModal();
      var activeFilter = document.querySelector('.filter-btn.active');
      loadProviders(activeFilter ? activeFilter.getAttribute('data-type') : 'all');
    })
    .catch(function (err) {
      console.error('[providers] save:', err.message);
      showFormError('Failed to save. Please try again.');
    })
    .finally(function () {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save Provider';
    });
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  function confirmDelete(id, row) {
    if (!confirm('Delete this provider? This cannot be undone.')) return;
    col.doc(id).delete()
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#providers-table-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) {
          var activeFilter = document.querySelector('.filter-btn.active');
          loadProviders(activeFilter ? activeFilter.getAttribute('data-type') : 'all');
        }
      })
      .catch(function (err) {
        console.error('[providers] delete:', err.message);
        alert('Failed to delete provider. Please try again.');
      });
  }

  // -------------------------------------------------------------------------
  // Modal HTML
  // -------------------------------------------------------------------------
  function buildModal() {
    var typeOpts = TYPES.map(function (t) {
      return '<option value="' + t + '">' + capitalise(t) + '</option>';
    }).join('');

    return [
      '<div id="provider-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-lg">',
          '<div class="modal-header">',
            '<h3 id="provider-modal-title" class="modal-title">Add Provider</h3>',
            '<button id="provider-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="provider-form" class="modal-form" novalidate>',
            '<div class="form-grid">',
              '<div class="field field-full">',
                '<label>Name <span class="required">*</span></label>',
                '<input type="text" name="name" placeholder="e.g. Hotel Machu Picchu" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Type</label>',
                '<select name="type">' + typeOpts + '</select>',
              '</div>',
              '<div class="field">',
                '<label>Contact Person</label>',
                '<input type="text" name="contact" placeholder="Contact name" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Email</label>',
                '<input type="email" name="email" placeholder="email@provider.com" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Phone</label>',
                '<input type="tel" name="phone" placeholder="+1 555 000 0000" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Country</label>',
                '<input type="text" name="country" placeholder="e.g. Peru" autocomplete="off">',
              '</div>',
              '<div class="field field-full">',
                '<label>Address</label>',
                '<input type="text" name="address" placeholder="Street address" autocomplete="off">',
              '</div>',
              '<div class="field field-full">',
                '<label>Notes</label>',
                '<textarea name="notes" placeholder="Internal notes about this provider…" rows="3"></textarea>',
              '</div>',
            '</div>',
            '<p id="provider-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'provider-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="provider-save-btn">Save Provider</button>',
            '</div>',
          '</form>',
        '</div>',
      '</div>'
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function showFormError(msg) { var el = document.getElementById('provider-form-error'); if (el) el.textContent = msg; }
  function clearFormError()   { var el = document.getElementById('provider-form-error'); if (el) el.textContent = ''; }
  function capitalise(s)      { return s.charAt(0).toUpperCase() + s.slice(1); }

  function typeClass(type) {
    var map = {
      accommodation: 'info', transport: 'warning',
      activity: 'success', restaurant: 'neutral', other: 'neutral'
    };
    return map[type] || 'neutral';
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
