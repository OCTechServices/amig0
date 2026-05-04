// partners.js — amig0-travel-company | OCTech Services
// Partners module: verified merchant network — restaurants, bars, transport, experiences
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db  = firebase.firestore();
  var col = db.collection('partners');

  var CATEGORIES = ['restaurant', 'bar', 'transport', 'experience', 'shop', 'accommodation', 'other'];

  var HOSTING_URL = 'https://amig0-travel-company-52fb1.web.app';

  window.Partners = { render: render };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">Partner Network</h3>',
          '<button class="btn btn-primary" id="add-partner-btn">+ Add Partner</button>',
        '</div>',
        '<div class="providers-filter">',
          '<button class="filter-btn active" data-cat="all">All</button>',
          CATEGORIES.map(function (c) {
            return '<button class="filter-btn" data-cat="' + c + '">' + capitalise(c) + '</button>';
          }).join(''),
        '</div>',
        '<div class="card">',
          '<div id="partners-table-wrap"><p class="empty-state">Loading…</p></div>',
        '</div>',
      '</div>',
      buildFormModal(),
      buildQRModal(),
    ].join('');

    document.getElementById('add-partner-btn').addEventListener('click', function () { openModal(null); });
    document.getElementById('partner-modal-close').addEventListener('click', closeModal);
    document.getElementById('partner-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('partner-form').addEventListener('submit', handleSubmit);
    document.getElementById('partner-qr-close').addEventListener('click', closeQR);
    document.getElementById('partner-qr-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeQR();
    });

    container.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        loadPartners(btn.getAttribute('data-cat'));
      });
    });

    loadPartners('all');
  }

  // ---------------------------------------------------------------------------
  // Load & render table
  // ---------------------------------------------------------------------------
  function loadPartners(catFilter) {
    var wrap = document.getElementById('partners-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<p class="empty-state">Loading…</p>';

    var query = catFilter && catFilter !== 'all'
      ? col.where('category', '==', catFilter).orderBy('name')
      : col.orderBy('name');

    query.get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No partners yet. Add your first verified partner to build the network.</p>';
          return;
        }

        var rows = snap.docs.map(function (doc) {
          var d = doc.data();
          var activeLabel = d.active !== false
            ? '<span class="badge badge-success">Active</span>'
            : '<span class="badge badge-neutral">Inactive</span>';
          return [
            '<tr>',
              '<td class="td-primary">' + esc(d.name || '—') + '</td>',
              '<td><span class="badge badge-' + catClass(d.category) + '">' + esc(d.category || '—') + '</span></td>',
              '<td>' + esc(d.city || '—') + '</td>',
              '<td class="td-discount">' + esc(d.discount || '—') + '</td>',
              '<td>' + esc(d.contactName || '—') + '</td>',
              '<td>' + activeLabel + '</td>',
              '<td class="td-actions">',
                '<button class="btn-table-action btn-table-pay" data-action="qr" data-id="' + doc.id + '" data-name="' + esc(d.name || '') + '" data-token="' + esc(d.qrToken || '') + '">QR Code</button>',
                '<button class="btn-table-action" data-action="edit" data-id="' + doc.id + '">Edit</button>',
                '<button class="btn-table-action btn-table-danger" data-action="delete" data-id="' + doc.id + '">Delete</button>',
              '</td>',
            '</tr>'
          ].join('');
        });

        wrap.innerHTML = [
          '<table class="data-table">',
            '<thead><tr>',
              '<th>Name</th><th>Category</th><th>City</th><th>Discount / Offer</th><th>Contact</th><th>Status</th><th></th>',
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
            } else if (action === 'qr') {
              openQR(btn.getAttribute('data-name'), btn.getAttribute('data-token'));
            } else {
              confirmDelete(id, btn.closest('tr'));
            }
          });
        });
      })
      .catch(function (err) {
        console.error('[partners] load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load partners.</p>';
      });
  }

  // ---------------------------------------------------------------------------
  // Form modal
  // ---------------------------------------------------------------------------
  function openModal(data) {
    var modal = document.getElementById('partner-modal-overlay');
    var title = document.getElementById('partner-modal-title');
    var form  = document.getElementById('partner-form');

    title.textContent = data ? 'Edit Partner' : 'Add Partner';
    form.reset();
    clearFormError();

    if (data) {
      form.elements['name'].value        = data.name        || '';
      form.elements['category'].value    = data.category    || 'restaurant';
      form.elements['address'].value     = data.address     || '';
      form.elements['city'].value        = data.city        || '';
      form.elements['contactName'].value = data.contactName || '';
      form.elements['email'].value       = data.email       || '';
      form.elements['phone'].value       = data.phone       || '';
      form.elements['discount'].value    = data.discount    || '';
      form.elements['description'].value = data.description || '';
      form.elements['active'].value      = data.active !== false ? 'true' : 'false';
      form.elements['lat'].value         = data.lat != null ? data.lat : '';
      form.elements['lng'].value         = data.lng != null ? data.lng : '';
      form.dataset.editId  = data._id;
      form.dataset.qrToken = data.qrToken || '';
    } else {
      form.elements['category'].value = 'restaurant';
      form.elements['active'].value   = 'true';
      form.dataset.qrToken = '';
      delete form.dataset.editId;
    }

    modal.classList.remove('hidden');
    form.elements['name'].focus();
  }

  function closeModal() {
    document.getElementById('partner-modal-overlay').classList.add('hidden');
  }

  function loadAndOpenEdit(id) {
    col.doc(id).get()
      .then(function (doc) {
        if (!doc.exists) return;
        var data = doc.data();
        data._id = doc.id;
        openModal(data);
      })
      .catch(function (err) { console.error('[partners] load for edit:', err.message); });
  }

  // ---------------------------------------------------------------------------
  // Form submit
  // ---------------------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    clearFormError();

    var form    = e.target;
    var editId  = form.dataset.editId;
    var saveBtn = document.getElementById('partner-save-btn');

    if (!form.elements['name'].value.trim()) {
      showFormError('Partner name is required.');
      return;
    }

    var token = form.dataset.qrToken || generateToken();

    var payload = {
      name:        form.elements['name'].value.trim(),
      category:    form.elements['category'].value || 'restaurant',
      address:     form.elements['address'].value.trim(),
      city:        form.elements['city'].value.trim(),
      contactName: form.elements['contactName'].value.trim(),
      email:       form.elements['email'].value.trim(),
      phone:       form.elements['phone'].value.trim(),
      discount:    form.elements['discount'].value.trim(),
      description: form.elements['description'].value.trim(),
      active:      form.elements['active'].value === 'true',
      lat:         form.elements['lat'].value !== '' ? parseFloat(form.elements['lat'].value) : null,
      lng:         form.elements['lng'].value !== '' ? parseFloat(form.elements['lng'].value) : null,
      qrToken:     token,
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
      var activeFilter = document.querySelector('#partners-table-wrap').closest('.module')
        ? document.querySelector('.filter-btn.active') : null;
      loadPartners(activeFilter ? activeFilter.getAttribute('data-cat') : 'all');
    })
    .catch(function (err) {
      console.error('[partners] save:', err.message);
      showFormError('Failed to save. Please try again.');
    })
    .finally(function () {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save Partner';
    });
  }

  // ---------------------------------------------------------------------------
  // QR modal
  // ---------------------------------------------------------------------------
  function openQR(name, token) {
    if (!token) { alert('No QR token found. Open and re-save this partner to generate one.'); return; }
    var checkinUrl = HOSTING_URL + '/checkin?token=' + encodeURIComponent(token);
    var qrSrc      = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=' + encodeURIComponent(checkinUrl);

    document.getElementById('partner-qr-name').textContent  = name || 'Partner';
    document.getElementById('partner-qr-token').textContent = token;
    document.getElementById('partner-qr-img').src           = qrSrc;
    document.getElementById('partner-qr-img').alt           = 'QR code for ' + esc(name);
    document.getElementById('partner-qr-download').href     = qrSrc;
    document.getElementById('partner-qr-download').download = (name || 'partner') + '-qr.png';
    document.getElementById('partner-qr-link').value        = checkinUrl;

    document.getElementById('partner-qr-copy').onclick = function () {
      navigator.clipboard.writeText(checkinUrl).then(function () {
        var btn = document.getElementById('partner-qr-copy');
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = 'Copy link'; }, 2000);
      });
    };

    document.getElementById('partner-qr-overlay').classList.remove('hidden');
  }

  function closeQR() {
    document.getElementById('partner-qr-overlay').classList.add('hidden');
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------
  function confirmDelete(id, row) {
    if (!confirm('Delete this partner? This cannot be undone.')) return;
    col.doc(id).delete()
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#partners-table-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadPartners('all');
      })
      .catch(function (err) {
        console.error('[partners] delete:', err.message);
        alert('Failed to delete partner. Please try again.');
      });
  }

  // ---------------------------------------------------------------------------
  // Modal HTML — form
  // ---------------------------------------------------------------------------
  function buildFormModal() {
    var catOpts = CATEGORIES.map(function (c) {
      return '<option value="' + c + '">' + capitalise(c) + '</option>';
    }).join('');

    return [
      '<div id="partner-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-lg">',
          '<div class="modal-header">',
            '<h3 id="partner-modal-title" class="modal-title">Add Partner</h3>',
            '<button id="partner-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="partner-form" class="modal-form" novalidate>',
            '<div class="form-grid">',
              '<div class="field field-full">',
                '<label>Business Name <span class="required">*</span></label>',
                '<input type="text" name="name" placeholder="e.g. Cantina La Paloma" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Category</label>',
                '<select name="category">' + catOpts + '</select>',
              '</div>',
              '<div class="field">',
                '<label>City</label>',
                '<input type="text" name="city" placeholder="e.g. Mexico City" autocomplete="off">',
              '</div>',
              '<div class="field field-full">',
                '<label>Address</label>',
                '<input type="text" name="address" placeholder="Street address" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Latitude <span style="font-size:0.75rem;color:var(--color-text-muted)">(for map pin)</span></label>',
                '<input type="number" name="lat" step="any" placeholder="e.g. 19.4326" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Longitude <span style="font-size:0.75rem;color:var(--color-text-muted)">(for map pin)</span></label>',
                '<input type="number" name="lng" step="any" placeholder="e.g. -99.1332" autocomplete="off">',
              '</div>',
              '<div class="field field-full">',
                '<label>Discount / Offer for Amig0 Travelers</label>',
                '<input type="text" name="discount" placeholder="e.g. 15% off all orders · Free welcome drink · Priority seating" autocomplete="off">',
              '</div>',
              '<div class="field field-full">',
                '<label>Description</label>',
                '<textarea name="description" placeholder="Brief description of the business for the traveler map…" rows="2"></textarea>',
              '</div>',
              '<div class="field">',
                '<label>Contact Name</label>',
                '<input type="text" name="contactName" placeholder="Manager or owner name" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Email</label>',
                '<input type="email" name="email" placeholder="contact@business.com" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Phone</label>',
                '<input type="tel" name="phone" placeholder="+52 55 0000 0000" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Status</label>',
                '<select name="active">',
                  '<option value="true">Active</option>',
                  '<option value="false">Inactive</option>',
                '</select>',
              '</div>',
            '</div>',
            '<p id="partner-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'partner-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="partner-save-btn">Save Partner</button>',
            '</div>',
          '</form>',
        '</div>',
      '</div>'
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Modal HTML — QR viewer
  // ---------------------------------------------------------------------------
  function buildQRModal() {
    return [
      '<div id="partner-qr-overlay" class="modal-overlay hidden">',
        '<div class="modal" style="max-width:420px;text-align:center">',
          '<div class="modal-header">',
            '<h3 class="modal-title">Partner QR Code</h3>',
            '<button id="partner-qr-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<div style="padding:var(--space-6)">',
            '<p style="font-size:0.8rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:var(--space-2)">Verified Amig0 Partner</p>',
            '<p id="partner-qr-name" style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--color-text);margin-bottom:var(--space-6)"></p>',
            '<img id="partner-qr-img" src="" alt="" style="width:240px;height:240px;border:1px solid var(--color-border);border-radius:var(--radius-md);display:block;margin:0 auto var(--space-5)">',
            '<p style="font-size:0.75rem;color:var(--color-text-muted);margin-bottom:var(--space-4)">Token: <code id="partner-qr-token" style="font-family:monospace;background:var(--color-bg);padding:2px 6px;border-radius:4px"></code></p>',
            '<div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-4)">',
              '<input id="partner-qr-link" type="text" readonly style="flex:1;font-size:0.8rem;color:var(--color-text-secondary);background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-2) var(--space-3)">',
              '<button id="partner-qr-copy" class="btn btn-ghost" style="white-space:nowrap;font-size:0.8rem">Copy link</button>',
            '</div>',
            '<a id="partner-qr-download" href="" download="" class="btn btn-primary" style="display:inline-flex">Download QR</a>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function generateToken() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    var token = '';
    for (var i = 0; i < 16; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  function showFormError(msg) { var el = document.getElementById('partner-form-error'); if (el) el.textContent = msg; }
  function clearFormError()   { var el = document.getElementById('partner-form-error'); if (el) el.textContent = ''; }
  function capitalise(s)      { return s.charAt(0).toUpperCase() + s.slice(1); }

  function catClass(cat) {
    var map = {
      restaurant: 'success', bar: 'warning', transport: 'info',
      experience: 'success', shop: 'neutral', accommodation: 'info', other: 'neutral'
    };
    return map[cat] || 'neutral';
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
