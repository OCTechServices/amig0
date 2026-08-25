// reports.js — amig0 | OCTech Services
// Reports: KPI summary, revenue by tour, bookings by tour,
//          outstanding by client, partner check-ins, marketplace stats
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db = firebase.firestore();

  window.Reports = { render: render };

  // ---------------------------------------------------------------------------
  // Render shell
  // ---------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = [
      '<div class="module">',
        '<div class="module-header">',
          '<h3 class="module-title">Reports</h3>',
          '<span style="font-size:0.8rem;color:var(--color-text-muted)" id="report-timestamp"></span>',
        '</div>',

        // KPI strip
        '<div class="kpi-strip" id="report-kpi">',
          kpiCard('report-kpi-revenue',   'Total Billed',    '—'),
          kpiCard('report-kpi-collected', 'Collected',       '—'),
          kpiCard('report-kpi-balance',   'Outstanding',     '—', true),
          kpiCard('report-kpi-bookings',  'Bookings',        '—'),
          kpiCard('report-kpi-partners',  'Active Partners', '—'),
          kpiCard('report-kpi-checkins',  'Check-Ins',       '—'),
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

          '<div class="card" id="report-checkins">',
            '<div class="report-card-header"><h4 class="report-card-title">Check-Ins by Partner</h4></div>',
            '<p class="empty-state">Loading…</p>',
          '</div>',

          '<div class="card" id="report-marketplace">',
            '<div class="report-card-header"><h4 class="report-card-title">Marketplace</h4></div>',
            '<p class="empty-state">Loading…</p>',
          '</div>',
        '</div>',

      '</div>',
    ].join('');

    loadReports();
  }

  function kpiCard(id, label, value, danger) {
    return [
      '<div class="kpi-card' + (danger ? ' kpi-card-danger' : '') + '">',
        '<div class="kpi-label">' + label + '</div>',
        '<div class="kpi-value" id="' + id + '">' + value + '</div>',
      '</div>'
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Load all collections in parallel
  // ---------------------------------------------------------------------------
  function loadReports() {
    Promise.all([
      db.collection('tours').get(),
      db.collection('invoices').get(),
      db.collection('bookings').get(),
      db.collection('clients').get(),
      db.collection('partners').where('active', '==', true).get(),
      db.collection('checkins').get(),
      db.collection('marketplace_listings').get(),
    ])
    .then(function (results) {
      var toursSnap       = results[0];
      var invoicesSnap    = results[1];
      var bookingsSnap    = results[2];
      var clientsSnap     = results[3];
      var partnersSnap    = results[4];
      var checkinsSnap    = results[5];
      var marketSnap      = results[6];

      var tours   = {};
      var clients = {};
      var partners = {};

      toursSnap.forEach(function (doc) {
        tours[doc.id] = doc.data().name || 'Unnamed ' + cfg('tour');
      });
      clientsSnap.forEach(function (doc) {
        clients[doc.id] = doc.data().name || 'Unnamed Client';
      });
      partnersSnap.forEach(function (doc) {
        partners[doc.id] = doc.data().name || 'Unknown Partner';
      });

      renderKPIs(invoicesSnap, bookingsSnap, partnersSnap, checkinsSnap);
      renderRevenue(invoicesSnap, tours);
      renderBookings(bookingsSnap, toursSnap, tours);
      renderOutstanding(invoicesSnap, clients);
      renderCheckins(checkinsSnap, partners);
      renderMarketplace(marketSnap);

      var tsEl = document.getElementById('report-timestamp');
      if (tsEl) tsEl.textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    })
    .catch(function (err) {
      console.error('[reports] load:', err.message);
      ['report-revenue', 'report-bookings', 'report-outstanding', 'report-checkins', 'report-marketplace'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { var p = el.querySelector('p'); if (p) p.textContent = 'Failed to load.'; }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // KPI strip
  // ---------------------------------------------------------------------------
  function renderKPIs(invoicesSnap, bookingsSnap, partnersSnap, checkinsSnap) {
    var totalBilled = 0, totalPaid = 0, confirmedBookings = 0;
    var firstCurrency = 'USD';
    var seen = false;

    invoicesSnap.forEach(function (doc) {
      var d = doc.data();
      if (!seen && d.currency) { firstCurrency = d.currency; seen = true; }
      totalBilled += d.total      || 0;
      totalPaid   += d.amountPaid || 0;
    });

    bookingsSnap.forEach(function (doc) {
      if (doc.data().status === 'confirmed') confirmedBookings++;
    });

    setText('report-kpi-revenue',   formatCurrency(totalBilled, firstCurrency));
    setText('report-kpi-collected', formatCurrency(totalPaid, firstCurrency));
    setText('report-kpi-balance',   formatCurrency(Math.max(0, totalBilled - totalPaid), firstCurrency));
    setText('report-kpi-bookings',  String(confirmedBookings));
    setText('report-kpi-partners',  String(partnersSnap.size));
    setText('report-kpi-checkins',  String(checkinsSnap.size));
  }

  // ---------------------------------------------------------------------------
  // Revenue by Tour
  // ---------------------------------------------------------------------------
  function renderRevenue(invoicesSnap, tours) {
    var card = document.getElementById('report-revenue');
    if (!card) return;

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

    tourIds.sort(function (a, b) { return byTour[b].total - byTour[a].total; });
    var maxTotal = byTour[tourIds[0]].total || 1;

    var rows = tourIds.map(function (id) {
      var r = byTour[id];
      var outstanding = Math.max(0, r.total - r.paid);
      var pct = Math.round((r.total / maxTotal) * 100);
      return [
        '<tr>',
          '<td class="td-primary">' + esc(tours[id] || id) +
            '<div class="report-bar"><div class="report-bar-fill" style="width:' + pct + '%"></div></div>' +
          '</td>',
          '<td style="text-align:center">' + r.count + '</td>',
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
          '<th>' + cfg('tour') + '</th><th>Inv.</th><th>Billed</th><th>Collected</th><th>Outstanding</th>',
        '</tr></thead>',
        '<tbody>' + rows.join('') + '</tbody>',
      '</table>',
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Bookings by Tour
  // ---------------------------------------------------------------------------
  function renderBookings(bookingsSnap, toursSnap, tours) {
    var card = document.getElementById('report-bookings');
    if (!card) return;

    var byTour = {};
    bookingsSnap.forEach(function (doc) {
      var d = doc.data();
      if (!d.tourId) return;
      if (!byTour[d.tourId]) byTour[d.tourId] = { total: 0, confirmed: 0 };
      byTour[d.tourId].total++;
      if (d.status === 'confirmed') byTour[d.tourId].confirmed++;
    });

    var tourRows = [];
    toursSnap.forEach(function (doc) {
      var d = doc.data();
      tourRows.push({
        id:        doc.id,
        name:      d.name || 'Unnamed',
        startDate: d.startDate || null,
        total:     (byTour[doc.id] && byTour[doc.id].total)     || 0,
        confirmed: (byTour[doc.id] && byTour[doc.id].confirmed) || 0,
      });
    });

    if (!tourRows.length) {
      card.innerHTML = card.querySelector('.report-card-header').outerHTML +
        '<p class="empty-state">No ' + cfg('tours').toLowerCase() + ' yet.</p>';
      return;
    }

    tourRows.sort(function (a, b) { return b.confirmed - a.confirmed; });
    var maxConfirmed = (tourRows[0] && tourRows[0].confirmed) || 1;

    var rows = tourRows.map(function (t) {
      var start = t.startDate ? formatDate(t.startDate.toDate()) : '—';
      var pct   = Math.round((t.confirmed / maxConfirmed) * 100);
      return [
        '<tr>',
          '<td class="td-primary">' + esc(t.name) +
            '<div class="report-bar"><div class="report-bar-fill" style="width:' + pct + '%"></div></div>' +
          '</td>',
          '<td style="text-align:center">' + t.confirmed + '</td>',
          '<td style="text-align:center">' + t.total + '</td>',
          '<td>' + start + '</td>',
        '</tr>',
      ].join('');
    });

    card.innerHTML = [
      card.querySelector('.report-card-header').outerHTML,
      '<table class="data-table">',
        '<thead><tr>',
          '<th>' + cfg('tour') + '</th><th>Confirmed</th><th>Total</th><th>Start</th>',
        '</tr></thead>',
        '<tbody>' + rows.join('') + '</tbody>',
      '</table>',
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Outstanding by Client
  // ---------------------------------------------------------------------------
  function renderOutstanding(invoicesSnap, clients) {
    var card = document.getElementById('report-outstanding');
    if (!card) return;

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

    clientIds.sort(function (a, b) {
      return (byClient[b].total - byClient[b].paid) - (byClient[a].total - byClient[a].paid);
    });

    var rows = clientIds.map(function (id) {
      var r           = byClient[id];
      var outstanding = Math.max(0, r.total - r.paid);
      return [
        '<tr>',
          '<td class="td-primary">' + esc(clients[id] || id) + '</td>',
          '<td style="text-align:center">' + r.count + '</td>',
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
          '<th>Client</th><th>Invoices</th><th>Billed</th><th>Collected</th><th>Outstanding</th>',
        '</tr></thead>',
        '<tbody>' + rows.join('') + '</tbody>',
      '</table>',
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Check-ins by Partner
  // ---------------------------------------------------------------------------
  function renderCheckins(checkinsSnap, partners) {
    var card = document.getElementById('report-checkins');
    if (!card) return;

    if (checkinsSnap.empty) {
      card.innerHTML = card.querySelector('.report-card-header').outerHTML +
        '<p class="empty-state">No check-ins recorded yet.</p>';
      return;
    }

    var byPartner  = {};
    var byCountry  = {};

    checkinsSnap.forEach(function (doc) {
      var d = doc.data();

      if (d.partnerId) {
        if (!byPartner[d.partnerId]) byPartner[d.partnerId] = 0;
        byPartner[d.partnerId]++;
      }

      if (d.country) {
        if (!byCountry[d.country]) byCountry[d.country] = 0;
        byCountry[d.country]++;
      }
    });

    var partnerIds = Object.keys(byPartner).sort(function (a, b) { return byPartner[b] - byPartner[a]; });
    var maxCount   = partnerIds.length ? byPartner[partnerIds[0]] : 1;

    var partnerRows = partnerIds.slice(0, 8).map(function (id) {
      var count = byPartner[id];
      var pct   = Math.round((count / maxCount) * 100);
      return [
        '<tr>',
          '<td class="td-primary">' + esc(partners[id] || id) +
            '<div class="report-bar"><div class="report-bar-fill report-bar-amber" style="width:' + pct + '%"></div></div>' +
          '</td>',
          '<td style="text-align:center;font-weight:600">' + count + '</td>',
        '</tr>',
      ].join('');
    });

    var countryKeys = Object.keys(byCountry).sort(function (a, b) { return byCountry[b] - byCountry[a]; });
    var countryRows = countryKeys.slice(0, 5).map(function (c) {
      return '<span class="report-country-pill">' + esc(c) + ' <strong>' + byCountry[c] + '</strong></span>';
    }).join('');

    card.innerHTML = [
      card.querySelector('.report-card-header').outerHTML,
      '<table class="data-table">',
        '<thead><tr><th>Partner</th><th>Visits</th></tr></thead>',
        '<tbody>' + partnerRows.join('') + '</tbody>',
      '</table>',
      countryKeys.length
        ? '<div class="report-country-strip"><span style="font-size:0.78rem;color:var(--color-text-muted);margin-right:var(--space-2)">By country:</span>' + countryRows + '</div>'
        : '',
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Marketplace summary
  // ---------------------------------------------------------------------------
  function renderMarketplace(marketSnap) {
    var card = document.getElementById('report-marketplace');
    if (!card) return;

    var total = 0, active = 0, draft = 0, closed = 0, totalSeats = 0;
    marketSnap.forEach(function (doc) {
      var d = doc.data();
      total++;
      if (d.status === 'active')  { active++;  totalSeats += d.seatsAvailable || 0; }
      if (d.status === 'draft')   draft++;
      if (d.status === 'closed')  closed++;
    });

    if (!total) {
      card.innerHTML = card.querySelector('.report-card-header').outerHTML +
        '<p class="empty-state">No marketplace listings yet.</p>';
      return;
    }

    card.innerHTML = [
      card.querySelector('.report-card-header').outerHTML,
      '<div class="mkt-stats-grid">',
        mktStat(String(active),      'Active Listings'),
        mktStat(String(totalSeats),  'Open Seats'),
        mktStat(String(draft),       'Draft'),
        mktStat(String(closed),      'Closed'),
      '</div>',
    ].join('');
  }

  function mktStat(value, label) {
    return [
      '<div class="mkt-stat">',
        '<div class="mkt-stat-value">' + value + '</div>',
        '<div class="mkt-stat-label">' + label + '</div>',
      '</div>'
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatCurrency(amount, currency) {
    if (amount === undefined || amount === null) return '—';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: currency || 'USD', minimumFractionDigits: 0
      }).format(amount);
    } catch (e) { return (currency || '') + ' ' + amount; }
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
