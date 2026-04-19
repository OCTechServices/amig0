// dashboard.js — amig0-travel-company | OCTech Services
// Dashboard section: summary stats + recent activity
// Depends on: firebase-config.js, auth.js, nav.js

(function () {
  'use strict';

  var db = firebase.firestore();

  // Called by nav.js when dashboard section is active
  window.Dashboard = {
    render: render
  };

  function render(container) {
    container.innerHTML = [
      '<div class="dashboard">',
        '<div class="stat-grid" id="stat-grid">',
          statCard('stat-clients',  'Total Clients',       '—'),
          statCard('stat-tours',    'Active Tours',        '—'),
          statCard('stat-upcoming', 'Upcoming (30 days)',  '—'),
          statCard('stat-balance',  'Outstanding Balance', '—'),
        '</div>',
        '<div class="dashboard-lower">',
          '<div class="card" id="recent-tours-card">',
            '<h3 class="card-title">Recent Tours</h3>',
            '<div id="recent-tours-body" class="card-body">Loading…</div>',
          '</div>',
          '<div class="card" id="recent-clients-card">',
            '<h3 class="card-title">Recent Clients</h3>',
            '<div id="recent-clients-body" class="card-body">Loading…</div>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    loadStats();
    loadRecentTours();
    loadRecentClients();
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------
  function loadStats() {
    var now = new Date();
    var in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Total clients
    db.collection('clients').get()
      .then(function (snap) {
        setStatValue('stat-clients', snap.size);
      })
      .catch(function (err) {
        console.error('[dashboard] clients count:', err.message);
        setStatValue('stat-clients', 'Error');
      });

    // Active tours
    db.collection('tours').where('status', '==', 'active').get()
      .then(function (snap) {
        setStatValue('stat-tours', snap.size);
      })
      .catch(function (err) {
        console.error('[dashboard] active tours:', err.message);
        setStatValue('stat-tours', 'Error');
      });

    // Upcoming tours in next 30 days
    db.collection('tours')
      .where('startDate', '>=', firebase.firestore.Timestamp.fromDate(now))
      .where('startDate', '<=', firebase.firestore.Timestamp.fromDate(in30))
      .get()
      .then(function (snap) {
        setStatValue('stat-upcoming', snap.size);
      })
      .catch(function (err) {
        console.error('[dashboard] upcoming tours:', err.message);
        setStatValue('stat-upcoming', 'Error');
      });

    // Outstanding invoice balance (status: sent | partial | overdue)
    db.collection('invoices')
      .where('status', 'in', ['sent', 'partial', 'overdue'])
      .get()
      .then(function (snap) {
        var total = 0;
        var currency = 'USD';
        snap.forEach(function (doc) {
          var data = doc.data();
          total += data.balance || 0;
          if (data.currency) currency = data.currency;
        });
        setStatValue('stat-balance', formatCurrency(total, currency));
      })
      .catch(function (err) {
        console.error('[dashboard] outstanding balance:', err.message);
        setStatValue('stat-balance', 'Error');
      });
  }

  // -------------------------------------------------------------------------
  // Recent tours
  // -------------------------------------------------------------------------
  function loadRecentTours() {
    var body = document.getElementById('recent-tours-body');
    if (!body) return;

    db.collection('tours')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get()
      .then(function (snap) {
        if (snap.empty) {
          body.innerHTML = '<p class="empty-state">No tours yet.</p>';
          return;
        }
        var rows = snap.docs.map(function (doc) {
          var d = doc.data();
          return (
            '<div class="list-row">' +
              '<span class="list-row-primary">' + esc(d.name || '—') + '</span>' +
              '<span class="list-row-secondary">' + esc(d.destination || '—') + '</span>' +
              '<span class="badge badge-' + statusClass(d.status) + '">' + esc(d.status || '—') + '</span>' +
            '</div>'
          );
        });
        body.innerHTML = rows.join('');
      })
      .catch(function (err) {
        console.error('[dashboard] recent tours:', err.message);
        body.innerHTML = '<p class="error-state">Failed to load tours.</p>';
      });
  }

  // -------------------------------------------------------------------------
  // Recent clients
  // -------------------------------------------------------------------------
  function loadRecentClients() {
    var body = document.getElementById('recent-clients-body');
    if (!body) return;

    db.collection('clients')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get()
      .then(function (snap) {
        if (snap.empty) {
          body.innerHTML = '<p class="empty-state">No clients yet.</p>';
          return;
        }
        var rows = snap.docs.map(function (doc) {
          var d = doc.data();
          return (
            '<div class="list-row">' +
              '<span class="list-row-primary">' + esc(d.name || '—') + '</span>' +
              '<span class="list-row-secondary">' + esc(d.email || '—') + '</span>' +
              '<span class="list-row-secondary">' + esc(d.country || '—') + '</span>' +
            '</div>'
          );
        });
        body.innerHTML = rows.join('');
      })
      .catch(function (err) {
        console.error('[dashboard] recent clients:', err.message);
        body.innerHTML = '<p class="error-state">Failed to load clients.</p>';
      });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function statCard(id, label, value) {
    return (
      '<div class="stat-card" id="' + id + '">' +
        '<span class="stat-label">' + label + '</span>' +
        '<span class="stat-value">' + value + '</span>' +
      '</div>'
    );
  }

  function setStatValue(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.querySelector('.stat-value').textContent = value;
  }

  function formatCurrency(amount, currency) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        maximumFractionDigits: 0
      }).format(amount);
    } catch (e) {
      return currency + ' ' + amount;
    }
  }

  function statusClass(status) {
    var map = {
      draft: 'neutral', confirmed: 'info', active: 'success',
      completed: 'neutral', cancelled: 'error'
    };
    return map[status] || 'neutral';
  }

  // Escape HTML to prevent XSS
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
