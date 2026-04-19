// quotes.js — amig0-travel-company | OCTech Services
// Quotes module: list, add, edit, delete, dynamic line items, totals
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db  = firebase.firestore();
  var col = db.collection('quotes');

  var STATUSES   = ['draft', 'sent', 'accepted', 'declined', 'expired'];
  var CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN'];

  var clientsCache = {};
  var toursCache   = {};

  window.Quotes = {
    render: render
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">Quotes</h3>',
          '<button class="btn btn-primary" id="add-quote-btn">+ New Quote</button>',
        '</div>',
        '<div class="card">',
          '<div id="quotes-table-wrap"><p class="empty-state">Loading…</p></div>',
        '</div>',
      '</div>',
      buildModal(),
    ].join('');

    document.getElementById('add-quote-btn').addEventListener('click', function () { openModal(null); });
    document.getElementById('quote-modal-close').addEventListener('click', closeModal);
    document.getElementById('quote-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('quote-form').addEventListener('submit', handleSubmit);
    document.getElementById('add-line-btn').addEventListener('click', function () { addLineRow(); });
    document.getElementById('quote-tax').addEventListener('input', recalcTotals);
    document.getElementById('quote-currency').addEventListener('change', recalcTotals);

    loadCaches().then(loadQuotes);
  }

  // -------------------------------------------------------------------------
  // Caches
  // -------------------------------------------------------------------------
  function loadCaches() {
    return Promise.all([
      db.collection('clients').orderBy('name').get().then(function (snap) {
        clientsCache = {};
        snap.forEach(function (doc) { clientsCache[doc.id] = doc.data().name || 'Unnamed'; });
      }),
      db.collection('tours').orderBy('name').get().then(function (snap) {
        toursCache = {};
        snap.forEach(function (doc) { toursCache[doc.id] = doc.data().name || 'Unnamed'; });
      })
    ]).catch(function (err) { console.error('[quotes] caches:', err.message); });
  }

  // -------------------------------------------------------------------------
  // Load & render table
  // -------------------------------------------------------------------------
  function loadQuotes() {
    var wrap = document.getElementById('quotes-table-wrap');
    if (!wrap) return;

    col.orderBy('createdAt', 'desc').get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No quotes yet. Create your first quote to get started.</p>';
          return;
        }

        var rows = snap.docs.map(function (doc) {
          var d          = doc.data();
          var clientName = d.clientId ? (clientsCache[d.clientId] || '—') : '—';
          var tourName   = d.tourId   ? (toursCache[d.tourId]     || '—') : '—';
          var valid      = d.validUntil ? formatDate(d.validUntil.toDate()) : '—';

          return [
            '<tr>',
              '<td class="td-primary">' + esc(clientName) + '</td>',
              '<td>' + esc(tourName) + '</td>',
              '<td>' + formatCurrency(d.total, d.currency) + '</td>',
              '<td><span class="badge badge-' + quoteStatusClass(d.status) + '">' + esc(d.status || 'draft') + '</span></td>',
              '<td>' + valid + '</td>',
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
              '<th>Client</th><th>Tour</th><th>Total</th><th>Status</th><th>Valid Until</th><th></th>',
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
        console.error('[quotes] load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load quotes.</p>';
      });
  }

  // -------------------------------------------------------------------------
  // Modal open / close
  // -------------------------------------------------------------------------
  function openModal(data) {
    var modal = document.getElementById('quote-modal-overlay');
    var title = document.getElementById('quote-modal-title');
    var form  = document.getElementById('quote-form');

    title.textContent = data ? 'Edit Quote' : 'New Quote';
    form.reset();
    clearFormError();
    populateDropdowns(form);

    // Reset line items
    document.getElementById('line-items-body').innerHTML = '';

    if (data) {
      form.elements['clientId'].value  = data.clientId  || '';
      form.elements['tourId'].value    = data.tourId    || '';
      form.elements['status'].value    = data.status    || 'draft';
      form.elements['currency'].value  = data.currency  || 'USD';
      form.elements['tax'].value       = data.tax !== undefined ? data.tax : 0;
      form.elements['notes'].value     = data.notes     || '';
      if (data.validUntil) form.elements['validUntil'].value = toDateInput(data.validUntil.toDate());

      (data.items || []).forEach(function (item) { addLineRow(item); });
      form.dataset.editId = data._id;
    } else {
      form.elements['status'].value   = 'draft';
      form.elements['currency'].value = 'USD';
      form.elements['tax'].value      = '0';
      addLineRow();
      delete form.dataset.editId;
    }

    recalcTotals();
    modal.classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('quote-modal-overlay').classList.add('hidden');
  }

  function loadAndOpenEdit(id) {
    col.doc(id).get()
      .then(function (doc) {
        if (!doc.exists) return;
        var data = doc.data();
        data._id = doc.id;
        openModal(data);
      })
      .catch(function (err) { console.error('[quotes] load for edit:', err.message); });
  }

  function populateDropdowns(form) {
    var cSel = form.querySelector('[name="clientId"]');
    var tSel = form.querySelector('[name="tourId"]');

    var cOpts = '<option value="">— No client —</option>';
    Object.keys(clientsCache).forEach(function (id) {
      cOpts += '<option value="' + id + '">' + esc(clientsCache[id]) + '</option>';
    });
    cSel.innerHTML = cOpts;

    var tOpts = '<option value="">— No tour —</option>';
    Object.keys(toursCache).forEach(function (id) {
      tOpts += '<option value="' + id + '">' + esc(toursCache[id]) + '</option>';
    });
    tSel.innerHTML = tOpts;
  }

  // -------------------------------------------------------------------------
  // Line items
  // -------------------------------------------------------------------------
  function addLineRow(item) {
    var body = document.getElementById('line-items-body');
    var desc  = (item && item.description) ? esc(item.description) : '';
    var qty   = (item && item.quantity)    ? item.quantity          : 1;
    var price = (item && item.unitPrice)   ? item.unitPrice         : '';

    var row = document.createElement('tr');
    row.className = 'line-row';
    row.innerHTML = [
      '<td><input type="text" class="line-input line-desc" placeholder="Description" value="' + desc + '"></td>',
      '<td><input type="number" class="line-input line-qty" placeholder="Qty" min="1" value="' + qty + '"></td>',
      '<td><input type="number" class="line-input line-price" placeholder="0.00" min="0" step="0.01" value="' + price + '"></td>',
      '<td class="line-amount">—</td>',
      '<td><button type="button" class="btn-remove-line" aria-label="Remove line">&times;</button></td>',
    ].join('');

    row.querySelector('.btn-remove-line').addEventListener('click', function () {
      row.remove();
      recalcTotals();
    });
    row.querySelector('.line-qty').addEventListener('input', recalcTotals);
    row.querySelector('.line-price').addEventListener('input', recalcTotals);

    body.appendChild(row);
    recalcTotals();
  }

  function getLineItems() {
    var rows  = document.querySelectorAll('#line-items-body .line-row');
    var items = [];
    rows.forEach(function (row) {
      var desc  = row.querySelector('.line-desc').value.trim();
      var qty   = parseFloat(row.querySelector('.line-qty').value)   || 0;
      var price = parseFloat(row.querySelector('.line-price').value) || 0;
      items.push({ description: desc, quantity: qty, unitPrice: price, amount: qty * price });
    });
    return items;
  }

  function recalcTotals() {
    var items    = getLineItems();
    var taxRate  = parseFloat(document.getElementById('quote-tax').value) || 0;
    var currency = document.getElementById('quote-currency').value || 'USD';

    var subtotal = items.reduce(function (sum, i) { return sum + i.amount; }, 0);
    var taxAmt   = subtotal * (taxRate / 100);
    var total    = subtotal + taxAmt;

    // Update per-row amounts
    document.querySelectorAll('#line-items-body .line-row').forEach(function (row, i) {
      var amtEl = row.querySelector('.line-amount');
      if (amtEl && items[i]) amtEl.textContent = formatCurrency(items[i].amount, currency);
    });

    document.getElementById('quote-subtotal').textContent = formatCurrency(subtotal, currency);
    document.getElementById('quote-tax-amt').textContent  = formatCurrency(taxAmt,   currency);
    document.getElementById('quote-total').textContent    = formatCurrency(total,     currency);
  }

  // -------------------------------------------------------------------------
  // Form submit
  // -------------------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    clearFormError();

    var form    = e.target;
    var editId  = form.dataset.editId;
    var saveBtn = document.getElementById('quote-save-btn');
    var items   = getLineItems();

    if (!form.elements['clientId'].value) {
      showFormError('Please select a client.');
      return;
    }
    if (items.length === 0 || items.every(function (i) { return !i.description; })) {
      showFormError('Add at least one line item.');
      return;
    }

    var taxRate  = parseFloat(form.elements['tax'].value) || 0;
    var subtotal = items.reduce(function (sum, i) { return sum + i.amount; }, 0);
    var taxAmt   = subtotal * (taxRate / 100);
    var total    = subtotal + taxAmt;
    var validVal = form.elements['validUntil'].value;

    var payload = {
      clientId:   form.elements['clientId'].value   || null,
      tourId:     form.elements['tourId'].value      || null,
      status:     form.elements['status'].value      || 'draft',
      currency:   form.elements['currency'].value    || 'USD',
      notes:      form.elements['notes'].value.trim(),
      items:      items,
      tax:        taxRate,
      subtotal:   subtotal,
      total:      total,
      validUntil: validVal ? firebase.firestore.Timestamp.fromDate(new Date(validVal)) : null,
      updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
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

    op.then(function () { closeModal(); loadQuotes(); })
      .catch(function (err) {
        console.error('[quotes] save:', err.message);
        showFormError('Failed to save. Please try again.');
      })
      .finally(function () {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save Quote';
      });
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  function confirmDelete(id, row) {
    if (!confirm('Delete this quote? This cannot be undone.')) return;
    col.doc(id).delete()
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#quotes-table-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadQuotes();
      })
      .catch(function (err) {
        console.error('[quotes] delete:', err.message);
        alert('Failed to delete quote. Please try again.');
      });
  }

  // -------------------------------------------------------------------------
  // Modal HTML
  // -------------------------------------------------------------------------
  function buildModal() {
    var statusOpts = STATUSES.map(function (s) {
      return '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    }).join('');

    var currOpts = CURRENCIES.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');

    return [
      '<div id="quote-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-xl">',
          '<div class="modal-header">',
            '<h3 id="quote-modal-title" class="modal-title">New Quote</h3>',
            '<button id="quote-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="quote-form" class="modal-form" novalidate>',

            '<div class="form-grid">',
              '<div class="field">',
                '<label>Client <span class="required">*</span></label>',
                '<select name="clientId"><option value="">Loading…</option></select>',
              '</div>',
              '<div class="field">',
                '<label>Tour</label>',
                '<select name="tourId"><option value="">Loading…</option></select>',
              '</div>',
              '<div class="field">',
                '<label>Status</label>',
                '<select name="status">' + statusOpts + '</select>',
              '</div>',
              '<div class="field">',
                '<label>Valid Until</label>',
                '<input type="date" name="validUntil" id="quote-valid">',
              '</div>',
            '</div>',

            '<div class="form-section-label" style="margin-top:var(--space-2)">Line Items</div>',
            '<div class="line-items-wrap">',
              '<table class="line-items-table">',
                '<thead><tr>',
                  '<th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th><th></th>',
                '</tr></thead>',
                '<tbody id="line-items-body"></tbody>',
              '</table>',
              '<button type="button" id="add-line-btn" class="btn-add-line">+ Add Line</button>',
            '</div>',

            '<div class="quote-totals">',
              '<div class="totals-row">',
                '<div class="field totals-tax">',
                  '<label for="quote-tax">Tax %</label>',
                  '<input type="number" id="quote-tax" name="tax" value="0" min="0" max="100" step="0.1">',
                '</div>',
                '<div class="field totals-currency">',
                  '<label for="quote-currency">Currency</label>',
                  '<select id="quote-currency" name="currency">' + currOpts + '</select>',
                '</div>',
                '<div class="totals-summary">',
                  '<div class="total-line"><span>Subtotal</span><span id="quote-subtotal">—</span></div>',
                  '<div class="total-line"><span>Tax</span><span id="quote-tax-amt">—</span></div>',
                  '<div class="total-line total-line-grand"><span>Total</span><span id="quote-total">—</span></div>',
                '</div>',
              '</div>',
            '</div>',

            '<div class="field">',
              '<label for="quote-notes">Notes</label>',
              '<textarea id="quote-notes" name="notes" placeholder="Notes to include on the quote…" rows="2"></textarea>',
            '</div>',

            '<p id="quote-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'quote-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="quote-save-btn">Save Quote</button>',
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
    var el = document.getElementById('quote-form-error');
    if (el) el.textContent = msg;
  }

  function clearFormError() {
    var el = document.getElementById('quote-form-error');
    if (el) el.textContent = '';
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function toDateInput(date) { return date.toISOString().split('T')[0]; }

  function formatCurrency(amount, currency) {
    if (amount === undefined || amount === null) return '—';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2
      }).format(amount);
    } catch (e) { return (currency || '') + ' ' + amount; }
  }

  function quoteStatusClass(status) {
    var map = { draft: 'neutral', sent: 'info', accepted: 'success', declined: 'error', expired: 'warning' };
    return map[status] || 'neutral';
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
