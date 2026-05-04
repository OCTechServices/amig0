// portal-perks.js — amig0-travel-company | OCTech Services
// Portal: Partner Perks — verified partner directory + my check-in history

(function () {
  'use strict';

  var db   = firebase.firestore();
  var auth = firebase.auth();

  window.PortalPerks = { render: render };

  var CATEGORY_LABELS = {
    restaurant:     'Restaurant',
    bar:            'Bar',
    transport:      'Transport',
    experience:     'Experience',
    shop:           'Shop',
    accommodation:  'Accommodation',
    other:          'Other'
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = '<p class="portal-empty">Loading perks…</p>';

    var user = auth.currentUser;
    if (!user) return;

    // Load active partners and user's check-ins in parallel
    Promise.all([
      db.collection('partners').where('active', '==', true).get(),
      db.collection('checkins')
        .where('userId', '==', user.uid)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get()
    ])
    .then(function (results) {
      var partnersSnap = results[0];
      var checkinsSnap = results[1];

      var partners = partnersSnap.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });

      var checkins = checkinsSnap.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });

      renderPerks(container, partners, checkins);
    })
    .catch(function (err) {
      console.error('[portal-perks]', err.message);
      container.innerHTML = '<p class="portal-error-state">Failed to load perks. Please try again.</p>';
    });
  }

  // ---------------------------------------------------------------------------
  // Render perks directory + history
  // ---------------------------------------------------------------------------
  function renderPerks(container, partners, checkins) {
    // Build partner lookup for check-in history
    var partnerMap = {};
    partners.forEach(function (p) { partnerMap[p.id] = p; });

    // Group partners by category
    var grouped = {};
    partners.forEach(function (p) {
      var cat = p.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });

    var categoryOrder = ['restaurant', 'bar', 'experience', 'transport', 'shop', 'accommodation', 'other'];

    var partnerSections = partners.length === 0
      ? '<div class="portal-empty">No verified partners yet — check back soon.</div>'
      : categoryOrder.filter(function (c) { return grouped[c]; }).map(function (cat) {
          var list = grouped[cat].map(function (p) {
            return buildPartnerCard(p);
          }).join('');
          return (
            '<div class="perks-category-group">' +
              '<h3 class="perks-category-label">' + esc(CATEGORY_LABELS[cat] || cat) + '</h3>' +
              '<div class="perks-card-grid">' + list + '</div>' +
            '</div>'
          );
        }).join('');

    // Check-in history
    var historyRows = checkins.length === 0
      ? '<div class="portal-empty">No check-ins yet — scan a partner QR to claim your first perk.</div>'
      : checkins.map(function (c) {
          var p   = partnerMap[c.partnerId];
          var name = p ? p.name : 'Unknown Partner';
          var discount = p ? p.discount : '';
          var ts = c.timestamp ? formatTimestamp(c.timestamp.toDate()) : '—';
          return (
            '<div class="checkin-history-row">' +
              '<div class="checkin-history-left">' +
                '<span class="checkin-history-name">' + esc(name) + '</span>' +
                (discount ? '<span class="checkin-history-perk">' + esc(discount) + '</span>' : '') +
              '</div>' +
              '<span class="checkin-history-date">' + ts + '</span>' +
            '</div>'
          );
        }).join('');

    container.innerHTML = [
      '<h2 class="portal-section-title">Partner Perks</h2>',

      // Intro
      '<div class="portal-card">',
        '<div class="portal-card-body" style="font-size:0.9rem;color:var(--color-text-secondary)">',
          'Show your Amig0 QR code at any verified partner below to claim your exclusive perk. ' +
          'Scan the partner\'s QR code to log your visit.',
        '</div>',
      '</div>',

      // Partner directory
      '<div class="portal-card">',
        '<div class="portal-card-header">',
          '<span class="portal-card-title">Verified Partners</span>',
          '<span style="font-size:0.8rem;color:var(--color-text-muted)">' + partners.length + ' locations</span>',
        '</div>',
        partnerSections,
      '</div>',

      // My check-ins
      '<div class="portal-card">',
        '<div class="portal-card-header">',
          '<span class="portal-card-title">My Check-Ins</span>',
          '<span style="font-size:0.8rem;color:var(--color-text-muted)">' + checkins.length + ' visits</span>',
        '</div>',
        historyRows,
      '</div>',
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Partner card
  // ---------------------------------------------------------------------------
  function buildPartnerCard(p) {
    var catLabel = CATEGORY_LABELS[p.category] || 'Partner';
    return (
      '<div class="perks-card">' +
        '<div class="perks-card-top">' +
          '<span class="perks-category-badge">' + esc(catLabel) + '</span>' +
          (p.verified ? '<span class="perks-verified-badge">&#10003; Verified</span>' : '') +
        '</div>' +
        '<div class="perks-card-name">' + esc(p.name) + '</div>' +
        (p.address ? '<div class="perks-card-address">' + esc(p.address) + (p.city ? ', ' + esc(p.city) : '') + '</div>' : '') +
        (p.discount
          ? '<div class="perks-card-perk">' +
              '<span class="perks-card-perk-label">Your perk</span>' +
              '<span class="perks-card-perk-value">' + esc(p.discount) + '</span>' +
            '</div>'
          : '') +
        (p.description ? '<div class="perks-card-desc">' + esc(p.description) + '</div>' : '') +
      '</div>'
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function formatTimestamp(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
