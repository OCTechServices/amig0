// tours.js — amig0-travel-company | OCTech Services
// Tours module: list, add, edit, delete, status management + itinerary editor
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db  = firebase.firestore();
  var col = db.collection('tours');

  var STATUSES   = ['draft', 'confirmed', 'active', 'completed', 'cancelled'];
  var CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN'];

  // Held so itinerary view can re-render back into it
  var _container = null;

  // guides cache: id → full name
  var guidesCache = {};

  window.Tours = {
    render: render
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(container) {
    _container = container;
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">All ' + cfg('tours') + '</h3>',
          '<button class="btn btn-primary" id="add-tour-btn">+ ' + cfg('addTour') + '</button>',
        '</div>',
        '<div class="card">',
          '<div id="tours-table-wrap">',
            '<p class="empty-state">Loading…</p>',
          '</div>',
        '</div>',
      '</div>',
      buildModal(),
    ].join('');

    document.getElementById('add-tour-btn').addEventListener('click', function () {
      openModal(null);
    });

    document.getElementById('tour-modal-close').addEventListener('click', closeModal);
    document.getElementById('tour-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('tour-form').addEventListener('submit', handleSubmit);

    loadGuidesCache().then(loadTours);
  }

  // -------------------------------------------------------------------------
  // Load guides cache
  // -------------------------------------------------------------------------
  function loadGuidesCache() {
    return db.collection('guides').orderBy('firstName').get()
      .then(function (snap) {
        guidesCache = {};
        snap.forEach(function (doc) {
          var d = doc.data();
          guidesCache[doc.id] = [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unnamed';
        });
      })
      .catch(function (err) { console.error('[tours] guides cache:', err.message); });
  }

  function populateGuideDropdown(form) {
    var sel  = form.querySelector('[name="guideId"]');
    if (!sel) return;
    var opts = '<option value="">— No guide assigned —</option>';
    Object.keys(guidesCache).forEach(function (id) {
      opts += '<option value="' + id + '">' + esc(guidesCache[id]) + '</option>';
    });
    sel.innerHTML = opts;
  }

  // -------------------------------------------------------------------------
  // Load & render table
  // -------------------------------------------------------------------------
  function loadTours() {
    var wrap = document.getElementById('tours-table-wrap');
    if (!wrap) return;

    col.orderBy('createdAt', 'desc').get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No ' + cfg('tours').toLowerCase() + ' yet. Add your first ' + cfg('tour').toLowerCase() + ' to get started.</p>';
          return;
        }

        var rows = snap.docs.map(function (doc) {
          var d = doc.data();
          var start     = d.startDate ? formatDate(d.startDate.toDate()) : '—';
          var end       = d.endDate   ? formatDate(d.endDate.toDate())   : '—';
          var guideName = d.guideId   ? (guidesCache[d.guideId] || '—') : '—';
          return [
            '<tr>',
              '<td class="td-primary">' + esc(d.name || '—') + '</td>',
              '<td>' + esc(d.destination || '—') + '</td>',
              '<td>' + start + ' → ' + end + '</td>',
              '<td>' + esc(d.capacity || '—') + '</td>',
              '<td>' + formatPrice(d.price, d.currency) + '</td>',
              '<td>' + esc(guideName) + '</td>',
              '<td><span class="badge badge-' + statusClass(d.status) + '">' + esc(d.status || 'draft') + '</span></td>',
              '<td class="td-actions">',
                '<button class="btn-table-action" data-action="itinerary" data-id="' + doc.id + '" data-name="' + esc(d.name || 'Tour') + '">Itinerary</button>',
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
                '<th>Destination</th>',
                '<th>Dates</th>',
                '<th>Capacity</th>',
                '<th>Price</th>',
                '<th>' + cfg('guide') + '</th>',
                '<th>Status</th>',
                '<th></th>',
              '</tr>',
            '</thead>',
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
            } else if (action === 'itinerary') {
              renderItinerary(id, btn.getAttribute('data-name'));
            }
          });
        });
      })
      .catch(function (err) {
        console.error('[tours] load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load tours. Check your connection and try again.</p>';
      });
  }

  // -------------------------------------------------------------------------
  // Modal
  // -------------------------------------------------------------------------
  function openModal(data) {
    var modal = document.getElementById('tour-modal-overlay');
    var title = document.getElementById('tour-modal-title');
    var form  = document.getElementById('tour-form');

    title.textContent = data ? 'Edit ' + cfg('tour') : 'Add ' + cfg('tour');
    form.reset();
    clearFormError();
    populateGuideDropdown(form);

    if (data) {
      form.elements['name'].value        = data.name        || '';
      form.elements['destination'].value = data.destination || '';
      form.elements['capacity'].value    = data.capacity    || '';
      form.elements['price'].value       = data.price       || '';
      form.elements['currency'].value    = data.currency    || 'USD';
      form.elements['status'].value      = data.status      || 'draft';
      form.elements['guideId'].value     = data.guideId     || '';
      form.elements['notes'].value       = data.notes       || '';

      if (data.startDate) {
        form.elements['startDate'].value = toDateInput(data.startDate.toDate());
      }
      if (data.endDate) {
        form.elements['endDate'].value = toDateInput(data.endDate.toDate());
      }
      form.dataset.editId = data._id;
    } else {
      form.elements['currency'].value = 'USD';
      form.elements['status'].value   = 'draft';
      delete form.dataset.editId;
    }

    modal.classList.remove('hidden');
    form.elements['name'].focus();
  }

  function closeModal() {
    document.getElementById('tour-modal-overlay').classList.add('hidden');
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
        console.error('[tours] load for edit:', err.message);
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
    var saveBtn = document.getElementById('tour-save-btn');

    var startVal = form.elements['startDate'].value;
    var endVal   = form.elements['endDate'].value;

    if (!form.elements['name'].value.trim()) {
      showFormError(cfg('tour') + ' name is required.');
      return;
    }
    if (startVal && endVal && startVal > endVal) {
      showFormError('End date must be after start date.');
      return;
    }

    var payload = {
      name:        form.elements['name'].value.trim(),
      destination: form.elements['destination'].value.trim(),
      capacity:    parseInt(form.elements['capacity'].value, 10) || 0,
      price:       parseFloat(form.elements['price'].value) || 0,
      currency:    form.elements['currency'].value || 'USD',
      status:      form.elements['status'].value || 'draft',
      guideId:     form.elements['guideId'].value || null,
      notes:       form.elements['notes'].value.trim(),
      startDate:   startVal ? firebase.firestore.Timestamp.fromDate(new Date(startVal)) : null,
      endDate:     endVal   ? firebase.firestore.Timestamp.fromDate(new Date(endVal))   : null,
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
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
      loadTours();
    })
    .catch(function (err) {
      console.error('[tours] save:', err.message);
      showFormError('Failed to save. Please try again.');
    })
    .finally(function () {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save ' + cfg('tour');
    });
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  function confirmDelete(id, row) {
    if (!confirm('Delete this ' + cfg('tour').toLowerCase() + '? This cannot be undone.')) return;

    col.doc(id).delete()
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#tours-table-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadTours();
      })
      .catch(function (err) {
        console.error('[tours] delete:', err.message);
        alert('Failed to delete tour. Please try again.');
      });
  }

  // -------------------------------------------------------------------------
  // Modal HTML
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Itinerary editor — renders in place of the tours list
  // -------------------------------------------------------------------------
  function renderItinerary(tourId, tourName) {
    if (!_container) return;

    _container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<div style="display:flex;align-items:center;gap:var(--space-3)">',
            '<button class="btn btn-ghost" id="itin-back-btn">&#8592; ' + cfg('tours') + '</button>',
            '<h3 class="module-title" style="margin:0">' + esc(tourName) + ' — Itinerary</h3>',
          '</div>',
          '<button class="btn btn-primary" id="itin-add-btn">+ Add Day</button>',
        '</div>',
        '<div class="card">',
          '<div id="itin-list-wrap"><p class="empty-state">Loading…</p></div>',
        '</div>',
      '</div>',
      buildDayModal(),
    ].join('');

    document.getElementById('itin-back-btn').addEventListener('click', function () {
      render(_container);
    });
    document.getElementById('itin-add-btn').addEventListener('click', function () {
      openDayModal(tourId, null);
    });
    document.getElementById('day-modal-close').addEventListener('click', function () {
      closeDayModal();
    });
    document.getElementById('day-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeDayModal();
    });
    document.getElementById('day-form').addEventListener('submit', function (e) {
      handleDaySubmit(e, tourId);
    });

    loadItinerary(tourId);
  }

  function loadItinerary(tourId) {
    var wrap = document.getElementById('itin-list-wrap');
    if (!wrap) return;

    db.collection('tours').doc(tourId)
      .collection('itineraries')
      .orderBy('day')
      .get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No days yet. Click + Add Day to build the itinerary.</p>';
          return;
        }

        var rows = snap.docs.map(function (doc) {
          var d    = doc.data();
          var date = d.date ? formatDate(d.date.toDate()) : '—';
          return [
            '<tr>',
              '<td class="td-primary" style="width:60px">Day ' + (d.day || '?') + '</td>',
              '<td>' + esc(d.title || '—') + '</td>',
              '<td>' + esc(d.location || '—') + '</td>',
              '<td>' + date + '</td>',
              '<td class="td-actions">',
                '<button class="btn-table-action" data-action="edit-day" data-id="' + doc.id + '" data-tour="' + tourId + '">Edit</button>',
                '<button class="btn-table-action btn-table-danger" data-action="delete-day" data-id="' + doc.id + '" data-tour="' + tourId + '">Delete</button>',
              '</td>',
            '</tr>'
          ].join('');
        });

        wrap.innerHTML = [
          '<table class="data-table">',
            '<thead><tr>',
              '<th>Day</th><th>Title</th><th>Location</th><th>Date</th><th></th>',
            '</tr></thead>',
            '<tbody>' + rows.join('') + '</tbody>',
          '</table>'
        ].join('');

        wrap.querySelectorAll('[data-action]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var dayId  = btn.getAttribute('data-id');
            var tId    = btn.getAttribute('data-tour');
            var action = btn.getAttribute('data-action');
            if (action === 'edit-day') {
              loadAndOpenDayEdit(tId, dayId);
            } else if (action === 'delete-day') {
              confirmDeleteDay(tId, dayId, btn.closest('tr'));
            }
          });
        });
      })
      .catch(function (err) {
        console.error('[tours] itinerary load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load itinerary.</p>';
      });
  }

  function openDayModal(tourId, data) {
    var modal = document.getElementById('day-modal-overlay');
    var title = document.getElementById('day-modal-title');
    var form  = document.getElementById('day-form');

    title.textContent = data ? 'Edit Day' : 'Add Day';
    form.reset();
    document.getElementById('day-form-error').textContent = '';

    if (data) {
      form.elements['day'].value         = data.day         || '';
      form.elements['title'].value       = data.title       || '';
      form.elements['location'].value    = data.location    || '';
      form.elements['description'].value = data.description || '';
      if (data.date) form.elements['date'].value = toDateInput(data.date.toDate());
      form.dataset.editId = data._id;
    } else {
      delete form.dataset.editId;
    }

    form.dataset.tourId = tourId;
    modal.classList.remove('hidden');
    form.elements['day'].focus();
  }

  function closeDayModal() {
    document.getElementById('day-modal-overlay').classList.add('hidden');
  }

  function loadAndOpenDayEdit(tourId, dayId) {
    db.collection('tours').doc(tourId)
      .collection('itineraries').doc(dayId)
      .get()
      .then(function (doc) {
        if (!doc.exists) return;
        var data = doc.data();
        data._id = doc.id;
        openDayModal(tourId, data);
      })
      .catch(function (err) { console.error('[tours] day load for edit:', err.message); });
  }

  function handleDaySubmit(e, tourId) {
    e.preventDefault();
    var form    = e.target;
    var editId  = form.dataset.editId;
    var tId     = form.dataset.tourId || tourId;
    var saveBtn = document.getElementById('day-save-btn');
    var errEl   = document.getElementById('day-form-error');

    errEl.textContent = '';

    if (!form.elements['day'].value) {
      errEl.textContent = 'Day number is required.';
      return;
    }
    if (!form.elements['title'].value.trim()) {
      errEl.textContent = 'Title is required.';
      return;
    }

    var dateVal = form.elements['date'].value;
    var payload = {
      day:         parseInt(form.elements['day'].value, 10),
      title:       form.elements['title'].value.trim(),
      location:    form.elements['location'].value.trim(),
      description: form.elements['description'].value.trim(),
      date:        dateVal ? firebase.firestore.Timestamp.fromDate(new Date(dateVal)) : null
    };

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    var sub = db.collection('tours').doc(tId).collection('itineraries');
    var op  = editId ? sub.doc(editId).update(payload) : sub.add(payload);

    op.then(function () {
      closeDayModal();
      loadItinerary(tId);
    })
    .catch(function (err) {
      console.error('[tours] day save:', err.message);
      errEl.textContent = 'Failed to save. Please try again.';
    })
    .finally(function () {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save Day';
    });
  }

  function confirmDeleteDay(tourId, dayId, row) {
    if (!confirm('Delete this day? This cannot be undone.')) return;
    db.collection('tours').doc(tourId)
      .collection('itineraries').doc(dayId)
      .delete()
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#itin-list-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadItinerary(tourId);
      })
      .catch(function (err) {
        console.error('[tours] day delete:', err.message);
        alert('Failed to delete day. Please try again.');
      });
  }

  function buildDayModal() {
    return [
      '<div id="day-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-lg">',
          '<div class="modal-header">',
            '<h3 id="day-modal-title" class="modal-title">Add Day</h3>',
            '<button id="day-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="day-form" class="modal-form" novalidate>',
            '<div class="form-grid">',
              '<div class="field">',
                '<label for="day-num">Day Number <span class="required">*</span></label>',
                '<input type="number" id="day-num" name="day" placeholder="1" min="1">',
              '</div>',
              '<div class="field">',
                '<label for="day-date">Date</label>',
                '<input type="date" id="day-date" name="date">',
              '</div>',
              '<div class="field field-full">',
                '<label for="day-title">Title <span class="required">*</span></label>',
                '<input type="text" id="day-title" name="title" placeholder="e.g. Arrival & City Tour" autocomplete="off">',
              '</div>',
              '<div class="field field-full">',
                '<label for="day-location">Location</label>',
                '<input type="text" id="day-location" name="location" placeholder="e.g. Lima, Peru" autocomplete="off">',
              '</div>',
            '</div>',
            '<div class="field">',
              '<label for="day-description">Description</label>',
              '<textarea id="day-description" name="description" placeholder="What happens on this day…" rows="4"></textarea>',
            '</div>',
            '<p id="day-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" id="day-cancel-btn" onclick="document.getElementById(\'day-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="day-save-btn">Save Day</button>',
            '</div>',
          '</form>',
        '</div>',
      '</div>'
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Tour modal HTML
  // -------------------------------------------------------------------------
  function buildModal() {
    var statusOptions = STATUSES.map(function (s) {
      return '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    }).join('');

    var currencyOptions = CURRENCIES.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');

    return [
      '<div id="tour-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-lg">',
          '<div class="modal-header">',
            '<h3 id="tour-modal-title" class="modal-title">Add ' + cfg('tour') + '</h3>',
            '<button id="tour-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="tour-form" class="modal-form" novalidate>',

            '<div class="form-grid">',
              '<div class="field field-full">',
                '<label for="tour-name">' + cfg('tour') + ' Name <span class="required">*</span></label>',
                '<input type="text" id="tour-name" name="name" placeholder="e.g. Highlights of Peru" autocomplete="off">',
              '</div>',
              '<div class="field field-full">',
                '<label for="tour-destination">Destination</label>',
                '<input type="text" id="tour-destination" name="destination" placeholder="e.g. Lima, Cusco, Machu Picchu" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="tour-start">Start Date</label>',
                '<input type="date" id="tour-start" name="startDate">',
              '</div>',
              '<div class="field">',
                '<label for="tour-end">End Date</label>',
                '<input type="date" id="tour-end" name="endDate">',
              '</div>',
              '<div class="field">',
                '<label for="tour-capacity">Capacity</label>',
                '<input type="number" id="tour-capacity" name="capacity" placeholder="Max passengers" min="1">',
              '</div>',
              '<div class="field">',
                '<label for="tour-status">Status</label>',
                '<select id="tour-status" name="status">' + statusOptions + '</select>',
              '</div>',
              '<div class="field field-full">',
                '<label for="tour-guide">' + cfg('guide') + '</label>',
                '<select id="tour-guide" name="guideId"><option value="">— No ' + cfg('guide').toLowerCase() + ' assigned —</option></select>',
              '</div>',
              '<div class="field">',
                '<label for="tour-price">Price per Person</label>',
                '<input type="number" id="tour-price" name="price" placeholder="0.00" min="0" step="0.01">',
              '</div>',
              '<div class="field">',
                '<label for="tour-currency">Currency</label>',
                '<select id="tour-currency" name="currency">' + currencyOptions + '</select>',
              '</div>',
            '</div>',

            '<div class="field">',
              '<label for="tour-notes">Notes</label>',
              '<textarea id="tour-notes" name="notes" placeholder="Internal notes about this tour…" rows="3"></textarea>',
            '</div>',

            '<p id="tour-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'tour-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="tour-save-btn">Save ' + cfg('tour') + '</button>',
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
    var el = document.getElementById('tour-form-error');
    if (el) el.textContent = msg;
  }

  function clearFormError() {
    var el = document.getElementById('tour-form-error');
    if (el) el.textContent = '';
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function toDateInput(date) {
    return date.toISOString().split('T')[0];
  }

  function formatPrice(price, currency) {
    if (!price) return '—';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0
      }).format(price);
    } catch (e) {
      return (currency || '') + ' ' + price;
    }
  }

  function statusClass(status) {
    var map = {
      draft: 'neutral', confirmed: 'info', active: 'success',
      completed: 'neutral', cancelled: 'error'
    };
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
