// partners.js — amig0 | OCTech Services
// Partners module: verified merchant network — restaurants, bars, transport, experiences
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db  = firebase.firestore();
  var col = db.collection('partners');

  var CATEGORIES     = ['restaurant', 'bar', 'brewery', 'cafe', 'transport', 'experience', 'shop', 'accommodation', 'other'];
  var AFFILIATE_COL  = db.collection('affiliates');
  var REG_COL        = db.collection('affiliate_registrations');

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
      buildDealsQRModal(),
      '<div id="affiliate-regs-section" class="module" style="margin-top:var(--space-6)">',
        '<div class="module-header"><h3 class="module-title">Affiliate Registrations</h3></div>',
        '<div class="card"><div id="regs-table-wrap"><p class="empty-state">Loading…</p></div></div>',
      '</div>',
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
    document.getElementById('deals-qr-close').addEventListener('click', closeDealsQR);
    document.getElementById('deals-qr-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeDealsQR();
    });

    initKitHandlers();

    container.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        loadPartners(btn.getAttribute('data-cat'));
      });
    });

    loadPartners('all');
    loadRegistrations();
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
          var affLabel = d.affiliateStatus === 'active'
            ? '<span class="badge badge-info" style="margin-left:4px">Affiliate</span>'
            : d.affiliateStatus === 'pending'
              ? '<span class="badge badge-warning" style="margin-left:4px">Pending</span>'
              : '';
          return [
            '<tr>',
              '<td class="td-primary">' + esc(d.name || '—') + '</td>',
              '<td><span class="badge badge-' + catClass(d.category) + '">' + esc(d.category || '—') + '</span></td>',
              '<td>' + esc(d.city || '—') + '</td>',
              '<td class="td-discount">' + esc(d.discount || '—') + '</td>',
              '<td>' + esc(d.contactName || '—') + '</td>',
              '<td>' + activeLabel + affLabel + '</td>',
              '<td class="td-actions">',
                '<button class="btn-table-action btn-table-pay" data-action="qr" data-id="' + doc.id + '" data-name="' + esc(d.name || '') + '" data-token="' + esc(d.qrToken || '') + '">QR Code</button>',
                (d.affiliateStatus === 'active' ? '<button class="btn-table-action" data-action="deals-qr" data-id="' + doc.id + '" data-name="' + esc(d.name || '') + '" data-offer="' + esc(d.discount || '') + '">Deals QR</button>' : ''),
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
            } else if (action === 'deals-qr') {
              openDealsQR(id, btn.getAttribute('data-name'), btn.getAttribute('data-offer') || '');
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
      form.elements['active'].value           = data.active !== false ? 'true' : 'false';
      form.elements['affiliateStatus'].value  = data.affiliateStatus || '';
      form.elements['lat'].value         = data.lat != null ? data.lat : '';
      form.elements['lng'].value         = data.lng != null ? data.lng : '';
      form.dataset.editId  = data._id;
      form.dataset.qrToken = data.qrToken || '';
    } else {
      form.elements['category'].value        = 'restaurant';
      form.elements['active'].value          = 'true';
      form.elements['affiliateStatus'].value = '';
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

    var affStatus = form.elements['affiliateStatus'].value || null;
    var payload = {
      name:            form.elements['name'].value.trim(),
      category:        form.elements['category'].value || 'restaurant',
      address:         form.elements['address'].value.trim(),
      city:            form.elements['city'].value.trim(),
      contactName:     form.elements['contactName'].value.trim(),
      email:           form.elements['email'].value.trim(),
      phone:           form.elements['phone'].value.trim(),
      discount:        form.elements['discount'].value.trim(),
      description:     form.elements['description'].value.trim(),
      active:          form.elements['active'].value === 'true',
      affiliateStatus: affStatus,
      lat:             form.elements['lat'].value !== '' ? parseFloat(form.elements['lat'].value) : null,
      lng:             form.elements['lng'].value !== '' ? parseFloat(form.elements['lng'].value) : null,
      qrToken:         token,
      updatedAt:       firebase.firestore.FieldValue.serverTimestamp()
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

    op.then(function (ref) {
      // Sync to public affiliates collection when status is active
      var partnerId = editId || (ref && ref.id) || null;
      if (affStatus === 'active' && partnerId) {
        var affPayload = {
          name:        payload.name,
          category:    payload.category,
          city:        payload.city,
          offer:       payload.discount,
          lat:         payload.lat,
          lng:         payload.lng,
          active:      payload.active,
          updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
        };
        AFFILIATE_COL.doc(partnerId).set(affPayload, { merge: true })
          .catch(function (e) { console.error('[partners] affiliate sync:', e.message); });
      } else if ((affStatus !== 'active') && partnerId) {
        // Deactivate from public list if affiliate status removed
        AFFILIATE_COL.doc(partnerId).set({ active: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
          .catch(function () {});
      }
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
  // Deals QR + Media Kit modal (2-tab)
  // ---------------------------------------------------------------------------
  var _kitParams = null; // { id, name, offer, dealsUrl, logoImg }

  function openDealsQR(id, name, offer) {
    var dealsUrl = HOSTING_URL + '/deals.html?v=' + encodeURIComponent(id);
    var qrSrc    = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=' + encodeURIComponent(dealsUrl);

    _kitParams = { id: id, name: name || '', offer: offer || '', dealsUrl: dealsUrl, logoImg: null };

    // Tab 1: QR
    document.getElementById('deals-qr-name').textContent  = name || 'Affiliate';
    document.getElementById('deals-qr-img').src           = qrSrc;
    document.getElementById('deals-qr-download').href     = qrSrc;
    document.getElementById('deals-qr-download').download = slugify(name) + '-deals-qr.png';
    document.getElementById('deals-qr-link').value        = dealsUrl;
    document.getElementById('deals-qr-copy').onclick = function () {
      navigator.clipboard.writeText(dealsUrl).then(function () {
        var b = document.getElementById('deals-qr-copy');
        b.textContent = 'Copied!';
        setTimeout(function () { b.textContent = 'Copy link'; }, 2000);
      });
    };

    // Tab 2: Kit — reset state
    document.getElementById('kit-logo-preview').style.display = 'none';
    document.getElementById('kit-logo-placeholder').style.display = 'flex';
    document.getElementById('kit-clear-logo').style.display = 'none';
    document.getElementById('kit-downloads').style.display  = 'none';
    document.getElementById('kit-logo-input').value = '';
    document.getElementById('kit-caption-wrap').style.display = 'none';
    _kitParams.logoImg = null;

    // Caption template
    document.getElementById('kit-caption-text').value =
      'We just joined @amig0trips — the local travel pass for smart explorers.\n\n' +
      'Show up to ' + (name || 'us') + ' and get ' + (offer || 'your exclusive deal') + ' when you scan our table QR with your amig0 pass.\n\n' +
      'Get access → amig0.com\n\n' +
      '#amig0trips #localdeals #travel';

    switchKitTab('qr');
    document.getElementById('deals-qr-overlay').classList.remove('hidden');
  }

  function closeDealsQR() {
    document.getElementById('deals-qr-overlay').classList.add('hidden');
  }

  function switchKitTab(tab) {
    ['qr', 'kit'].forEach(function (t) {
      document.getElementById('dqr-panel-' + t).style.display = t === tab ? '' : 'none';
      var btn = document.getElementById('dqr-tab-' + t);
      if (btn) btn.style.fontWeight = t === tab ? '700' : '500';
      if (btn) btn.style.borderBottomColor = t === tab ? 'var(--color-primary)' : 'transparent';
      if (btn) btn.style.color = t === tab ? 'var(--color-text)' : 'var(--color-text-secondary)';
    });
  }

  function buildDealsQRModal() {
    return [
      '<div id="deals-qr-overlay" class="modal-overlay hidden">',
        '<div class="modal" style="max-width:480px">',
          '<div class="modal-header">',
            '<h3 class="modal-title">Affiliate Tools</h3>',
            '<button id="deals-qr-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',

          // Tab bar
          '<div style="display:flex;border-bottom:1px solid var(--color-border);padding:0 var(--space-4)">',
            '<button id="dqr-tab-qr" onclick="window._switchKitTab(\'qr\')" style="background:none;border:none;border-bottom:2px solid var(--color-primary);color:var(--color-text);font-weight:700;font-size:0.82rem;padding:var(--space-2) var(--space-3) var(--space-3);cursor:pointer;font-family:inherit">QR Code</button>',
            '<button id="dqr-tab-kit" onclick="window._switchKitTab(\'kit\')" style="background:none;border:none;border-bottom:2px solid transparent;color:var(--color-text-secondary);font-weight:500;font-size:0.82rem;padding:var(--space-2) var(--space-3) var(--space-3);cursor:pointer;font-family:inherit">Media Kit</button>',
          '</div>',

          // Panel 1: QR
          '<div id="dqr-panel-qr" style="padding:var(--space-6);text-align:center">',
            '<p style="font-size:0.75rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:var(--space-2)">amig0 Affiliate</p>',
            '<p id="deals-qr-name" style="font-family:var(--font-display);font-size:1.2rem;font-weight:700;color:var(--color-text);margin-bottom:var(--space-4)"></p>',
            '<img id="deals-qr-img" src="" alt="" style="width:220px;height:220px;border:1px solid var(--color-border);border-radius:var(--radius-md);display:block;margin:0 auto var(--space-4)">',
            '<p style="font-size:0.75rem;color:var(--color-text-muted);margin-bottom:var(--space-4)">Place this QR at tables, windows and menus. Users scan to discover their deal and join amig0.</p>',
            '<div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-4)">',
              '<input id="deals-qr-link" type="text" readonly style="flex:1;font-size:0.78rem;background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-2) var(--space-3);color:var(--color-text-secondary)">',
              '<button id="deals-qr-copy" class="btn btn-ghost" style="white-space:nowrap;font-size:0.8rem">Copy link</button>',
            '</div>',
            '<a id="deals-qr-download" href="" download="" class="btn btn-primary" style="display:inline-flex">Download QR</a>',
          '</div>',

          // Panel 2: Media Kit
          '<div id="dqr-panel-kit" style="display:none;padding:var(--space-5)">',

            // Logo upload
            '<p style="font-size:0.78rem;font-weight:600;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:var(--space-2)">Logo (optional)</p>',
            '<div id="kit-upload-area" style="border:1.5px dashed var(--color-border);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);cursor:pointer;transition:border-color 0.15s" onclick="document.getElementById(\'kit-logo-input\').click()">',
              '<input type="file" id="kit-logo-input" accept="image/*" style="display:none">',
              '<div id="kit-logo-placeholder" style="display:flex;flex-direction:column;align-items:center;gap:var(--space-2)">',
                '<svg width="24" height="24" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 15 5-5 4 4 3-3 6 6"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>',
                '<span style="font-size:0.82rem;color:var(--color-text-muted)">Click to upload logo</span>',
                '<span style="font-size:0.72rem;color:var(--color-text-muted)">PNG or JPG — appears on all kit assets</span>',
              '</div>',
              '<img id="kit-logo-preview" style="display:none;max-height:64px;max-width:100%;margin:0 auto;display:none;border-radius:4px">',
            '</div>',
            '<button id="kit-clear-logo" style="display:none;background:none;border:none;color:var(--color-text-muted);font-size:0.78rem;cursor:pointer;font-family:inherit;margin-bottom:var(--space-3)">✕ Remove logo</button>',

            // Generate
            '<button id="kit-generate-btn" class="btn btn-primary" style="width:100%;margin-bottom:var(--space-4)">Generate media kit</button>',

            // Downloads
            '<div id="kit-downloads" style="display:none">',
              '<div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-4)">',
                kitDlRow('kit-dl-table', 'Table Card', '3.5"×5" · Print and place on tables, menus, counters'),
                kitDlRow('kit-dl-badge', 'Window Badge', 'Square · Print as sticker for door or window'),
                kitDlRow('kit-dl-story', 'IG Story', '1080×1920 · Post to announce your affiliation'),
              '</div>',

              // Caption template
              '<div id="kit-caption-wrap" style="display:none">',
                '<p style="font-size:0.75rem;font-weight:600;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:var(--space-2)">Caption template</p>',
                '<textarea id="kit-caption-text" readonly rows="5" style="width:100%;background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-sm);color:var(--color-text-secondary);font-family:inherit;font-size:0.78rem;padding:var(--space-3);resize:none;line-height:1.55"></textarea>',
                '<button id="kit-caption-copy" class="btn btn-ghost" style="width:100%;margin-top:var(--space-2);font-size:0.8rem">Copy caption</button>',
              '</div>',
            '</div>',

            // Hidden canvases
            '<canvas id="kit-canvas-table" style="display:none"></canvas>',
            '<canvas id="kit-canvas-badge" style="display:none"></canvas>',
            '<canvas id="kit-canvas-story" style="display:none"></canvas>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function kitDlRow(id, label, desc) {
    return [
      '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-3) var(--space-4);gap:var(--space-3)">',
        '<div>',
          '<div style="font-size:0.84rem;font-weight:600;color:var(--color-text)">' + label + '</div>',
          '<div style="font-size:0.72rem;color:var(--color-text-muted)">' + desc + '</div>',
        '</div>',
        '<a id="' + id + '" href="#" download="" class="btn btn-ghost" style="font-size:0.8rem;white-space:nowrap">Download</a>',
      '</div>'
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Kit canvas generation
  // ---------------------------------------------------------------------------
  function initKitHandlers() {
    // Expose tab switch globally (called from inline onclick)
    window._switchKitTab = switchKitTab;

    // Logo input
    document.getElementById('kit-logo-input').addEventListener('change', function () {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          _kitParams.logoImg = img;
          var preview = document.getElementById('kit-logo-preview');
          preview.src = e.target.result;
          preview.style.display = 'block';
          document.getElementById('kit-logo-placeholder').style.display = 'none';
          document.getElementById('kit-clear-logo').style.display = 'inline-block';
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });

    // Clear logo
    document.getElementById('kit-clear-logo').addEventListener('click', function (e) {
      e.stopPropagation();
      _kitParams.logoImg = null;
      document.getElementById('kit-logo-input').value = '';
      document.getElementById('kit-logo-preview').style.display = 'none';
      document.getElementById('kit-logo-placeholder').style.display = 'flex';
      document.getElementById('kit-clear-logo').style.display = 'none';
    });

    // Generate
    document.getElementById('kit-generate-btn').addEventListener('click', function () {
      if (!_kitParams) return;
      var btn = this;
      btn.disabled = true; btn.textContent = 'Generating…';

      QRCode.toDataURL(_kitParams.dealsUrl, { width: 400, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
        .then(function (qrDataUrl) {
          var qrImg = new Image();
          qrImg.onload = function () {
            kitRenderTableCard(_kitParams, qrImg);
            kitRenderWindowBadge(_kitParams, qrImg);
            kitRenderSocialStory(_kitParams, qrImg);
            document.getElementById('kit-downloads').style.display = 'block';
            document.getElementById('kit-caption-wrap').style.display = 'block';
            btn.disabled = false; btn.textContent = 'Regenerate kit';
          };
          qrImg.src = qrDataUrl;
        })
        .catch(function (err) {
          console.error('[kit] QR generate:', err);
          btn.disabled = false; btn.textContent = 'Generate media kit';
          alert('Failed to generate QR. Please try again.');
        });
    });

    // Copy caption
    document.getElementById('kit-caption-copy').addEventListener('click', function () {
      var text = document.getElementById('kit-caption-text').value;
      navigator.clipboard.writeText(text).then(function () {
        var b = document.getElementById('kit-caption-copy');
        b.textContent = 'Copied!';
        setTimeout(function () { b.textContent = 'Copy caption'; }, 2000);
      });
    });
  }

  function kitRenderTableCard(p, qrImg) {
    var W = 1050, H = 1500;
    var cv = document.getElementById('kit-canvas-table');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    // Background
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, W, H);

    // Header gradient bar
    var grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#4f46e5'); grad.addColorStop(1, '#818cf8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 130);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('amig0', 48, 65);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '500 26px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('affiliate', W - 48, 65);

    var curY = 220;

    // Logo
    if (p.logoImg) {
      var lr = Math.min(280 / p.logoImg.naturalWidth, 100 / p.logoImg.naturalHeight);
      var lW = p.logoImg.naturalWidth * lr, lH = p.logoImg.naturalHeight * lr;
      ctx.drawImage(p.logoImg, (W - lW) / 2, curY, lW, lH);
      curY += lH + 36;
    }

    // Venue name
    ctx.fillStyle = '#fafafa';
    ctx.font = 'bold 68px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    curY = kitWrapText(ctx, p.name || '', W / 2, curY, W - 120, 80) + 40;

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(100, curY); ctx.lineTo(W - 100, curY); ctx.stroke();
    curY += 48;

    // Deal offer
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 46px -apple-system, system-ui, sans-serif';
    curY = kitWrapText(ctx, p.offer || '', W / 2, curY, W - 160, 58) + 60;

    // QR code
    var qrS = 360, qrX = (W - qrS) / 2, qrY = Math.max(curY, 880);
    ctx.fillStyle = '#ffffff';
    kitRoundRect(ctx, qrX - 20, qrY - 20, qrS + 40, qrS + 40, 18); ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, qrS, qrS);

    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.font = '500 28px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Scan to claim your deal', W / 2, qrY + qrS + 32);

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '400 22px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText('amig0.com  ·  @amig0trips', W / 2, H - 40);

    var a = document.getElementById('kit-dl-table');
    a.href = cv.toDataURL('image/png');
    a.download = slugify(p.name) + '-table-card.png';
  }

  function kitRenderWindowBadge(p, qrImg) {
    var W = 1080, H = 1080;
    var cv = document.getElementById('kit-canvas-badge');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, W, H);

    // amig0 wordmark
    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 80px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('amig0', W / 2, 72);

    var curY = 200;

    // Logo
    if (p.logoImg) {
      var lr = Math.min(320 / p.logoImg.naturalWidth, 140 / p.logoImg.naturalHeight);
      var lW = p.logoImg.naturalWidth * lr, lH = p.logoImg.naturalHeight * lr;
      ctx.drawImage(p.logoImg, (W - lW) / 2, curY, lW, lH);
      curY += lH + 28;
    }

    // Venue name
    ctx.fillStyle = '#fafafa';
    ctx.font = 'bold 72px -apple-system, system-ui, sans-serif';
    curY = kitWrapText(ctx, p.name || '', W / 2, curY, W - 120, 86) + 32;

    // Affiliate pill
    ctx.fillStyle = 'rgba(129,140,248,0.12)';
    var pw = 300, ph = 54, px = (W - pw) / 2;
    kitRoundRect(ctx, px, curY, pw, ph, 27); ctx.fill();
    ctx.strokeStyle = 'rgba(129,140,248,0.35)'; ctx.lineWidth = 1.5;
    kitRoundRect(ctx, px, curY, pw, ph, 27); ctx.stroke();
    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 26px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('amig0 affiliate', W / 2, curY + ph / 2);
    curY += ph + 36;

    // QR
    var qrS = 260, qrX = (W - qrS) / 2, qrY = Math.max(curY, 700);
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'top';
    kitRoundRect(ctx, qrX - 14, qrY - 14, qrS + 28, qrS + 28, 12); ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, qrS, qrS);

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '500 28px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Scan for your deal', W / 2, qrY + qrS + 24);

    var a = document.getElementById('kit-dl-badge');
    a.href = cv.toDataURL('image/png');
    a.download = slugify(p.name) + '-window-badge.png';
  }

  function kitRenderSocialStory(p, qrImg) {
    var W = 1080, H = 1920;
    var cv = document.getElementById('kit-canvas-story');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0d0d10'); grad.addColorStop(1, '#09090b');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    // Top handle
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '500 34px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('@amig0trips', W / 2, 80);

    // amig0 wordmark
    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 100px -apple-system, system-ui, sans-serif';
    ctx.fillText('amig0', W / 2, 160);

    var curY = 330;

    // Logo
    if (p.logoImg) {
      var lr = Math.min(400 / p.logoImg.naturalWidth, 200 / p.logoImg.naturalHeight);
      var lW = p.logoImg.naturalWidth * lr, lH = p.logoImg.naturalHeight * lr;
      ctx.drawImage(p.logoImg, (W - lW) / 2, curY, lW, lH);
      curY += lH + 56;
    } else {
      curY += 40;
    }

    // Headline
    ctx.fillStyle = '#fafafa';
    ctx.font = 'bold 96px -apple-system, system-ui, sans-serif';
    curY = kitWrapText(ctx, 'We just joined amig0.', W / 2, curY, W - 120, 114) + 36;

    // Venue name
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '600 52px -apple-system, system-ui, sans-serif';
    ctx.fillText(p.name || '', W / 2, curY);
    curY += 80;

    // Offer
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 58px -apple-system, system-ui, sans-serif';
    curY = kitWrapText(ctx, p.offer || '', W / 2, curY, W - 120, 72) + 56;

    // QR
    var qrS = 340, qrX = (W - qrS) / 2, qrY = Math.max(curY, 1340);
    ctx.fillStyle = '#ffffff';
    kitRoundRect(ctx, qrX - 20, qrY - 20, qrS + 40, qrS + 40, 20); ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, qrS, qrS);

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '500 36px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Scan to claim your deal', W / 2, qrY + qrS + 30);

    // Hashtags
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '400 28px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText('#amig0trips  #localdeals', W / 2, H - 60);

    var a = document.getElementById('kit-dl-story');
    a.href = cv.toDataURL('image/png');
    a.download = slugify(p.name) + '-ig-story.png';
  }

  // Canvas helpers
  function kitWrapText(ctx, text, x, y, maxW, lineH) {
    var words = text.split(' '), line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i] + ' ';
      if (ctx.measureText(test).width > maxW && i > 0) {
        ctx.fillText(line.trim(), x, y); line = words[i] + ' '; y += lineH;
      } else { line = test; }
    }
    ctx.fillText(line.trim(), x, y);
    return y;
  }

  function kitRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function slugify(s) { return (s || 'affiliate').replace(/\s+/g, '-').toLowerCase(); }

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
              '<div class="field">',
                '<label>Affiliate Status</label>',
                '<select name="affiliateStatus">',
                  '<option value="">Not an affiliate</option>',
                  '<option value="pending">Pending review</option>',
                  '<option value="active">Active affiliate</option>',
                  '<option value="inactive">Inactive affiliate</option>',
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
  // Affiliate Registrations
  // ---------------------------------------------------------------------------
  function loadRegistrations() {
    var wrap = document.getElementById('regs-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<p class="empty-state">Loading…</p>';

    REG_COL.orderBy('submittedAt', 'desc').limit(50).get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No affiliate registrations yet.</p>';
          return;
        }
        var rows = snap.docs.map(function (doc) {
          var d = doc.data();
          var statusBadge = d.status === 'approved'
            ? '<span class="badge badge-success">Approved</span>'
            : d.status === 'rejected'
              ? '<span class="badge badge-neutral">Rejected</span>'
              : '<span class="badge badge-warning">Pending</span>';
          var actions = d.status === 'pending'
            ? '<button class="btn-table-action btn-table-pay" data-action="approve" data-id="' + doc.id + '" data-name="' + esc(d.businessName || '') + '" data-city="' + esc(d.city || '') + '" data-cat="' + esc(d.category || '') + '" data-offer="' + esc(d.dealOffer || '') + '" data-lat="" data-lng="">Approve</button>' +
              '<button class="btn-table-action btn-table-danger" data-action="reject" data-id="' + doc.id + '">Reject</button>'
            : '';
          return [
            '<tr>',
              '<td class="td-primary">' + esc(d.businessName || '—') + '</td>',
              '<td>' + esc(d.category || '—') + '</td>',
              '<td>' + esc(d.city || '—') + '</td>',
              '<td>' + esc(d.dealOffer || '—') + '</td>',
              '<td>' + esc(d.contactName || '—') + '</td>',
              '<td>' + esc(d.email || '—') + '</td>',
              '<td>' + statusBadge + '</td>',
              '<td class="td-actions">' + actions + '</td>',
            '</tr>'
          ].join('');
        });

        wrap.innerHTML = [
          '<table class="data-table">',
            '<thead><tr>',
              '<th>Business</th><th>Category</th><th>City</th><th>Deal Offer</th><th>Contact</th><th>Email</th><th>Status</th><th></th>',
            '</tr></thead>',
            '<tbody>' + rows.join('') + '</tbody>',
          '</table>'
        ].join('');

        wrap.querySelectorAll('[data-action]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id     = btn.getAttribute('data-id');
            var action = btn.getAttribute('data-action');
            if (action === 'approve') {
              approveRegistration(id, {
                name:     btn.getAttribute('data-name'),
                city:     btn.getAttribute('data-city'),
                category: btn.getAttribute('data-cat'),
                offer:    btn.getAttribute('data-offer')
              }, btn.closest('tr'));
            } else {
              rejectRegistration(id, btn.closest('tr'));
            }
          });
        });
      })
      .catch(function (err) {
        console.error('[partners] registrations:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load registrations.</p>';
      });
  }

  function approveRegistration(id, data, row) {
    if (!confirm('Approve "' + data.name + '" as an affiliate? This will add them to the public deals map.')) return;
    var batch = db.batch();

    // Create affiliates doc (public)
    var affRef = AFFILIATE_COL.doc(id);
    batch.set(affRef, {
      name:      data.name,
      category:  data.category,
      city:      data.city,
      offer:     data.offer,
      lat:       null,
      lng:       null,
      active:    true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Update registration status
    batch.update(REG_COL.doc(id), {
      status:     'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    batch.commit()
      .then(function () {
        if (row) row.querySelector('td:nth-last-child(2)').innerHTML = '<span class="badge badge-success">Approved</span>';
        if (row) row.querySelector('td:last-child').innerHTML = '';
        alert('"' + data.name + '" is now live on the deals map. Add their coordinates in the Partners tab for a map pin.');
      })
      .catch(function (err) {
        console.error('[partners] approve:', err.message);
        alert('Failed to approve. Please try again.');
      });
  }

  function rejectRegistration(id, row) {
    if (!confirm('Reject this application?')) return;
    REG_COL.doc(id).update({ status: 'rejected', rejectedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function () {
        if (row) row.querySelector('td:nth-last-child(2)').innerHTML = '<span class="badge badge-neutral">Rejected</span>';
        if (row) row.querySelector('td:last-child').innerHTML = '';
      })
      .catch(function (err) {
        console.error('[partners] reject:', err.message);
        alert('Failed to reject. Please try again.');
      });
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
