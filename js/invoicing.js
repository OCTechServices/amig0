// invoicing.js — amig0-travel-company | OCTech Services
// Invoicing module: list, add, edit, delete, payment tracking
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db  = firebase.firestore();
  var col = db.collection('invoices');

  var STATUSES   = ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'];
  var CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN'];

  var clientsCache = {};
  var toursCache   = {};
  var quotesCache  = {};

  window.Invoicing = {
    render: render
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">Invoices</h3>',
          '<button class="btn btn-primary" id="add-invoice-btn">+ New Invoice</button>',
        '</div>',
        '<div class="card">',
          '<div id="invoices-table-wrap"><p class="empty-state">Loading…</p></div>',
        '</div>',
      '</div>',
      buildModal(),
      buildPaymentModal(),
    ].join('');

    document.getElementById('add-invoice-btn').addEventListener('click', function () { openModal(null); });
    document.getElementById('invoice-modal-close').addEventListener('click', closeModal);
    document.getElementById('invoice-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('invoice-form').addEventListener('submit', handleSubmit);

    document.getElementById('payment-modal-close').addEventListener('click', closePaymentModal);
    document.getElementById('payment-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closePaymentModal();
    });
    document.getElementById('payment-cancel-btn').addEventListener('click', closePaymentModal);
    document.getElementById('payment-form').addEventListener('submit', handlePaymentSubmit);
    document.getElementById('inv-add-line-btn').addEventListener('click', function () { addLineRow(); });
    document.getElementById('inv-tax').addEventListener('input', recalcTotals);
    document.getElementById('inv-currency').addEventListener('change', recalcTotals);
    document.getElementById('inv-amount-paid').addEventListener('input', recalcBalance);

    // Auto-populate from quote
    document.getElementById('inv-quote').addEventListener('change', function () {
      var qid = this.value;
      if (!qid || !quotesCache[qid]) return;
      var q   = quotesCache[qid];
      var form = document.getElementById('invoice-form');
      if (q.clientId) form.elements['clientId'].value = q.clientId;
      if (q.tourId)   form.elements['tourId'].value   = q.tourId;
      if (q.currency) form.elements['currency'].value = q.currency;
      if (q.tax !== undefined) form.elements['tax'].value = q.tax;
      // Replace line items
      document.getElementById('inv-line-items-body').innerHTML = '';
      (q.items || []).forEach(function (item) { addLineRow(item); });
      recalcTotals();
    });

    loadCaches().then(loadInvoices);
  }

  // -------------------------------------------------------------------------
  // Caches
  // -------------------------------------------------------------------------
  function loadCaches() {
    return Promise.all([
      db.collection('clients').orderBy('name').get().then(function (snap) {
        clientsCache = {};
        snap.forEach(function (doc) {
          clientsCache[doc.id] = { name: doc.data().name || 'Unnamed', email: doc.data().email || '' };
        });
      }),
      db.collection('tours').orderBy('name').get().then(function (snap) {
        toursCache = {};
        snap.forEach(function (doc) { toursCache[doc.id] = doc.data().name || 'Unnamed'; });
      }),
      db.collection('quotes').orderBy('createdAt', 'desc').get().then(function (snap) {
        quotesCache = {};
        snap.forEach(function (doc) {
          var d = doc.data();
          quotesCache[doc.id] = d;
          quotesCache[doc.id]._id = doc.id;
        });
      })
    ]).catch(function (err) { console.error('[invoicing] caches:', err.message); });
  }

  // -------------------------------------------------------------------------
  // Load & render table
  // -------------------------------------------------------------------------
  function loadInvoices() {
    var wrap = document.getElementById('invoices-table-wrap');
    if (!wrap) return;

    col.orderBy('createdAt', 'desc').get()
      .then(function (snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p class="empty-state">No invoices yet. Create your first invoice to get started.</p>';
          return;
        }

        // Overdue detection — flip sent/partial → overdue if dueDate has passed
        var today    = new Date();
        today.setHours(0, 0, 0, 0);
        var overdueIds = snap.docs.filter(function (doc) {
          var d = doc.data();
          return (d.status === 'sent' || d.status === 'partial') &&
                 d.dueDate && d.dueDate.toDate() < today;
        }).map(function (doc) { return doc.id; });

        if (overdueIds.length) {
          var batch = db.batch();
          overdueIds.forEach(function (id) {
            batch.update(col.doc(id), {
              status:    'overdue',
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          });
          batch.commit().then(loadInvoices).catch(function (err) {
            console.error('[invoicing] overdue batch:', err.message);
          });
          return; // re-render after batch completes
        }

        var rows = snap.docs.map(function (doc) {
          var d          = doc.data();
          var clientName = d.clientId ? (clientsCache[d.clientId] && clientsCache[d.clientId].name || '—') : '—';
          var tourName   = d.tourId   ? (toursCache[d.tourId]     || '—') : '—';
          var due        = d.dueDate  ? formatDate(d.dueDate.toDate())     : '—';
          var balance    = (d.total || 0) - (d.amountPaid || 0);

          return [
            '<tr>',
              '<td class="td-primary">' + esc(d.invoiceNumber || '—') + '</td>',
              '<td>' + esc(clientName) + '</td>',
              '<td>' + esc(tourName) + '</td>',
              '<td>' + formatCurrency(d.total, d.currency) + '</td>',
              '<td>' + formatCurrency(d.amountPaid || 0, d.currency) + '</td>',
              '<td class="' + (balance > 0 ? 'td-balance-due' : '') + '">' + formatCurrency(balance, d.currency) + '</td>',
              '<td><span class="badge badge-' + invoiceStatusClass(d.status) + '">' + esc(d.status || 'draft') + '</span></td>',
              '<td>' + due + '</td>',
              '<td class="td-actions">',
                '<button class="btn-table-action" data-action="pdf" data-id="' + doc.id + '">PDF</button>',
                '<button class="btn-table-action" data-action="email" data-id="' + doc.id + '">Email</button>',
                '<button class="btn-table-action btn-table-pay" data-action="pay" data-id="' + doc.id + '">Pay</button>',
                '<button class="btn-table-action" data-action="edit" data-id="' + doc.id + '">Edit</button>',
                '<button class="btn-table-action btn-table-danger" data-action="delete" data-id="' + doc.id + '">Delete</button>',
              '</td>',
            '</tr>'
          ].join('');
        });

        wrap.innerHTML = [
          '<div class="table-scroll">',
          '<table class="data-table">',
            '<thead><tr>',
              '<th>Invoice #</th><th>Client</th><th>Tour</th>',
              '<th>Total</th><th>Paid</th><th>Balance</th>',
              '<th>Status</th><th>Due</th><th></th>',
            '</tr></thead>',
            '<tbody>' + rows.join('') + '</tbody>',
          '</table>',
          '</div>'
        ].join('');

        wrap.querySelectorAll('[data-action]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id     = btn.getAttribute('data-id');
            var action = btn.getAttribute('data-action');
            if (action === 'edit') {
              loadAndOpenEdit(id);
            } else if (action === 'pdf') {
              downloadPDF(id);
            } else if (action === 'email') {
              emailClient(id);
            } else if (action === 'pay') {
              openPaymentModal(id);
            } else {
              confirmDelete(id, btn.closest('tr'));
            }
          });
        });
      })
      .catch(function (err) {
        console.error('[invoicing] load:', err.message);
        wrap.innerHTML = '<p class="error-state">Failed to load invoices.</p>';
      });
  }

  // -------------------------------------------------------------------------
  // Invoice number generator
  // -------------------------------------------------------------------------
  function generateInvoiceNumber() {
    return col.get().then(function (snap) {
      var num = snap.size + 1;
      return 'INV-' + String(num).padStart(4, '0');
    });
  }

  // -------------------------------------------------------------------------
  // Modal
  // -------------------------------------------------------------------------
  function openModal(data) {
    var modal = document.getElementById('invoice-modal-overlay');
    var title = document.getElementById('invoice-modal-title');
    var form  = document.getElementById('invoice-form');

    title.textContent = data ? 'Edit Invoice' : 'New Invoice';
    form.reset();
    clearFormError();
    populateDropdowns(form);
    document.getElementById('inv-line-items-body').innerHTML = '';

    if (data) {
      form.elements['invoiceNumber'].value = data.invoiceNumber || '';
      form.elements['clientId'].value      = data.clientId      || '';
      form.elements['tourId'].value        = data.tourId        || '';
      form.elements['quoteId'].value       = data.quoteId       || '';
      form.elements['status'].value        = data.status        || 'draft';
      form.elements['currency'].value      = data.currency      || 'USD';
      form.elements['tax'].value           = data.tax !== undefined ? data.tax : 0;
      form.elements['amountPaid'].value    = data.amountPaid    || 0;
      form.elements['notes'].value         = data.notes         || '';
      if (data.dueDate) form.elements['dueDate'].value = toDateInput(data.dueDate.toDate());
      (data.items || []).forEach(function (item) { addLineRow(item); });
      form.dataset.editId = data._id;
    } else {
      form.elements['status'].value   = 'draft';
      form.elements['currency'].value = 'USD';
      form.elements['tax'].value      = '0';
      form.elements['amountPaid'].value = '0';
      addLineRow();
      delete form.dataset.editId;

      // Auto-generate invoice number
      generateInvoiceNumber().then(function (num) {
        var el = document.getElementById('inv-number');
        if (el) el.value = num;
      });
    }

    recalcTotals();
    modal.classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('invoice-modal-overlay').classList.add('hidden');
  }

  function loadAndOpenEdit(id) {
    col.doc(id).get()
      .then(function (doc) {
        if (!doc.exists) return;
        var data = doc.data();
        data._id = doc.id;
        openModal(data);
      })
      .catch(function (err) { console.error('[invoicing] load for edit:', err.message); });
  }

  function populateDropdowns(form) {
    // Clients
    var cSel = form.querySelector('[name="clientId"]');
    var cOpts = '<option value="">— No client —</option>';
    Object.keys(clientsCache).forEach(function (id) {
      cOpts += '<option value="' + id + '">' + esc(clientsCache[id].name) + '</option>';
    });
    cSel.innerHTML = cOpts;

    // Tours
    var tSel = form.querySelector('[name="tourId"]');
    var tOpts = '<option value="">— No tour —</option>';
    Object.keys(toursCache).forEach(function (id) {
      tOpts += '<option value="' + id + '">' + esc(toursCache[id]) + '</option>';
    });
    tSel.innerHTML = tOpts;

    // Quotes
    var qSel = document.getElementById('inv-quote');
    var qOpts = '<option value="">— Import from quote —</option>';
    Object.keys(quotesCache).forEach(function (id) {
      var q = quotesCache[id];
      var label = (q.clientId && clientsCache[q.clientId] ? clientsCache[q.clientId].name : 'Quote') +
                  ' · ' + formatCurrency(q.total, q.currency);
      qOpts += '<option value="' + id + '">' + esc(label) + '</option>';
    });
    qSel.innerHTML = qOpts;
  }

  // -------------------------------------------------------------------------
  // Line items
  // -------------------------------------------------------------------------
  function addLineRow(item) {
    var body  = document.getElementById('inv-line-items-body');
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
      '<td><button type="button" class="btn-remove-line" aria-label="Remove">&times;</button></td>',
    ].join('');

    row.querySelector('.btn-remove-line').addEventListener('click', function () { row.remove(); recalcTotals(); });
    row.querySelector('.line-qty').addEventListener('input', recalcTotals);
    row.querySelector('.line-price').addEventListener('input', recalcTotals);

    body.appendChild(row);
    recalcTotals();
  }

  function getLineItems() {
    var items = [];
    document.querySelectorAll('#inv-line-items-body .line-row').forEach(function (row) {
      var qty   = parseFloat(row.querySelector('.line-qty').value)   || 0;
      var price = parseFloat(row.querySelector('.line-price').value) || 0;
      items.push({
        description: row.querySelector('.line-desc').value.trim(),
        quantity:    qty,
        unitPrice:   price,
        amount:      qty * price
      });
    });
    return items;
  }

  function recalcTotals() {
    var items    = getLineItems();
    var taxRate  = parseFloat(document.getElementById('inv-tax').value) || 0;
    var currency = document.getElementById('inv-currency').value || 'USD';
    var subtotal = items.reduce(function (s, i) { return s + i.amount; }, 0);
    var taxAmt   = subtotal * (taxRate / 100);
    var total    = subtotal + taxAmt;

    document.querySelectorAll('#inv-line-items-body .line-row').forEach(function (row, i) {
      var amtEl = row.querySelector('.line-amount');
      if (amtEl && items[i]) amtEl.textContent = formatCurrency(items[i].amount, currency);
    });

    document.getElementById('inv-subtotal').textContent = formatCurrency(subtotal, currency);
    document.getElementById('inv-tax-amt').textContent  = formatCurrency(taxAmt,   currency);
    document.getElementById('inv-total').textContent    = formatCurrency(total,     currency);

    recalcBalance(total);
  }

  function recalcBalance(totalOrEvent) {
    var currency = document.getElementById('inv-currency').value || 'USD';
    var totalEl  = document.getElementById('inv-total').textContent;
    var total    = typeof totalOrEvent === 'number' ? totalOrEvent : parseTotal(totalEl);
    var paid     = parseFloat(document.getElementById('inv-amount-paid').value) || 0;
    var balance  = Math.max(0, total - paid);
    document.getElementById('inv-balance').textContent = formatCurrency(balance, currency);
  }

  function parseTotal(str) {
    return parseFloat((str || '0').replace(/[^0-9.-]/g, '')) || 0;
  }

  // -------------------------------------------------------------------------
  // Form submit
  // -------------------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    clearFormError();

    var form    = e.target;
    var editId  = form.dataset.editId;
    var saveBtn = document.getElementById('invoice-save-btn');
    var items   = getLineItems();

    if (!form.elements['clientId'].value) {
      showFormError('Please select a client.');
      return;
    }
    if (!form.elements['invoiceNumber'].value.trim()) {
      showFormError('Invoice number is required.');
      return;
    }

    var taxRate    = parseFloat(form.elements['tax'].value) || 0;
    var subtotal   = items.reduce(function (s, i) { return s + i.amount; }, 0);
    var taxAmt     = subtotal * (taxRate / 100);
    var total      = subtotal + taxAmt;
    var amountPaid = parseFloat(form.elements['amountPaid'].value) || 0;
    var dueVal     = form.elements['dueDate'].value;

    var payload = {
      invoiceNumber: form.elements['invoiceNumber'].value.trim(),
      clientId:      form.elements['clientId'].value   || null,
      tourId:        form.elements['tourId'].value      || null,
      quoteId:       form.elements['quoteId'].value     || null,
      status:        form.elements['status'].value      || 'draft',
      currency:      form.elements['currency'].value    || 'USD',
      notes:         form.elements['notes'].value.trim(),
      items:         items,
      tax:           taxRate,
      subtotal:      subtotal,
      total:         total,
      amountPaid:    amountPaid,
      balance:       Math.max(0, total - amountPaid),
      dueDate:       dueVal ? firebase.firestore.Timestamp.fromDate(new Date(dueVal)) : null,
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

    op.then(function () { closeModal(); loadInvoices(); })
      .catch(function (err) {
        console.error('[invoicing] save:', err.message);
        showFormError('Failed to save. Please try again.');
      })
      .finally(function () {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save Invoice';
      });
  }

  // -------------------------------------------------------------------------
  // PDF download
  // -------------------------------------------------------------------------
  function downloadPDF(id) {
    col.doc(id).get()
      .then(function (doc) {
        if (!doc.exists) return;
        var data       = doc.data();
        var clientName = data.clientId ? (clientsCache[data.clientId] && clientsCache[data.clientId].name || '—') : '—';
        var tourName   = data.tourId   ? (toursCache[data.tourId]     || '—') : '—';
        window.PDF.generateInvoice(data, clientName, tourName);
      })
      .catch(function (err) {
        console.error('[invoicing] pdf:', err.message);
        alert('Failed to generate PDF. Please try again.');
      });
  }

  // -------------------------------------------------------------------------
  // Email client
  // -------------------------------------------------------------------------
  function emailClient(id) {
    col.doc(id).get()
      .then(function (doc) {
        if (!doc.exists) return;
        var data        = doc.data();
        var client      = data.clientId ? clientsCache[data.clientId] : null;
        var clientEmail = client ? client.email : '';
        var clientName  = client ? client.name  : '';
        var tourName    = data.tourId ? (toursCache[data.tourId] || '') : '';
        var balance     = (data.total || 0) - (data.amountPaid || 0);

        if (!clientEmail) {
          alert('No email address on file for this client. Add one in the Clients module first.');
          return;
        }

        var due     = data.dueDate ? formatDate(data.dueDate.toDate()) : 'N/A';
        var brand   = (window.AppConfig && window.AppConfig.brandName) || 'Amig0 Travel';
        var subject = 'Invoice ' + (data.invoiceNumber || '') + ' from ' + brand + (tourName ? ' — ' + tourName : '');
        var body    = [
          'Hi ' + (clientName || 'there') + ',',
          '',
          'Please find your invoice details below:',
          '',
          'Invoice #:    ' + (data.invoiceNumber || 'N/A'),
          (tourName ? 'Tour:         ' + tourName : ''),
          'Total:        ' + formatCurrency(data.total, data.currency),
          'Amount Paid:  ' + formatCurrency(data.amountPaid || 0, data.currency),
          'Balance Due:  ' + formatCurrency(balance, data.currency),
          'Due Date:     ' + due,
          '',
          'To view your invoice and booking details, log in to the client portal.',
          '',
          'If you have any questions, please reply to this email.',
          '',
          'Best regards,',
          (window.AppConfig && window.AppConfig.brandName) || 'Amig0 Travel'
        ].filter(function (l) { return l !== undefined; }).join('\n');

        window.location.href = 'mailto:' + encodeURIComponent(clientEmail) +
          '?subject=' + encodeURIComponent(subject) +
          '&body='    + encodeURIComponent(body);
      })
      .catch(function (err) {
        console.error('[invoicing] email:', err.message);
        alert('Failed to load invoice. Please try again.');
      });
  }

  // -------------------------------------------------------------------------
  // Payment recording
  // -------------------------------------------------------------------------
  function openPaymentModal(invoiceId) {
    var overlay = document.getElementById('payment-modal-overlay');
    var form    = document.getElementById('payment-form');
    form.reset();
    document.getElementById('payment-form-error').textContent = '';
    form.elements['date'].value = new Date().toISOString().split('T')[0];
    overlay.dataset.invoiceId = invoiceId;
    loadPaymentContext(invoiceId);
    overlay.classList.remove('hidden');
  }

  function closePaymentModal() {
    document.getElementById('payment-modal-overlay').classList.add('hidden');
  }

  function loadPaymentContext(invoiceId) {
    var summaryEl = document.getElementById('payment-invoice-summary');
    var historyEl = document.getElementById('payment-history');
    summaryEl.innerHTML = '<p class="empty-state">Loading…</p>';
    historyEl.innerHTML = '<p class="empty-state">Loading…</p>';

    col.doc(invoiceId).get()
      .then(function (invoiceDoc) {
        if (!invoiceDoc.exists) return;
        var inv      = invoiceDoc.data();
        var currency = inv.currency || 'USD';
        var balance  = Math.max(0, (inv.total || 0) - (inv.amountPaid || 0));

        summaryEl.innerHTML = [
          '<div class="payment-summary-grid">',
            '<div class="payment-summary-item"><span class="ps-label">Invoice</span><span class="ps-value">' + esc(inv.invoiceNumber || '—') + '</span></div>',
            '<div class="payment-summary-item"><span class="ps-label">Total</span><span class="ps-value">' + formatCurrency(inv.total, currency) + '</span></div>',
            '<div class="payment-summary-item"><span class="ps-label">Paid</span><span class="ps-value">' + formatCurrency(inv.amountPaid || 0, currency) + '</span></div>',
            '<div class="payment-summary-item' + (balance > 0 ? ' ps-balance-due' : ' ps-paid') + '"><span class="ps-label">Balance Due</span><span class="ps-value">' + formatCurrency(balance, currency) + '</span></div>',
          '</div>'
        ].join('');

        return col.doc(invoiceId).collection('payments')
          .orderBy('date', 'desc').get()
          .then(function (snap) {
            if (snap.empty) {
              historyEl.innerHTML = '<p class="empty-state" style="margin:0">No payments recorded yet.</p>';
              return;
            }
            var rows = snap.docs.map(function (doc) {
              var p    = doc.data();
              var date = p.date ? formatDate(p.date.toDate()) : '—';
              var method = (p.method || 'other').replace('_', ' ');
              return [
                '<div class="payment-history-row">',
                  '<span class="ph-date">' + esc(date) + '</span>',
                  '<span class="ph-method">' + esc(method.charAt(0).toUpperCase() + method.slice(1)) + '</span>',
                  '<span class="ph-ref">' + esc(p.reference || '—') + '</span>',
                  '<span class="ph-amount">' + formatCurrency(p.amount, currency) + '</span>',
                '</div>'
              ].join('');
            });
            historyEl.innerHTML = rows.join('');
          });
      })
      .catch(function (err) {
        console.error('[invoicing] payment context:', err.message);
        historyEl.innerHTML = '<p class="error-state">Failed to load.</p>';
      });
  }

  function handlePaymentSubmit(e) {
    e.preventDefault();
    var invoiceId = document.getElementById('payment-modal-overlay').dataset.invoiceId;
    var form      = e.target;
    var saveBtn   = document.getElementById('payment-save-btn');
    var errEl     = document.getElementById('payment-form-error');

    errEl.textContent = '';

    var amount = parseFloat(form.elements['amount'].value) || 0;
    var dateVal = form.elements['date'].value;

    if (!amount || amount <= 0) {
      errEl.textContent = 'Amount must be greater than 0.';
      return;
    }
    if (!dateVal) {
      errEl.textContent = 'Date is required.';
      return;
    }

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Recording…';

    var invoiceRef = col.doc(invoiceId);
    var payment = {
      amount:     amount,
      date:       firebase.firestore.Timestamp.fromDate(new Date(dateVal)),
      method:     form.elements['method'].value || 'other',
      reference:  form.elements['reference'].value.trim(),
      recordedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    invoiceRef.collection('payments').add(payment)
      .then(function () {
        return invoiceRef.collection('payments').get();
      })
      .then(function (snap) {
        var totalPaid = 0;
        snap.forEach(function (doc) { totalPaid += doc.data().amount || 0; });
        return invoiceRef.get().then(function (invoiceDoc) {
          var inv     = invoiceDoc.data();
          var balance = Math.max(0, (inv.total || 0) - totalPaid);
          var newStatus = inv.status;
          if (inv.status !== 'cancelled' && inv.status !== 'overdue') {
            if (balance <= 0)      newStatus = 'paid';
            else if (totalPaid > 0) newStatus = 'partial';
          }
          return invoiceRef.update({
            amountPaid: totalPaid,
            balance:    balance,
            status:     newStatus,
            updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
          });
        });
      })
      .then(function () {
        form.reset();
        form.elements['date'].value = new Date().toISOString().split('T')[0];
        loadPaymentContext(invoiceId);
        loadInvoices();
      })
      .catch(function (err) {
        console.error('[invoicing] record payment:', err.message);
        errEl.textContent = 'Failed to record payment. Please try again.';
      })
      .finally(function () {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Record Payment';
      });
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  function confirmDelete(id, row) {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    col.doc(id).delete()
      .then(function () {
        if (row) row.remove();
        var tbody = document.querySelector('#invoices-table-wrap .data-table tbody');
        if (tbody && !tbody.hasChildNodes()) loadInvoices();
      })
      .catch(function (err) {
        console.error('[invoicing] delete:', err.message);
        alert('Failed to delete invoice. Please try again.');
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
      '<div id="invoice-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-xl">',
          '<div class="modal-header">',
            '<h3 id="invoice-modal-title" class="modal-title">New Invoice</h3>',
            '<button id="invoice-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<form id="invoice-form" class="modal-form" novalidate>',

            '<div class="form-grid">',
              '<div class="field">',
                '<label>Invoice # <span class="required">*</span></label>',
                '<input type="text" id="inv-number" name="invoiceNumber" placeholder="INV-0001" autocomplete="off">',
              '</div>',
              '<div class="field">',
                '<label>Import from Quote</label>',
                '<select id="inv-quote" name="quoteId"><option value="">Loading…</option></select>',
              '</div>',
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
                '<label>Due Date</label>',
                '<input type="date" name="dueDate">',
              '</div>',
            '</div>',

            '<div class="form-section-label" style="margin-top:var(--space-2)">Line Items</div>',
            '<div class="line-items-wrap">',
              '<table class="line-items-table">',
                '<thead><tr>',
                  '<th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th><th></th>',
                '</tr></thead>',
                '<tbody id="inv-line-items-body"></tbody>',
              '</table>',
              '<button type="button" id="inv-add-line-btn" class="btn-add-line">+ Add Line</button>',
            '</div>',

            '<div class="quote-totals">',
              '<div class="totals-row">',
                '<div class="field totals-tax">',
                  '<label for="inv-tax">Tax %</label>',
                  '<input type="number" id="inv-tax" name="tax" value="0" min="0" max="100" step="0.1">',
                '</div>',
                '<div class="field totals-currency">',
                  '<label for="inv-currency">Currency</label>',
                  '<select id="inv-currency" name="currency">' + currOpts + '</select>',
                '</div>',
                '<div class="totals-summary">',
                  '<div class="total-line"><span>Subtotal</span><span id="inv-subtotal">—</span></div>',
                  '<div class="total-line"><span>Tax</span><span id="inv-tax-amt">—</span></div>',
                  '<div class="total-line total-line-grand"><span>Total</span><span id="inv-total">—</span></div>',
                '</div>',
              '</div>',
            '</div>',

            '<div class="form-section-label">Payment</div>',
            '<div class="form-grid">',
              '<div class="field">',
                '<label for="inv-amount-paid">Amount Paid</label>',
                '<input type="number" id="inv-amount-paid" name="amountPaid" value="0" min="0" step="0.01">',
              '</div>',
              '<div class="field">',
                '<label>Balance Due</label>',
                '<div id="inv-balance" class="balance-display">—</div>',
              '</div>',
            '</div>',

            '<div class="field">',
              '<label>Notes</label>',
              '<textarea name="notes" placeholder="Notes to include on the invoice…" rows="2"></textarea>',
            '</div>',

            '<p id="invoice-form-error" class="form-error" role="alert"></p>',
            '<div class="modal-footer">',
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'invoice-modal-overlay\').classList.add(\'hidden\')">Cancel</button>',
              '<button type="submit" class="btn btn-primary" id="invoice-save-btn">Save Invoice</button>',
            '</div>',
          '</form>',
        '</div>',
      '</div>'
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Payment modal HTML
  // -------------------------------------------------------------------------
  function buildPaymentModal() {
    return [
      '<div id="payment-modal-overlay" class="modal-overlay hidden">',
        '<div class="modal modal-lg">',
          '<div class="modal-header">',
            '<h3 class="modal-title">Record Payment</h3>',
            '<button id="payment-modal-close" class="modal-close" aria-label="Close">&times;</button>',
          '</div>',
          '<div class="modal-form">',

            '<div id="payment-invoice-summary"></div>',

            '<div class="form-section-label" style="margin-top:var(--space-4)">Payment History</div>',
            '<div id="payment-history" class="payment-history"></div>',

            '<div class="form-section-label" style="margin-top:var(--space-4)">New Payment</div>',
            '<form id="payment-form" novalidate>',
              '<div class="form-grid">',
                '<div class="field">',
                  '<label>Amount <span class="required">*</span></label>',
                  '<input type="number" name="amount" placeholder="0.00" min="0.01" step="0.01" autocomplete="off">',
                '</div>',
                '<div class="field">',
                  '<label>Date <span class="required">*</span></label>',
                  '<input type="date" name="date">',
                '</div>',
                '<div class="field">',
                  '<label>Method</label>',
                  '<select name="method">',
                    '<option value="bank_transfer">Bank Transfer</option>',
                    '<option value="card">Card</option>',
                    '<option value="cash">Cash</option>',
                    '<option value="cheque">Cheque</option>',
                    '<option value="wise">Wise</option>',
                    '<option value="other">Other</option>',
                  '</select>',
                '</div>',
                '<div class="field">',
                  '<label>Reference</label>',
                  '<input type="text" name="reference" placeholder="e.g. TXN-123456" autocomplete="off">',
                '</div>',
              '</div>',
              '<p id="payment-form-error" class="form-error" role="alert"></p>',
              '<div class="modal-footer">',
                '<button type="button" class="btn btn-ghost" id="payment-cancel-btn">Close</button>',
                '<button type="submit" class="btn btn-primary" id="payment-save-btn">Record Payment</button>',
              '</div>',
            '</form>',

          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function showFormError(msg) { var el = document.getElementById('invoice-form-error'); if (el) el.textContent = msg; }
  function clearFormError()   { var el = document.getElementById('invoice-form-error'); if (el) el.textContent = ''; }

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

  function invoiceStatusClass(status) {
    var map = {
      draft: 'neutral', sent: 'info', partial: 'warning',
      paid: 'success', overdue: 'error', cancelled: 'neutral'
    };
    return map[status] || 'neutral';
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
