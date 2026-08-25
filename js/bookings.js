// bookings.js — amig0 | OCTech Services
// Bookings module: link passengers to tours
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db  = firebase.firestore();
  var col = db.collection('bookings');

  var STATUSES = ['pending', 'confirmed', 'cancelled'];

  // Reference caches
  var toursCache      = {};  // id → { name, destination }
  var passengersCache = {};  // id → { name, clientId }
  var clientsCache    = {};  // id → name

  window.Bookings = {
    render: render
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">All ' + cfg('bookings') + '</h3>',
          '<button class="btn btn-primary" id="add-booking-btn">+ ' + cfg('addBooking') + '</button>',
        '</div>',
        '<div class="card">',
          '<div id="bookings-table-wrap">',
            '<p class="empty-state">Loading…</p>',
          '</div>',
        '</div>',
      '</div>',
      buildModal(),
    ].join('');

    document.getElementById('add-booking-btn').addEventListener('click', function () {
      openModal(null);
    });
    document.getElementById('booking-modal-close').addEventListener('click', closeModal);
    document.getElementById('booking-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('booking-form').addEventListener('submit', handleSubmit);

    // Wire passenger dropdown to auto-fill client
    document.getElementById('booking-passenger').addEventListener('change', function () {
      var pid    = this.value;
      var pData  = passengersCache[pid];
      var cSel   = document.getElementById('booking-client');
      if (pData && pData.clientId && cSel) {
        cSel.value = pData.clientId;
      }
    });

    loadCaches().then(loadBookings);
  }

  // -------------------------------------------------------------------------
  // Load reference caches
  // -------------------------------------------------------------------------
  function loadCaches() {
    return Promise.all([
      db.collection('tours').orderBy('name').get()
        .then(function (snap) {
          toursCache = {};
          snap.forEach(function (doc) {
            var d = doc.data();
            toursCache[doc.id] = { name: d.name || 'Unnamed', destination: d.destination || '' };
          });
        }),
      db.collection('passengers').orderBy('firstName').get()
        .then(function (snap) {
          passengersCache = {};
          snap.forEach(function (doc) {
            var d = doc.data();
            var name = [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unnamed';
            passengersCache[doc.id] = { name: name, clientId: d.clientId || null };
          });
        }),
      db.collection('clients').orderBy('name').get()
        .then(function (snap) {
          clientsCache = {};
          snap.forEach(function (doc) {
            clientsCache[doc.id] = doc.data().name || 'Unnamed';
          });
        })
    ]).catch(function (err) {
      console.error('[bookings] cache load:', err.message);
    });
  }

  // -------------------------------------------------------------------------
  // Load & render table
  // -------------------------------------------------------------------------
  function loadBookings() {
    var wrap = document.getElementById('bookings-table-wrap');
    if (!wrap) return;

    col.orderBy('bookedAt', 'desc').get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No ' + cfg('bookings').toLowerCase() + ' yet. Add a ' + cfg('booking').toLowerCase() + ' to link a ' + cfg('passenger').toLowerCase() + ' to a ' + cfg('tour').toLowerCase() + '.</p>';
          return;
        }

        var rows = snap.docs.map(function (doc) {
          var d            = doc.data();
          var tourName     = d.tourId      ? (toursCache[d.tourId]           ? toursCache[d.tourId].name           : '—') : '—';
          var passengerName = d.passengerId ? (passengersCache[d.passengerId] ? passengersCache[d.passengerId].name : '—') : '—';
          var clientName   = d.clientId    ? (clientsCache[d.clientId]       || '—')                                      : '—';
          var bookedAt     = d.bookedAt    ? formatDate(d.bookedAt.toDate())                                               : '—';

          return [
            '<tr>',
              '<td class="td-primary">' + esc(tourName) + '</td>',
              '<td>' + esc(passengerName) + '</td>',
              '<td>' + esc(clientName) + '</td>',
              '<td><span class="badge badge-' + statusClass(d.status) + '">' + esc(d.status || 'pending') + '</span></td>',
              '<td>' + bookedAt + '</td>',
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
              '<th>Tour</th>',
              '<th>Passenger</th>',
              '<th>Client</th>',
              '<th>Status</th>',
              '<th>Booked</th>',
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
        console.error('[bookings] load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load bookings. Check your connection and try again.</p>';
      });
  }

  // -------------------------------------------------------------------------
  // Modal
  // -------------------------------------------------------------------------
  function openModal(data) {
    var modal = document.getElementById('booking-modal-overlay');
    var title = document.getElementById('booking-modal-title');
    var form  = document.getElementById('booking-form');

    title.textContent = data ? 'Edit ' + cfg('booking') : 'Add ' + cfg('booking');
    form.reset();
    clearFormError();
    populateDropdowns();

    if (data) {
      form.elements['tourId'].value      = data.tourId      || '';
      form.elements['passengerId'].value = data.passengerId || '';
      form.elements['clientId'].value    = data.clientId    || '';
      form.elements['status'].value      = data.status      || 'pending';
      form.elements['notes'].value       = data.notes       || '';
      form.dataset.editId = data._id;
    } else {
      form.elements['status'].value = 'pending';
      delete form.dataset.editId;
    }

    modal.classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('booking-modal-overlay').classList.add('hidden');
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
        console.error('[bookings] load for edit:', err.message);
      });
  }

  function populateDropdowns() {
    // Tours
    var tSel = document.getElementById('booking-tour');
    if (tSel) {
      var tOpts = '<option value="">— Select tour —</option>';
      Object.keys(toursCache).forEach(function (id) {
        var t = toursCache[id];
        tOpts += '<option value="' + id + '">' + esc(t.name) + (t.destination ? ' · ' + esc(t.destination) : '') + '</option>';
      });
      tSel.innerHTML = tOpts;
    }

    // Passengers
    var pSel = document.getElementById('booking-passenger');
    if (pSel) {
      var pOpts = '<option value="">— Select passenger —</option>';
      Object.keys(passengersCache).forEach(function (id) {
        pOpts += '<option value="' + id + '">' + esc(passengersCache[id].name) + '</option>';
      });
      pSel.innerHTML = pOpts;
    }

    // Clients
    var cSel = document.getElementById('booking-client');
    if (cSel) {
      var cOpts = '<option value="">— No client —</option>';
      Object.keys(clientsCache).forEach(function (id) {
        cOpts += '<option value="' + id + '">' + esc(clientsCache[id]) + '</option>';
      });
      cSel.innerHTML = cOpts;
    }
  }

  // -------------------------------------------------------------------------
  // Form submit
  // -------------------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    clearFormError();

    var form    = e.target;
    var editId  = form.dataset.editId;
    var saveBtn = document.getElementById('booking-save-btn');

    if (!form.elements['tourId'].value) {
      showFormError('Please select a tour.');
      return;
    }
    if (!form.elements['passengerId'].value) {
      showFormError('Please select a passenger.');
      return;
    }

    var payload = {
      tourId:      form.elements['tourId'].value,
      passengerId: form.elements['passengerId'].value,
      clientId:    form.elements['clientId'].value || null,
      status:      form.elements['status'].value || 'pending',
      notes:       form.elements['notes'].value.trim(),
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
    };

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    var op;
    if (editId) {
      op = col.doc(editId).update(payload);
    } else {
      payload.bookedAt  = firebase.firestore.FieldValue.serverTimestamp();
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      op = col.add(payload);
    }

    op.then(function () {
      closeModal();
      loadBookings();
    })
    .catch(function (err) {
      console.error('[bookings] save:', err.message);
      showFormError('Failed to save. Please try again.');
    })
    .finally(function () {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save ' + cfg('booking');
    });
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  function confirmDelete(id, row) {
    if (!confirm('Delete this ' + cfg('booking').toLowerCase() + '? This cannot be undone.')) return;
    col.doc(id).delete()
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#bookings-table-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadBookings();
      })
      .catch(function (err) {
        console.error('[bookings] delete:', err.message);
        alert('Failed to delete booking. Please try again.');
      });
  }

  // -------------------------------------------------------------------------
  // Modal HTML
  // -------------------------------------------------------------------------
  function buildModal() {
    var statusOptions = STATUSES.map(function (s) {
      return '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    }).join('');

    return [
      '<div id="booking-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-lg">',
          '<div class="modal-header">',
            '<h3 id="booking-modal-title" class="modal-title">Add ' + cfg('booking') + '</h3>',
            '<button id="booking-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="booking-form" class="modal-form" novalidate>',

            '<div class="form-grid">',
              '<div class="field field-full">',
                '<label for="booking-tour">Tour <span class="required">*</span></label>',
                '<select id="booking-tour" name="tourId"><option value="">Loading…</option></select>',
              '</div>',
              '<div class="field field-full">',
                '<label for="booking-passenger">Passenger <span class="required">*</span></label>',
                '<select id="booking-passenger" name="passengerId"><option value="">Loading…</option></select>',
              '</div>',
              '<div class="field">',
                '<label for="booking-client">Client</label>',
                '<select id="booking-client" name="clientId"><option value="">Loading…</option></select>',
              '</div>',
              '<div class="field">',
                '<label for="booking-status">Status</label>',
                '<select id="booking-status" name="status">' + statusOptions + '</select>',
              '</div>',
              '<div class="field field-full">',
                '<label for="booking-notes">Notes</label>',
                '<textarea id="booking-notes" name="notes" placeholder="Any notes about this booking…" rows="3"></textarea>',
              '</div>',
            '</div>',

            '<p id="booking-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'booking-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="booking-save-btn">Save ' + cfg('booking') + '</button>',
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
    var el = document.getElementById('booking-form-error');
    if (el) el.textContent = msg;
  }

  function clearFormError() {
    var el = document.getElementById('booking-form-error');
    if (el) el.textContent = '';
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function statusClass(status) {
    var map = { pending: 'warning', confirmed: 'success', cancelled: 'error' };
    return map[status] || 'neutral';
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
