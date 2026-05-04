// portal-quotes.js — amig0-travel-company | OCTech Services
// Portal: client's quotes view (read-only)

(function () {
  'use strict';

  var db = firebase.firestore();

  window.PortalQuotes = { render: render };

  function render(container) {
    container.innerHTML = '<p class="portal-empty">Loading quotes…</p>';

    var clientId = window.PortalAuth && window.PortalAuth.clientId;
    if (!clientId) return;

    db.collection('quotes')
      .where('clientId', '==', clientId)
      .get()
      .then(function (snap) {
        if (snap.empty) {
          container.innerHTML = [
            '<h2 class="portal-section-title">Quotes</h2>',
            '<div class="portal-card"><div class="portal-empty">No quotes yet.</div></div>'
          ].join('');
          return;
        }

        var rows = snap.docs.map(function (doc) {
          var d       = doc.data();
          var created = d.createdAt ? formatDate(d.createdAt.toDate()) : '—';
          var valid   = d.validUntil ? formatDate(d.validUntil.toDate()) : '—';

          return [
            '<div class="portal-list-row">',
              '<div>',
                '<div class="portal-list-primary">' + esc(d.currency || 'USD') + ' Quote</div>',
                '<div class="portal-list-secondary">Issued ' + created + ' · Valid until ' + valid + '</div>',
              '</div>',
              '<div style="display:flex;align-items:center;gap:var(--space-3)">',
                '<span class="pbadge pbadge-' + quoteStatusClass(d.status) + '">' + esc(d.status || 'draft') + '</span>',
                '<div style="text-align:right">' +
                  '<div class="portal-list-amount">' + formatCurrency(d.total, d.currency) + '</div>' +
                  (d.exchangeRate ? '<div class="portal-secondary-currency">' + formatSecondary(d.total, d.currency, d.exchangeRate) + '</div>' : '') +
                '</div>',
              '</div>',
            '</div>'
          ].join('');
        });

        container.innerHTML = [
          '<h2 class="portal-section-title">Quotes</h2>',
          '<div class="portal-card">' + rows.join('') + '</div>'
        ].join('');
      })
      .catch(function (err) {
        console.error('[portal-quotes]', err.message);
        container.innerHTML = '<p class="portal-error-state">Failed to load quotes.</p>';
      });
  }

  function formatSecondary(amount, currency, rate) {
    if (!amount || !rate) return '';
    try {
      if (currency === 'MXN') return '≈ ' + formatCurrency(amount / rate, 'USD');
      return '≈ ' + formatCurrency(amount * rate, 'MXN');
    } catch (e) { return ''; }
  }

  function quoteStatusClass(status) {
    var map = { draft: 'neutral', sent: 'info', accepted: 'success', declined: 'error', expired: 'warning' };
    return map[status] || 'neutral';
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatCurrency(amount, currency) {
    if (!amount) return '—';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2 }).format(amount);
    } catch (e) { return (currency || '') + ' ' + amount; }
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
