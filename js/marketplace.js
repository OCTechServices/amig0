// marketplace.js — amig0-travel-company | OCTech Services
// Marketplace listings module: open tour seats for vetted travelers
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db  = firebase.firestore();
  var col = db.collection('marketplace_listings');

  var STATUSES   = ['draft', 'active', 'closed'];
  var CURRENCIES = ['USD', 'MXN', 'EUR', 'GBP', 'CAD', 'AUD'];

  var toursCache = {};

  window.Marketplace = { render: render };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">Marketplace Listings</h3>',
          '<button class="btn btn-primary" id="add-listing-btn">+ New Listing</button>',
        '</div>',
        '<div class="providers-filter">',
          '<button class="filter-btn active" data-status="all">All</button>',
          STATUSES.map(function (s) {
            return '<button class="filter-btn" data-status="' + s + '">' + capitalise(s) + '</button>';
          }).join(''),
        '</div>',
        '<div class="card">',
          '<div id="listings-table-wrap"><p class="empty-state">Loading…</p></div>',
        '</div>',
      '</div>',
      buildModal(),
    ].join('');

    document.getElementById('add-listing-btn').addEventListener('click', function () { openModal(null); });
    document.getElementById('listing-modal-close').addEventListener('click', closeModal);
    document.getElementById('listing-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('listing-form').addEventListener('submit', handleSubmit);

    container.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        loadListings(btn.getAttribute('data-status'));
      });
    });

    loadToursCache().then(function () { loadListings('all'); });
  }

  // ---------------------------------------------------------------------------
  // Caches
  // ---------------------------------------------------------------------------
  function loadToursCache() {
    return db.collection('tours').orderBy('name').get()
      .then(function (snap) {
        toursCache = {};
        snap.forEach(function (doc) {
          toursCache[doc.id] = { name: doc.data().name || 'Unnamed', destination: doc.data().destination || '' };
        });
      })
      .catch(function (err) { console.error('[marketplace] tours cache:', err.message); });
  }

  // ---------------------------------------------------------------------------
  // Load & render table
  // ---------------------------------------------------------------------------
  function loadListings(statusFilter) {
    var wrap = document.getElementById('listings-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<p class="empty-state">Loading…</p>';

    var query = statusFilter && statusFilter !== 'all'
      ? col.where('status', '==', statusFilter).orderBy('createdAt', 'desc')
      : col.orderBy('createdAt', 'desc');

    query.get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No listings yet. Create your first marketplace listing.</p>';
          return;
        }

        var rows = snap.docs.map(function (doc) {
          var d        = doc.data();
          var tourName = d.tourId ? (toursCache[d.tourId] && toursCache[d.tourId].name || '—') : '—';
          var start    = d.startDate ? formatDate(d.startDate.toDate()) : '—';
          var featured = d.featured ? '<span class="badge badge-warning" title="Featured">★</span> ' : '';

          return [
            '<tr>',
              '<td class="td-primary">' + featured + esc(d.title || '—') + '</td>',
              '<td>' + esc(tourName) + '</td>',
              '<td>' + esc(d.destination || '—') + '</td>',
              '<td>' + start + '</td>',
              '<td style="text-align:center">' + (d.seatsAvailable || 0) + '</td>',
              '<td>' + formatCurrency(d.pricePerSeat, d.currency) + '</td>',
              '<td><span class="badge badge-' + statusClass(d.status) + '">' + esc(d.status || 'draft') + '</span></td>',
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
              '<th>Title</th><th>Tour</th><th>Destination</th><th>Start</th><th>Seats</th><th>Price/Seat</th><th>Status</th><th></th>',
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
        console.error('[marketplace] load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load listings.</p>';
      });
  }

  // ---------------------------------------------------------------------------
  // Modal open / close
  // ---------------------------------------------------------------------------
  function openModal(data) {
    var modal = document.getElementById('listing-modal-overlay');
    var title = document.getElementById('listing-modal-title');
    var form  = document.getElementById('listing-form');

    title.textContent = data ? 'Edit Listing' : 'New Listing';
    form.reset();
    clearFormError();

    // Populate tour dropdown
    var tSel  = form.querySelector('[name="tourId"]');
    var tOpts = '<option value="">— No linked tour —</option>';
    Object.keys(toursCache).forEach(function (id) {
      tOpts += '<option value="' + id + '">' + esc(toursCache[id].name) + '</option>';
    });
    tSel.innerHTML = tOpts;

    if (data) {
      form.elements['tourId'].value       = data.tourId      || '';
      form.elements['title'].value        = data.title       || '';
      form.elements['destination'].value  = data.destination || '';
      form.elements['description'].value  = data.description || '';
      form.elements['seatsAvailable'].value = data.seatsAvailable != null ? data.seatsAvailable : '';
      form.elements['pricePerSeat'].value = data.pricePerSeat != null ? data.pricePerSeat : '';
      form.elements['currency'].value     = data.currency    || 'USD';
      form.elements['status'].value       = data.status      || 'draft';
      form.elements['featured'].checked   = !!data.featured;
      if (data.startDate) form.elements['startDate'].value = toDateInput(data.startDate.toDate());
      if (data.endDate)   form.elements['endDate'].value   = toDateInput(data.endDate.toDate());
      form.dataset.editId = data._id;
    } else {
      form.elements['currency'].value = 'USD';
      form.elements['status'].value   = 'draft';
      delete form.dataset.editId;
    }

    // Auto-fill destination from tour selection
    tSel.addEventListener('change', function () {
      var tour = toursCache[this.value];
      if (tour && tour.destination && !form.elements['destination'].value) {
        form.elements['destination'].value = tour.destination;
      }
    });

    modal.classList.remove('hidden');
    form.elements['title'].focus();
  }

  function closeModal() {
    document.getElementById('listing-modal-overlay').classList.add('hidden');
  }

  function loadAndOpenEdit(id) {
    col.doc(id).get()
      .then(function (doc) {
        if (!doc.exists) return;
        var data = doc.data();
        data._id = doc.id;
        openModal(data);
      })
      .catch(function (err) { console.error('[marketplace] load for edit:', err.message); });
  }

  // ---------------------------------------------------------------------------
  // Form submit
  // ---------------------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    clearFormError();

    var form    = e.target;
    var editId  = form.dataset.editId;
    var saveBtn = document.getElementById('listing-save-btn');

    if (!form.elements['title'].value.trim()) {
      showFormError('Title is required.');
      return;
    }

    var startVal = form.elements['startDate'].value;
    var endVal   = form.elements['endDate'].value;

    var payload = {
      tourId:        form.elements['tourId'].value        || null,
      title:         form.elements['title'].value.trim(),
      destination:   form.elements['destination'].value.trim(),
      description:   form.elements['description'].value.trim(),
      seatsAvailable: parseInt(form.elements['seatsAvailable'].value, 10) || 0,
      pricePerSeat:  parseFloat(form.elements['pricePerSeat'].value) || 0,
      currency:      form.elements['currency'].value      || 'USD',
      status:        form.elements['status'].value        || 'draft',
      featured:      form.elements['featured'].checked,
      startDate:     startVal ? firebase.firestore.Timestamp.fromDate(new Date(startVal)) : null,
      endDate:       endVal   ? firebase.firestore.Timestamp.fromDate(new Date(endVal))   : null,
      updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
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
      var activeBtn = document.querySelector('.filter-btn.active');
      loadListings(activeBtn ? activeBtn.getAttribute('data-status') : 'all');
    })
    .catch(function (err) {
      console.error('[marketplace] save:', err.message);
      showFormError('Failed to save. Please try again.');
    })
    .finally(function () {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save Listing';
    });
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------
  function confirmDelete(id, row) {
    if (!confirm('Delete this listing? This cannot be undone.')) return;
    col.doc(id).delete()
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#listings-table-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadListings('all');
      })
      .catch(function (err) {
        console.error('[marketplace] delete:', err.message);
        alert('Failed to delete. Please try again.');
      });
  }

  // ---------------------------------------------------------------------------
  // Modal HTML
  // ---------------------------------------------------------------------------
  function buildModal() {
    var statusOpts = STATUSES.map(function (s) {
      return '<option value="' + s + '">' + capitalise(s) + '</option>';
    }).join('');

    var currOpts = CURRENCIES.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');

    return [
      '<div id="listing-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-lg">',
          '<div class="modal-header">',
            '<h3 id="listing-modal-title" class="modal-title">New Listing</h3>',
            '<button id="listing-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="listing-form" class="modal-form" novalidate>',
            '<div class="form-grid">',
              '<div class="field field-full">',
                '<label>Title <span class="required">*</span></label>',
                '<input type="text" name="title" placeholder="e.g. 2 spots open — Mexico City Food & Culture Tour" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Linked Tour</label>',
                '<select name="tourId"><option value="">Loading…</option></select>',
              '</div>',
              '<div class="field">',
                '<label>Destination</label>',
                '<input type="text" name="destination" placeholder="e.g. Mexico City" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Start Date</label>',
                '<input type="date" name="startDate">',
              '</div>',
              '<div class="field">',
                '<label>End Date</label>',
                '<input type="date" name="endDate">',
              '</div>',
              '<div class="field">',
                '<label>Seats Available</label>',
                '<input type="number" name="seatsAvailable" min="1" max="10" placeholder="1" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Price per Seat</label>',
                '<input type="number" name="pricePerSeat" min="0" step="0.01" placeholder="0.00" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Currency</label>',
                '<select name="currency">' + currOpts + '</select>',
              '</div>',
              '<div class="field">',
                '<label>Status</label>',
                '<select name="status">' + statusOpts + '</select>',
              '</div>',
              '<div class="field field-full">',
                '<label>Description</label>',
                '<textarea name="description" placeholder="What makes this tour special? Who is it for? What\'s included?" rows="3"></textarea>',
              '</div>',
              '<div class="field">',
                '<label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer">',
                  '<input type="checkbox" name="featured" style="width:16px;height:16px">',
                  'Featured listing',
                '</label>',
              '</div>',
            '</div>',
            '<p id="listing-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'listing-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="listing-save-btn">Save Listing</button>',
            '</div>',
          '</form>',
        '</div>',
      '</div>'
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function showFormError(msg) { var el = document.getElementById('listing-form-error'); if (el) el.textContent = msg; }
  function clearFormError()   { var el = document.getElementById('listing-form-error'); if (el) el.textContent = ''; }
  function capitalise(s)      { return s.charAt(0).toUpperCase() + s.slice(1); }

  function statusClass(s) {
    return { draft: 'neutral', active: 'success', closed: 'neutral' }[s] || 'neutral';
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function toDateInput(date) { return date.toISOString().split('T')[0]; }

  function formatCurrency(amount, currency) {
    if (amount === undefined || amount === null) return '—';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 0 }).format(amount);
    } catch (e) { return (currency || '') + ' ' + amount; }
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
