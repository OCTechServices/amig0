// reports.js — amig0-travel-company | OCTech Services
// Reports module: revenue by tour, bookings by tour, outstanding by client
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db = firebase.firestore();

  window.Reports = { render: render };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">Reports</h3>',
        '</div>',

        '<div class="reports-grid">',

          '<div class="card" id="report-revenue">',
            '<div class="report-card-header"><h4 class="report-card-title">Revenue by ' + cfg('tour') + '</h4></div>',
            '<p class="empty-state">Loading…</p>',
          '</div>',

          '<div class="card" id="report-bookings">',
            '<div class="report-card-header"><h4 class="report-card-title">Bookings by ' + cfg('tour') + '</h4></div>',
            '<p class="empty-state">Loading…</p>',
          '</div>',

          '<div class="card report-full" id="report-outstanding">',
            '<div class="report-card-header"><h4 class="report-card-title">Outstanding Balance by Client</h4></div>',
            '<p class="empty-state">Loading…</p>',
          '</div>',

        '</div>',
      '</div>',
    ].join('');

    loadReports();
  }

  // -------------------------------------------------------------------------
  // Load all data then compute
  // -------------------------------------------------------------------------
  function loadReports() {
    Promise.all([
      db.collection('tours').get(),
      db.collection('invoices').get(),
      db.collection('bookings').get(),
      db.collection('clients').get(),
    ])
    .then(function (results) {
      var toursSnap    = results[0];
      var invoicesSnap = results[1];
      var bookingsSnap = results[2];
      var clientsSnap  = results[3];

      // Build lookup maps
      var tours   = {};
      var clients = {};

      toursSnap.forEach(function (doc) {
        tours[doc.id] = doc.data().name || 'Unnamed ' + cfg('tour');
      });

      clientsSnap.forEach(function (doc) {
        clients[doc.id] = doc.data().name || 'Unnamed Client';
      });

      renderRevenue(invoicesSnap, tours);
      renderBookings(bookingsSnap, toursSnap, tours);
      renderOutstanding(invoicesSnap, clients);
    })
    .catch(function (err) {
      console.error('[reports] load:', err.message);
      ['report-revenue', 'report-bookings', 'report-outstanding'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.querySelector('p').textContent = 'Failed to load. Check your connection.';
      });
    });
  }

  // -------------------------------------------------------------------------
  // Revenue by Tour
  // -------------------------------------------------------------------------
  function renderRevenue(invoicesSnap, tours) {
    var card = document.getElementById('report-revenue');
    if (!card) return;

    // Aggregate by tourId
    var byTour = {};
    invoicesSnap.forEach(function (doc) {
      var d = doc.data();
      if (!d.tourId) return;
      if (!byTour[d.tourId]) byTour[d.tourId] = { total: 0, paid: 0, count: 0, currency: d.currency || 'USD' };
      byTour[d.tourId].total += d.total      || 0;
      byTour[d.tourId].paid  += d.amountPaid || 0;
      byTour[d.tourId].count += 1;
    });

    var tourIds = Object.keys(byTour);
    if (!tourIds.length) {
      card.innerHTML = card.querySelector('.report-card-header').outerHTML +
        '<p class="empty-state">No invoices linked to ' + cfg('tours').toLowerCase() + ' yet.</p>';
      return;
    }

    // Sort by total revenue descending
    tourIds.sort(function (a, b) { return byTour[b].total - byTour[a].total; });

    var rows = tourIds.map(function (id) {
      var r   = byTour[id];
      var outstanding = Math.max(0, r.total - r.paid);
      return [
        '<tr>',
          '<td class="td-primary">' + esc(tours[id] || id) + '</td>',
          '<td>' + r.count + '</td>',
          '<td>' + formatCurrency(r.total, r.currency) + '</td>',
          '<td>' + formatCurrency(r.paid,  r.currency) + '</td>',
          '<td class="' + (outstanding > 0 ? 'td-balance-due' : '') + '">' + formatCurrency(outstanding, r.currency) + '</td>',
        '</tr>',
      ].join('');
    });

    card.innerHTML = [
      card.querySelector('.report-card-header').outerHTML,
      '<table class="data-table">',
        '<thead><tr>',
          '<th>' + cfg('tour') + '</th>',
          '<th>Invoices</th>',
          '<th>Revenue</th>',
          '<th>Collected</th>',
          '<th>Outstanding</th>',
        '</tr></thead>',
        '<tbody>' + rows.join('') + '</tbody>',
      '</table>',
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Bookings by Tour
  // -------------------------------------------------------------------------
  function renderBookings(bookingsSnap, toursSnap, tours) {
    var card = document.getElementById('report-bookings');
    if (!card) return;

    // Aggregate bookings per tour
    var byTour = {};
    bookingsSnap.forEach(function (doc) {
      var d = doc.data();
      if (!d.tourId) return;
      if (!byTour[d.tourId]) byTour[d.tourId] = 0;
      byTour[d.tourId] += 1;
    });

    // Build tour rows including tours with 0 bookings
    var tourRows = [];
    toursSnap.forEach(function (doc) {
      var d = doc.data();
      tourRows.push({
        id:        doc.id,
        name:      d.name || 'Unnamed ' + cfg('tour'),
        startDate: d.startDate || null,
        count:     byTour[doc.id] || 0,
      });
    });

    if (!tourRows.length) {
      card.innerHTML = card.querySelector('.report-card-header').outerHTML +
        '<p class="empty-state">No ' + cfg('tours').toLowerCase() + ' yet.</p>';
      return;
    }

    // Sort by booking count descending
    tourRows.sort(function (a, b) { return b.count - a.count; });

    var rows = tourRows.map(function (t) {
      var start = t.startDate ? formatDate(t.startDate.toDate()) : '—';
      return [
        '<tr>',
          '<td class="td-primary">' + esc(t.name) + '</td>',
          '<td>' + t.count + '</td>',
          '<td>' + start + '</td>',
        '</tr>',
      ].join('');
    });

    card.innerHTML = [
      card.querySelector('.report-card-header').outerHTML,
      '<table class="data-table">',
        '<thead><tr>',
          '<th>' + cfg('tour') + '</th>',
          '<th>Bookings</th>',
          '<th>Start Date</th>',
        '</tr></thead>',
        '<tbody>' + rows.join('') + '</tbody>',
      '</table>',
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Outstanding by Client
  // -------------------------------------------------------------------------
  function renderOutstanding(invoicesSnap, clients) {
    var card = document.getElementById('report-outstanding');
    if (!card) return;

    // Aggregate by clientId — only include clients with an outstanding balance
    var byClient = {};
    invoicesSnap.forEach(function (doc) {
      var d = doc.data();
      if (!d.clientId) return;
      if (!byClient[d.clientId]) byClient[d.clientId] = { total: 0, paid: 0, count: 0, currency: d.currency || 'USD' };
      byClient[d.clientId].total += d.total      || 0;
      byClient[d.clientId].paid  += d.amountPaid || 0;
      byClient[d.clientId].count += 1;
    });

    var clientIds = Object.keys(byClient).filter(function (id) {
      return Math.max(0, byClient[id].total - byClient[id].paid) > 0;
    });

    if (!clientIds.length) {
      card.innerHTML = card.querySelector('.report-card-header').outerHTML +
        '<p class="empty-state">No outstanding balances. All invoices are settled.</p>';
      return;
    }

    // Sort by outstanding descending
    clientIds.sort(function (a, b) {
      var balA = byClient[a].total - byClient[a].paid;
      var balB = byClient[b].total - byClient[b].paid;
      return balB - balA;
    });

    var rows = clientIds.map(function (id) {
      var r           = byClient[id];
      var outstanding = Math.max(0, r.total - r.paid);
      return [
        '<tr>',
          '<td class="td-primary">' + esc(clients[id] || id) + '</td>',
          '<td>' + r.count + '</td>',
          '<td>' + formatCurrency(r.total, r.currency) + '</td>',
          '<td>' + formatCurrency(r.paid,  r.currency) + '</td>',
          '<td class="td-balance-due">' + formatCurrency(outstanding, r.currency) + '</td>',
        '</tr>',
      ].join('');
    });

    card.innerHTML = [
      card.querySelector('.report-card-header').outerHTML,
      '<table class="data-table">',
        '<thead><tr>',
          '<th>Client</th>',
          '<th>Invoices</th>',
          '<th>Total Billed</th>',
          '<th>Collected</th>',
          '<th>Outstanding</th>',
        '</tr></thead>',
        '<tbody>' + rows.join('') + '</tbody>',
      '</table>',
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatCurrency(amount, currency) {
    if (amount === undefined || amount === null) return '—';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2
      }).format(amount);
    } catch (e) { return (currency || '') + ' ' + amount; }
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
