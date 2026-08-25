// portal-invoices.js — amig0 | OCTech Services
// Portal: client's invoices view (read-only) with balance summary

(function () {
  'use strict';

  var db = firebase.firestore();

  window.PortalInvoices = { render: render };

  function render(container) {
    container.innerHTML = '<p class="portal-empty">Loading invoices…</p>';

    var clientId = window.PortalAuth && window.PortalAuth.clientId;
    if (!clientId) return;

    db.collection('invoices')
      .where('clientId', '==', clientId)
      .get()
      .then(function (snap) {
        if (snap.empty) {
          container.innerHTML = [
            '<h2 class="portal-section-title">Invoices</h2>',
            '<div class="portal-card"><div class="portal-empty">No invoices yet.</div></div>'
          ].join('');
          return;
        }

        var totalBalance = 0;
        var totalPaid    = 0;

        var rows = snap.docs.map(function (doc) {
          var d       = doc.data();
          var due     = d.dueDate   ? formatDate(d.dueDate.toDate())   : '—';
          var balance = (d.total || 0) - (d.amountPaid || 0);
          totalBalance += balance;
          totalPaid    += (d.amountPaid || 0);

          var balanceStyle = balance > 0 ? 'color:var(--color-error);font-weight:700' : 'color:var(--color-success);font-weight:700';

          return [
            '<div class="portal-list-row">',
              '<div>',
                '<div class="portal-list-primary">' + esc(d.invoiceNumber || 'Invoice') + '</div>',
                '<div class="portal-list-secondary">Due ' + due + ' · Paid ' + formatCurrency(d.amountPaid || 0, d.currency) + '</div>',
              '</div>',
              '<div style="display:flex;align-items:center;gap:var(--space-3)">',
                '<span class="pbadge pbadge-' + invoiceStatusClass(d.status) + '">' + esc(d.status || 'draft') + '</span>',
                '<div style="text-align:right">',
                  '<div class="portal-list-amount">' + formatCurrency(d.total, d.currency) + '</div>',
                  (d.exchangeRate ? '<div class="portal-secondary-currency">' + formatSecondary(d.total, d.currency, d.exchangeRate) + '</div>' : ''),
                  balance > 0 ? '<div style="font-size:0.75rem;' + balanceStyle + '">Balance: ' + formatCurrency(balance, d.currency) + '</div>' : '<div style="font-size:0.75rem;color:var(--color-success)">Paid in full</div>',
                '</div>',
              '</div>',
            '</div>'
          ].join('');
        });

        // Summary card
        var firstCurrency = snap.docs[0].data().currency || 'USD';
        var summary = [
          '<div class="portal-card" style="margin-bottom:var(--space-5)">',
            '<div class="portal-card-header"><span class="portal-card-title">Payment Summary</span></div>',
            '<div class="portal-card-body" style="display:flex;gap:var(--space-8)">',
              '<div>',
                '<div style="font-size:0.75rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:var(--space-1)">Total Paid</div>',
                '<div style="font-size:1.4rem;font-weight:700;color:var(--color-success)">' + formatCurrency(totalPaid, firstCurrency) + '</div>',
              '</div>',
              '<div>',
                '<div style="font-size:0.75rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:var(--space-1)">Outstanding</div>',
                '<div style="font-size:1.4rem;font-weight:700;color:' + (totalBalance > 0 ? 'var(--color-error)' : 'var(--color-success)') + '">' + formatCurrency(totalBalance, firstCurrency) + '</div>',
              '</div>',
            '</div>',
          '</div>'
        ].join('');

        container.innerHTML = [
          '<h2 class="portal-section-title">Invoices</h2>',
          summary,
          '<div class="portal-card">' + rows.join('') + '</div>'
        ].join('');
      })
      .catch(function (err) {
        console.error('[portal-invoices]', err.message);
        container.innerHTML = '<p class="portal-error-state">Failed to load invoices.</p>';
      });
  }

  function formatSecondary(amount, currency, rate) {
    if (!amount || !rate) return '';
    try {
      if (currency === 'MXN') return '≈ ' + formatCurrency(amount / rate, 'USD');
      return '≈ ' + formatCurrency(amount * rate, 'MXN');
    } catch (e) { return ''; }
  }

  function invoiceStatusClass(status) {
    var map = { draft: 'neutral', sent: 'info', partial: 'warning', paid: 'success', overdue: 'error', cancelled: 'neutral' };
    return map[status] || 'neutral';
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatCurrency(amount, currency) {
    if (amount === undefined || amount === null) return '—';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2 }).format(amount);
    } catch (e) { return (currency || '') + ' ' + amount; }
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
