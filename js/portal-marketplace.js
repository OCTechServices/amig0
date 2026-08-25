// portal-marketplace.js — amig0 | OCTech Services
// Portal: Marketplace — invite-gated open tour seat listings

(function () {
  'use strict';

  var db   = firebase.firestore();
  var auth = firebase.auth();

  window.PortalMarketplace = { render: render };

  var HOSTING_URL = 'https://amig0-travel-company-52fb1.web.app';

  // ---------------------------------------------------------------------------
  // Render — check access first
  // ---------------------------------------------------------------------------
  function render(container) {
    container.innerHTML = '<p class="portal-empty">Loading…</p>';

    var user = auth.currentUser;
    if (!user) return;

    db.collection('user_profiles').doc(user.uid).get()
      .then(function (doc) {
        var profile = doc.exists ? doc.data() : {};
        if (profile.marketplaceAccess === true) {
          renderListings(container);
        } else {
          renderGate(container, user);
        }
      })
      .catch(function (err) {
        console.error('[portal-marketplace] profile:', err.message);
        renderGate(container, user);
      });
  }

  // ---------------------------------------------------------------------------
  // Access gate — invite code entry
  // ---------------------------------------------------------------------------
  function renderGate(container, user) {
    container.innerHTML = [
      '<h2 class="portal-section-title">Marketplace</h2>',
      '<div class="portal-card" style="max-width:480px;margin:0 auto">',
        '<div class="portal-card-header">',
          '<span class="portal-card-title">Invite Required</span>',
        '</div>',
        '<div class="portal-card-body">',
          '<p style="font-size:0.9rem;color:var(--color-text-secondary);margin-bottom:var(--space-5)">',
            'The Amig0 Marketplace is invite-only. Enter your invite code below to unlock exclusive open tour seats.',
          '</p>',
          '<div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-3)">',
            '<input id="invite-code-input" type="text" placeholder="XXXX-XXXX" maxlength="9"',
              ' style="flex:1;padding:var(--space-3) var(--space-4);border:1.5px solid var(--color-border);border-radius:var(--radius-sm);font-family:monospace;font-size:1rem;text-transform:uppercase;letter-spacing:0.08em;background:var(--color-bg)">',
            '<button id="invite-redeem-btn" class="pbtn pbtn-primary" style="white-space:nowrap">Unlock</button>',
          '</div>',
          '<p id="invite-gate-error" style="font-size:0.82rem;color:var(--color-error);min-height:1.2em"></p>',
          '<p style="font-size:0.78rem;color:var(--color-text-muted)">',
            'Don\'t have a code? Contact your tour operator to request access.',
          '</p>',
        '</div>',
      '</div>',
    ].join('');

    var input   = document.getElementById('invite-code-input');
    var btn     = document.getElementById('invite-redeem-btn');
    var errEl   = document.getElementById('invite-gate-error');

    // Auto-format: insert dash after 4 chars
    input.addEventListener('input', function () {
      var val = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (val.length > 4) val = val.slice(0, 4) + '-' + val.slice(4, 8);
      this.value = val;
    });

    btn.addEventListener('click', function () {
      var code = input.value.trim().toUpperCase();
      if (code.length < 9) {
        errEl.textContent = 'Enter a full 8-character invite code (format: XXXX-XXXX).';
        return;
      }
      errEl.textContent = '';
      btn.disabled    = true;
      btn.textContent = 'Checking…';
      redeemCode(code, user, container, errEl, btn);
    });
  }

  // ---------------------------------------------------------------------------
  // Redeem invite code
  // ---------------------------------------------------------------------------
  function redeemCode(code, user, container, errEl, btn) {
    var now = firebase.firestore.Timestamp.now();

    // Query invite by code
    db.collection('invites')
      .where('code', '==', code)
      .limit(1)
      .get()
      .then(function (snap) {
        if (snap.empty) {
          throw new Error('invalid');
        }

        var inviteDoc = snap.docs[0];
        var invite    = inviteDoc.data();

        if (invite.usedByUid) {
          throw new Error('used');
        }
        if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
          throw new Error('expired');
        }

        // Mark invite as used + grant portal access in a batch
        var batch = db.batch();

        batch.update(inviteDoc.ref, {
          usedByUid:   user.uid,
          usedByEmail: user.email || null,
          usedAt:      firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.update(
          db.collection('user_profiles').doc(user.uid),
          { marketplaceAccess: true }
        );

        return batch.commit();
      })
      .then(function () {
        // Access granted — show listings
        renderListings(container);
      })
      .catch(function (err) {
        var msg = {
          invalid: 'This invite code is not recognised.',
          used:    'This invite code has already been redeemed.',
          expired: 'This invite code has expired.',
        }[err.message] || 'Failed to validate code. Please try again.';

        errEl.textContent = msg;
        btn.disabled    = false;
        btn.textContent = 'Unlock';
      });
  }

  // ---------------------------------------------------------------------------
  // Listings view
  // ---------------------------------------------------------------------------
  function renderListings(container) {
    container.innerHTML = '<p class="portal-empty">Loading listings…</p>';

    db.collection('marketplace_listings')
      .where('status', '==', 'active')
      .get()
      .then(function (snap) {
        if (snap.empty) {
          container.innerHTML = [
            '<h2 class="portal-section-title">Marketplace</h2>',
            '<div class="portal-card"><div class="portal-empty">No open listings right now. Check back soon.</div></div>'
          ].join('');
          return;
        }

        var featured = snap.docs.filter(function (d) { return d.data().featured; });
        var regular  = snap.docs.filter(function (d) { return !d.data().featured; });
        var ordered  = featured.concat(regular);

        var cards = ordered.map(function (doc) {
          return buildListingCard(doc.id, doc.data());
        }).join('');

        container.innerHTML = [
          '<h2 class="portal-section-title">Marketplace</h2>',
          '<div class="portal-card" style="margin-bottom:var(--space-5)">',
            '<div class="portal-card-body" style="font-size:0.875rem;color:var(--color-text-secondary)">',
              'These are exclusive open seats on upcoming Amig0 tours. Places are limited — contact us to reserve yours.',
            '</div>',
          '</div>',
          '<div class="mkt-card-grid">' + cards + '</div>',
        ].join('');
      })
      .catch(function (err) {
        console.error('[portal-marketplace] listings:', err.message);
        container.innerHTML = '<p class="portal-error-state">Failed to load listings.</p>';
      });
  }

  // ---------------------------------------------------------------------------
  // Listing card
  // ---------------------------------------------------------------------------
  function buildListingCard(id, d) {
    var start    = d.startDate ? formatDate(d.startDate.toDate()) : null;
    var end      = d.endDate   ? formatDate(d.endDate.toDate())   : null;
    var dateStr  = start ? (end && end !== start ? start + ' – ' + end : start) : 'Dates TBC';
    var price    = d.pricePerSeat ? formatCurrency(d.pricePerSeat, d.currency) + ' / seat' : 'Contact for price';
    var seats    = d.seatsAvailable || 0;
    var subject  = encodeURIComponent('Marketplace Inquiry: ' + (d.title || 'Tour'));
    var body     = encodeURIComponent('Hi,\n\nI\'m interested in the listing: ' + (d.title || '') + '\n\nPlease let me know how to reserve a seat.\n\nThank you');
    var mailto   = 'mailto:contact@opcoretech.com?subject=' + subject + '&body=' + body; // RAID I11 resolved

    return [
      '<div class="mkt-card' + (d.featured ? ' mkt-card-featured' : '') + '">',
        d.featured ? '<div class="mkt-card-featured-badge">Featured</div>' : '',
        '<div class="mkt-card-top">',
          '<span class="mkt-card-dest">' + esc(d.destination || 'Destination TBC') + '</span>',
          '<span class="mkt-card-seats">' + seats + ' seat' + (seats !== 1 ? 's' : '') + ' left</span>',
        '</div>',
        '<h3 class="mkt-card-title">' + esc(d.title || 'Tour Listing') + '</h3>',
        '<p class="mkt-card-dates">' + esc(dateStr) + '</p>',
        d.description ? '<p class="mkt-card-desc">' + esc(d.description) + '</p>' : '',
        '<div class="mkt-card-footer">',
          '<span class="mkt-card-price">' + price + '</span>',
          '<a href="' + mailto + '" class="pbtn pbtn-primary" style="font-size:0.85rem;padding:0.5rem 1rem">Reserve a Seat</a>',
        '</div>',
      '</div>'
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatCurrency(amount, currency) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 0 }).format(amount);
    } catch (e) { return (currency || '') + ' ' + amount; }
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
