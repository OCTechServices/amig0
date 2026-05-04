// guides.js — amig0-travel-company | OCTech Services
// Guides module: list, add, edit, delete guides
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db          = firebase.firestore();
  var col         = db.collection('guides');
  var fnProvision = firebase.functions().httpsCallable('provisionGuide');

  window.Guides = { render: render };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">All ' + cfg('guides') + '</h3>',
          '<button class="btn btn-primary" id="add-guide-btn">+ ' + cfg('addGuide') + '</button>',
        '</div>',
        '<div class="card">',
          '<div id="guides-table-wrap">',
            '<p class="empty-state">Loading…</p>',
          '</div>',
        '</div>',
      '</div>',
      buildModal(),
    ].join('');

    document.getElementById('add-guide-btn').addEventListener('click', function () {
      openModal(null);
    });
    document.getElementById('guide-modal-close').addEventListener('click', closeModal);
    document.getElementById('guide-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('guide-form').addEventListener('submit', handleSubmit);

    loadGuides();
  }

  // -------------------------------------------------------------------------
  // Load & render table
  // -------------------------------------------------------------------------
  function loadGuides() {
    var wrap = document.getElementById('guides-table-wrap');
    if (!wrap) return;

    col.orderBy('createdAt', 'desc').get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No ' + cfg('guides').toLowerCase() + ' yet. Add your first ' + cfg('guide').toLowerCase() + ' to get started.</p>';
          return;
        }

        var rows = snap.docs.map(function (doc) {
          var d = doc.data();
          var name = [d.firstName, d.lastName].filter(Boolean).join(' ') || '—';
          return [
            '<tr>',
              '<td class="td-primary">' + esc(name) + '</td>',
              '<td>' + esc(d.email || '—') + '</td>',
              '<td>' + esc(d.phone || '—') + '</td>',
              '<td>' + esc(d.languages || '—') + '</td>',
              '<td>' + fmtRating(d.vetting) + '</td>',
              '<td>' + fmtVerified(d.verificationStatus) + '</td>',
              '<td><span class="badge badge-' + statusClass(d.status) + '">' + esc(d.status || 'active') + '</span></td>',
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
            '<thead><tr>',
              '<th>Name</th>',
              '<th>Email</th>',
              '<th>Phone</th>',
              '<th>Languages</th>',
              '<th>Rating</th>',
              '<th>Verified</th>',
              '<th>Status</th>',
              '<th>App Access</th>',
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
            } else if (action === 'provision') {
              provisionAppAccess(id, btn.getAttribute('data-uid'), btn);
            } else if (action === 'delete') {
              confirmDelete(id, btn.closest('tr'));
            }
          });
        });
      })
      .catch(function (err) {
        console.error('[guides] load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load guides. Check your connection and try again.</p>';
      });
  }

  // -------------------------------------------------------------------------
  // Modal
  // -------------------------------------------------------------------------
  function openModal(data) {
    var modal = document.getElementById('guide-modal-overlay');
    var title = document.getElementById('guide-modal-title');
    var form  = document.getElementById('guide-form');

    title.textContent = data ? 'Edit ' + cfg('guide') : 'Add ' + cfg('guide');
    form.reset();
    clearFormError();

    if (data) {
      form.elements['firstName'].value = data.firstName || '';
      form.elements['lastName'].value  = data.lastName  || '';
      form.elements['email'].value     = data.email     || '';
      form.elements['phone'].value     = data.phone     || '';
      form.elements['languages'].value = data.languages || '';
      form.elements['status'].value    = data.status    || 'active';
      form.elements['uid'].value       = data.uid       || '';
      form.elements['notes'].value     = data.notes     || '';
      var v = data.vetting || {};
      form.elements['vettingPlatform'].value    = v.platform    || '';
      form.elements['vettingRating'].value      = v.rating      || '';
      form.elements['vettingCount'].value       = v.reviewCount || '';
      form.elements['verificationStatus'].value = data.verificationStatus || 'pending';
      form.dataset.screenshotUrl = v.screenshotUrl || '';
      var ssLink = document.getElementById('guide-screenshot-link');
      if (ssLink) ssLink.innerHTML = v.screenshotUrl
        ? '<a href="' + esc(v.screenshotUrl) + '" target="_blank" class="field-hint">View current screenshot ↗</a>'
        : '';
      form.dataset.editId = data._id;
    } else {
      form.elements['status'].value             = 'active';
      form.elements['verificationStatus'].value = 'pending';
      form.dataset.screenshotUrl = '';
      var ssLink = document.getElementById('guide-screenshot-link');
      if (ssLink) ssLink.innerHTML = '';
      delete form.dataset.editId;
    }

    modal.classList.remove('hidden');
    form.elements['firstName'].focus();
  }

  function closeModal() {
    document.getElementById('guide-modal-overlay').classList.add('hidden');
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
        console.error('[guides] load for edit:', err.message);
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
    var saveBtn = document.getElementById('guide-save-btn');

    if (!form.elements['firstName'].value.trim() && !form.elements['lastName'].value.trim()) {
      showFormError('First or last name is required.');
      return;
    }
    if (!form.elements['email'].value.trim()) {
      showFormError('Email is required.');
      return;
    }

    var platform  = form.elements['vettingPlatform'].value;
    var rating    = parseFloat(form.elements['vettingRating'].value) || null;
    var count     = parseInt(form.elements['vettingCount'].value, 10) || null;
    var verStatus = form.elements['verificationStatus'].value || 'pending';

    var payload = {
      firstName:          form.elements['firstName'].value.trim(),
      lastName:           form.elements['lastName'].value.trim(),
      email:              form.elements['email'].value.trim(),
      phone:              form.elements['phone'].value.trim(),
      languages:          form.elements['languages'].value.trim(),
      status:             form.elements['status'].value || 'active',
      uid:                form.elements['uid'].value.trim() || null,
      notes:              form.elements['notes'].value.trim(),
      verificationStatus: verStatus,
      vetting: {
        platform:      platform || null,
        rating:        rating,
        reviewCount:   count,
        screenshotUrl: form.dataset.screenshotUrl || null
      },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    function doSave(finalPayload) {
      var op;
      if (editId) {
        op = col.doc(editId).update(finalPayload);
      } else {
        finalPayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        op = col.add(finalPayload);
      }
      op.then(function () { closeModal(); loadGuides(); })
        .catch(function (err) {
          console.error('[guides] save:', err.message);
          showFormError('Failed to save. Please try again.');
        })
        .finally(function () {
          saveBtn.disabled    = false;
          saveBtn.textContent = 'Save ' + cfg('guide');
        });
    }

    var fileInput = form.querySelector('[name="screenshotFile"]');
    var file      = fileInput && fileInput.files[0];

    if (file) {
      saveBtn.textContent = 'Uploading…';
      var storageRef = firebase.storage().ref('vetting/guides/' + Date.now() + '_' + file.name);
      storageRef.put(file)
        .then(function () { return storageRef.getDownloadURL(); })
        .then(function (url) {
          payload.vetting.screenshotUrl = url;
          doSave(payload);
        })
        .catch(function (err) {
          console.error('[guides] screenshot upload:', err.message);
          showFormError('Screenshot upload failed. Save without a screenshot or check Storage settings.');
          saveBtn.disabled    = false;
          saveBtn.textContent = 'Save ' + cfg('guide');
        });
    } else {
      doSave(payload);
    }
  }

  // -------------------------------------------------------------------------
  // App provisioning
  // -------------------------------------------------------------------------
  function provisionAppAccess(guideId, uid, btn) {
    if (!uid) return;
    var original = btn.textContent;
    btn.disabled    = true;
    btn.textContent = 'Granting…';

    fnProvision({ guideId: guideId, uid: uid })
      .then(function () {
        btn.outerHTML = '<span class="badge badge-success">Active</span>';
      })
      .catch(function (err) {
        console.error('[guides] provision:', err.message);
        alert(err.message || 'Failed to grant access. Check the UID and try again.');
        btn.disabled    = false;
        btn.textContent = original;
      });
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  function confirmDelete(id, row) {
    if (!confirm('Delete this ' + cfg('guide').toLowerCase() + '? This cannot be undone.')) return;

    col.doc(id).delete()
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#guides-table-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadGuides();
      })
      .catch(function (err) {
        console.error('[guides] delete:', err.message);
        alert('Failed to delete guide. Please try again.');
      });
  }

  // -------------------------------------------------------------------------
  // Modal HTML
  // -------------------------------------------------------------------------
  function buildModal() {
    return [
      '<div id="guide-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-lg">',
          '<div class="modal-header">',
            '<h3 id="guide-modal-title" class="modal-title">Add ' + cfg('guide') + '</h3>',
            '<button id="guide-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="guide-form" class="modal-form" novalidate>',
            '<div class="form-grid">',
              '<div class="field">',
                '<label for="guide-first-name">First Name</label>',
                '<input type="text" id="guide-first-name" name="firstName" placeholder="First" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="guide-last-name">Last Name</label>',
                '<input type="text" id="guide-last-name" name="lastName" placeholder="Last" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="guide-email">Email <span class="required">*</span></label>',
                '<input type="email" id="guide-email" name="email" placeholder="guide@example.com" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="guide-phone">Phone</label>',
                '<input type="tel" id="guide-phone" name="phone" placeholder="+1 555 000 0000" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="guide-languages">Languages</label>',
                '<input type="text" id="guide-languages" name="languages" placeholder="e.g. English, Spanish" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label for="guide-status">Status</label>',
                '<select id="guide-status" name="status">',
                  '<option value="active">Active</option>',
                  '<option value="inactive">Inactive</option>',
                '</select>',
              '</div>',
            '</div>',
            '<div class="field">',
              '<label for="guide-uid">Firebase Auth UID <span class="field-hint">— paste from Firebase Console → Authentication → Users</span></label>',
              '<input type="text" id="guide-uid" name="uid" placeholder="e.g. abc123XYZ…" autocomplete="off" spellcheck="false">',
            '</div>',
            '<div class="field">',
              '<label for="guide-notes">Notes</label>',
              '<textarea id="guide-notes" name="notes" placeholder="Internal notes…" rows="3"></textarea>',
            '</div>',

            '<div class="vetting-section">',
              '<p class="vetting-section-label">Operator Vetting</p>',
              '<div class="form-grid">',
                '<div class="field">',
                  '<label>Platform</label>',
                  '<select name="vettingPlatform">',
                    '<option value="">— Not specified —</option>',
                    '<option value="uber">Uber</option>',
                    '<option value="cabify">Cabify</option>',
                    '<option value="getyourguide">GetYourGuide</option>',
                    '<option value="viator">Viator</option>',
                    '<option value="airbnb">Airbnb</option>',
                    '<option value="tripadvisor">TripAdvisor</option>',
                    '<option value="instagram">Instagram</option>',
                    '<option value="youtube">YouTube</option>',
                    '<option value="other">Other</option>',
                  '</select>',
                '</div>',
                '<div class="field">',
                  '<label>Rating ★</label>',
                  '<input type="number" name="vettingRating" placeholder="e.g. 4.9" min="1" max="5" step="0.1">',
                '</div>',
                '<div class="field">',
                  '<label>Review / Trip Count</label>',
                  '<input type="number" name="vettingCount" placeholder="e.g. 2400" min="0">',
                '</div>',
                '<div class="field">',
                  '<label>Verification Status</label>',
                  '<select name="verificationStatus">',
                    '<option value="pending">Pending</option>',
                    '<option value="verified">Verified ✓</option>',
                    '<option value="rejected">Rejected</option>',
                  '</select>',
                '</div>',
                '<div class="field field-full">',
                  '<label>Rating Screenshot</label>',
                  '<div id="guide-screenshot-link"></div>',
                  '<input type="file" name="screenshotFile" accept="image/*" style="margin-top:var(--space-1)">',
                  '<span class="field-hint">Upload a screenshot of their platform rating — stored securely</span>',
                '</div>',
              '</div>',
            '</div>',

            '<p id="guide-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'guide-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="guide-save-btn">Save ' + cfg('guide') + '</button>',
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
    var el = document.getElementById('guide-form-error');
    if (el) el.textContent = msg;
  }

  function clearFormError() {
    var el = document.getElementById('guide-form-error');
    if (el) el.textContent = '';
  }

  function statusClass(status) {
    return status === 'inactive' ? 'neutral' : 'success';
  }

  function fmtRating(vetting) {
    if (!vetting || !vetting.rating) return '—';
    return '<span class="vetting-rating">' + vetting.rating.toFixed(1) + '★</span>'
      + (vetting.platform ? '<span class="vetting-platform">' + esc(vetting.platform) + '</span>' : '');
  }

  function fmtVerified(status) {
    var map = { verified: 'badge-success', rejected: 'badge-error', pending: 'badge-neutral' };
    var s   = status || 'pending';
    return '<span class="badge ' + (map[s] || 'badge-neutral') + '">' + esc(s) + '</span>';
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
