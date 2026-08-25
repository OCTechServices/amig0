// briefings.js — amig0 | OCTech Services
// Briefings module: guide, client, and internal documents linked to tours
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db  = firebase.firestore();
  var col = db.collection('briefings');

  var TYPES = ['guide', 'client', 'internal'];

  var toursCache = {};

  window.Briefings = {
    render: render
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">' + cfg('briefings') + '</h3>',
          '<button class="btn btn-primary" id="add-briefing-btn">+ New ' + cfg('briefing') + '</button>',
        '</div>',
        '<div class="providers-filter">',
          '<button class="filter-btn active" data-type="all">All</button>',
          TYPES.map(function (t) {
            return '<button class="filter-btn" data-type="' + t + '">' + capitalise(t) + '</button>';
          }).join(''),
        '</div>',
        '<div id="briefings-list"></div>',
      '</div>',
      buildModal(),
    ].join('');

    document.getElementById('add-briefing-btn').addEventListener('click', function () { openModal(null); });
    document.getElementById('briefing-modal-close').addEventListener('click', closeModal);
    document.getElementById('briefing-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('briefing-form').addEventListener('submit', handleSubmit);

    container.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        loadBriefings(btn.getAttribute('data-type'));
      });
    });

    loadToursCache().then(function () { loadBriefings('all'); });
  }

  // -------------------------------------------------------------------------
  // Cache
  // -------------------------------------------------------------------------
  function loadToursCache() {
    return db.collection('tours').orderBy('name').get()
      .then(function (snap) {
        toursCache = {};
        snap.forEach(function (doc) { toursCache[doc.id] = doc.data().name || 'Unnamed'; });
      })
      .catch(function (err) { console.error('[briefings] tours cache:', err.message); });
  }

  // -------------------------------------------------------------------------
  // Load & render cards
  // -------------------------------------------------------------------------
  function loadBriefings(typeFilter) {
    var list = document.getElementById('briefings-list');
    if (!list) return;
    list.innerHTML = '<p class="empty-state">Loading…</p>';

    var query = typeFilter && typeFilter !== 'all'
      ? col.where('type', '==', typeFilter).orderBy('createdAt', 'desc')
      : col.orderBy('createdAt', 'desc');

    query.get()
      .then(function (snap) {
        if (snap.empty) {
          list.innerHTML = '<p class="empty-state">No briefings' +
            (typeFilter !== 'all' ? ' of type "' + typeFilter + '"' : '') + '. Create one to get started.</p>';
          return;
        }

        var cards = snap.docs.map(function (doc) {
          var d        = doc.data();
          var tourName = d.tourId ? (toursCache[d.tourId] || 'Unknown tour') : 'No tour';
          var updated  = d.updatedAt ? formatDate(d.updatedAt.toDate()) : '—';
          var preview  = (d.content || '').slice(0, 160).replace(/\n/g, ' ');
          if (d.content && d.content.length > 160) preview += '…';

          return [
            '<div class="briefing-card">',
              '<div class="briefing-card-header">',
                '<div>',
                  '<h4 class="briefing-title">' + esc(d.title || 'Untitled') + '</h4>',
                  '<span class="briefing-meta">' + esc(tourName) + ' · Updated ' + updated + '</span>',
                '</div>',
                '<div class="briefing-card-actions">',
                  '<span class="badge badge-' + typeClass(d.type) + '">' + esc(d.type || '—') + '</span>',
                  '<button class="btn-table-action" data-action="edit" data-id="' + doc.id + '">Edit</button>',
                  '<button class="btn-table-action btn-table-danger" data-action="delete" data-id="' + doc.id + '">Delete</button>',
                '</div>',
              '</div>',
              preview ? '<p class="briefing-preview">' + esc(preview) + '</p>' : '',
            '</div>'
          ].join('');
        });

        list.innerHTML = '<div class="briefings-grid">' + cards.join('') + '</div>';

        list.querySelectorAll('[data-action]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            if (btn.getAttribute('data-action') === 'edit') {
              loadAndOpenEdit(id);
            } else {
              confirmDelete(id, btn.closest('.briefing-card'));
            }
          });
        });
      })
      .catch(function (err) {
        console.error('[briefings] load:', err.message);
        list.innerHTML = '<p class="error-state">Failed to load briefings.</p>';
      });
  }

  // -------------------------------------------------------------------------
  // Modal
  // -------------------------------------------------------------------------
  function openModal(data) {
    var modal = document.getElementById('briefing-modal-overlay');
    var title = document.getElementById('briefing-modal-title');
    var form  = document.getElementById('briefing-form');

    title.textContent = data ? 'Edit ' + cfg('briefing') : 'New ' + cfg('briefing');
    form.reset();
    clearFormError();
    populateTourDropdown(form);

    if (data) {
      form.elements['title'].value   = data.title   || '';
      form.elements['type'].value    = data.type    || 'guide';
      form.elements['tourId'].value  = data.tourId  || '';
      form.elements['content'].value = data.content || '';
      form.dataset.editId = data._id;
    } else {
      form.elements['type'].value = 'guide';
      delete form.dataset.editId;
    }

    modal.classList.remove('hidden');
    form.elements['title'].focus();
  }

  function closeModal() {
    document.getElementById('briefing-modal-overlay').classList.add('hidden');
  }

  function loadAndOpenEdit(id) {
    col.doc(id).get()
      .then(function (doc) {
        if (!doc.exists) return;
        var data = doc.data();
        data._id = doc.id;
        openModal(data);
      })
      .catch(function (err) { console.error('[briefings] load for edit:', err.message); });
  }

  function populateTourDropdown(form) {
    var sel  = form.querySelector('[name="tourId"]');
    var opts = '<option value="">— No tour —</option>';
    Object.keys(toursCache).forEach(function (id) {
      opts += '<option value="' + id + '">' + esc(toursCache[id]) + '</option>';
    });
    sel.innerHTML = opts;
  }

  // -------------------------------------------------------------------------
  // Form submit
  // -------------------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    clearFormError();

    var form    = e.target;
    var editId  = form.dataset.editId;
    var saveBtn = document.getElementById('briefing-save-btn');

    if (!form.elements['title'].value.trim()) {
      showFormError('Title is required.');
      return;
    }
    if (!form.elements['content'].value.trim()) {
      showFormError('Content is required.');
      return;
    }

    var payload = {
      title:     form.elements['title'].value.trim(),
      type:      form.elements['type'].value || 'guide',
      tourId:    form.elements['tourId'].value || null,
      content:   form.elements['content'].value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
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
      var activeFilter = document.querySelector('.filter-btn.active');
      loadBriefings(activeFilter ? activeFilter.getAttribute('data-type') : 'all');
    })
    .catch(function (err) {
      console.error('[briefings] save:', err.message);
      showFormError('Failed to save. Please try again.');
    })
    .finally(function () {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save ' + cfg('briefing');
    });
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  function confirmDelete(id, card) {
    if (!confirm('Delete this ' + cfg('briefing').toLowerCase() + '? This cannot be undone.')) return;
    col.doc(id).delete()
      .then(function () {
        if (card) card.remove();
        var grid = document.querySelector('.briefings-grid');
        if (grid && !grid.hasChildNodes()) {
          var activeFilter = document.querySelector('.filter-btn.active');
          loadBriefings(activeFilter ? activeFilter.getAttribute('data-type') : 'all');
        }
      })
      .catch(function (err) {
        console.error('[briefings] delete:', err.message);
        alert('Failed to delete briefing. Please try again.');
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
      '<div id="briefing-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-lg">',
          '<div class="modal-header">',
            '<h3 id="briefing-modal-title" class="modal-title">New ' + cfg('briefing') + '</h3>',
            '<button id="briefing-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="briefing-form" class="modal-form" novalidate>',
            '<div class="form-grid">',
              '<div class="field field-full">',
                '<label>Title <span class="required">*</span></label>',
                '<input type="text" name="title" placeholder="e.g. Day 1 Guide Briefing — Lima" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Type</label>',
                '<select name="type">' + typeOpts + '</select>',
              '</div>',
              '<div class="field">',
                '<label>Tour</label>',
                '<select name="tourId"><option value="">Loading…</option></select>',
              '</div>',
            '</div>',
            '<div class="field">',
              '<label>Content <span class="required">*</span></label>',
              '<textarea name="content" id="briefing-content" placeholder="Write the briefing content here…" rows="12" style="font-family:var(--font-body);line-height:1.7"></textarea>',
            '</div>',
            '<p id="briefing-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'briefing-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="briefing-save-btn">Save ' + cfg('briefing') + '</button>',
            '</div>',
          '</form>',
        '</div>',
      '</div>'
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function showFormError(msg) { var el = document.getElementById('briefing-form-error'); if (el) el.textContent = msg; }
  function clearFormError()   { var el = document.getElementById('briefing-form-error'); if (el) el.textContent = ''; }
  function capitalise(s)      { return s.charAt(0).toUpperCase() + s.slice(1); }

  function typeClass(type) {
    var map = { guide: 'info', client: 'success', internal: 'neutral' };
    return map[type] || 'neutral';
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
