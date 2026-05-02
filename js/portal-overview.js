// portal-overview.js — amig0-travel-company | OCTech Services
// Portal: My Trip overview — upcoming tour hero + fellow passengers

(function () {
  'use strict';

  var db = firebase.firestore();

  window.PortalOverview = { render: render };

  function render(container) {
    container.innerHTML = '<p class="portal-empty">Loading your trip…</p>';

    var clientId = window.PortalAuth && window.PortalAuth.clientId;
    if (!clientId) return;

    // Load bookings for this client — filter status in JS to avoid composite index requirement
    db.collection('bookings')
      .where('clientId', '==', clientId)
      .get()
      .then(function (snap) {
        // Filter confirmed bookings in JS
        var confirmed = snap.docs.filter(function (d) { return d.data().status === 'confirmed'; });

        if (confirmed.length === 0) {
          container.innerHTML = [
            '<h2 class="portal-section-title">My Trip</h2>',
            '<div class="portal-card">',
              '<div class="portal-empty">You have no confirmed bookings yet.<br>Contact your tour operator for assistance.</div>',
            '</div>'
          ].join('');
          return;
        }

        // Take the first confirmed booking
        var booking   = confirmed[0].data();
        var bookingId = confirmed[0].id;

        return db.collection('tours').doc(booking.tourId).get()
          .then(function (tourDoc) {
            if (!tourDoc.exists) return;
            var tour = tourDoc.data();

            // Load fellow passengers on same tour.
            // Failure handled gracefully — My Trip still renders without the list on network error.
            return db.collection('bookings')
              .where('tourId', '==', booking.tourId)
              .get()
              .then(function (fellowSnap) {
                var passengerIds = fellowSnap.docs
                  .filter(function (d) { return d.data().status === 'confirmed'; })
                  .map(function (d) { return d.data().passengerId; })
                  .filter(Boolean);

                if (passengerIds.length === 0) {
                  renderOverview(container, tour, booking, []);
                  return;
                }

                // Fetch passenger names in batches of 10 (Firestore 'in' limit)
                var batch = passengerIds.slice(0, 10);
                return db.collection('passengers')
                  .where(firebase.firestore.FieldPath.documentId(), 'in', batch)
                  .get()
                  .then(function (pSnap) {
                    var passengers = pSnap.docs.map(function (d) { return d.data(); });
                    renderOverview(container, tour, booking, passengers);
                  });
              })
              .catch(function () {
                // Passengers query blocked by security rules — render without the list
                renderOverview(container, tour, booking, []);
              });
          });
      })
      .catch(function (err) {
        console.error('[portal-overview]', err.message);
        container.innerHTML = '<p class="portal-error-state">Failed to load your trip. Please try again.</p>';
      });
  }

  function renderOverview(container, tour, booking, passengers) {
    var start     = tour.startDate ? formatDate(tour.startDate.toDate()) : 'TBC';
    var end       = tour.endDate   ? formatDate(tour.endDate.toDate())   : 'TBC';
    var duration  = (tour.startDate && tour.endDate)
      ? daysBetween(tour.startDate.toDate(), tour.endDate.toDate()) + ' days'
      : '—';

    var passengerRows = passengers.length === 0
      ? '<div class="portal-empty">No fellow passengers listed yet.</div>'
      : passengers.map(function (p) {
          var name = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Traveller';
          return [
            '<div class="passenger-row">',
              '<span class="passenger-name">' + esc(name) + '</span>',
              '<span class="passenger-meta">' + esc(p.nationality || '') + '</span>',
            '</div>'
          ].join('');
        }).join('');

    container.innerHTML = [
      '<h2 class="portal-section-title">My Trip</h2>',

      // Tour hero
      '<div class="tour-hero">',
        '<div class="tour-hero-label">Upcoming Tour</div>',
        '<div class="tour-hero-name">' + esc(tour.name || 'Your Tour') + '</div>',
        '<div class="tour-hero-meta">',
          '<div class="tour-hero-meta-item">',
            '<span class="tour-hero-meta-label">Destination</span>',
            '<span class="tour-hero-meta-value">' + esc(tour.destination || '—') + '</span>',
          '</div>',
          '<div class="tour-hero-meta-item">',
            '<span class="tour-hero-meta-label">Start</span>',
            '<span class="tour-hero-meta-value">' + start + '</span>',
          '</div>',
          '<div class="tour-hero-meta-item">',
            '<span class="tour-hero-meta-label">End</span>',
            '<span class="tour-hero-meta-value">' + end + '</span>',
          '</div>',
          '<div class="tour-hero-meta-item">',
            '<span class="tour-hero-meta-label">Duration</span>',
            '<span class="tour-hero-meta-value">' + duration + '</span>',
          '</div>',
        '</div>',
      '</div>',

      // Booking status
      '<div class="portal-card">',
        '<div class="portal-card-header">',
          '<span class="portal-card-title">Booking Status</span>',
          '<span class="pbadge pbadge-success">Confirmed</span>',
        '</div>',
        '<div class="portal-card-body" style="font-size:0.9rem;color:var(--color-text-secondary)">',
          'Your place on this tour is confirmed. Contact your tour operator if you have any questions.',
        '</div>',
      '</div>',

      // Fellow passengers
      '<div class="portal-card">',
        '<div class="portal-card-header">',
          '<span class="portal-card-title">Fellow Travellers</span>',
          '<span style="font-size:0.8rem;color:var(--color-text-muted)">' + passengers.length + ' confirmed</span>',
        '</div>',
        passengerRows,
      '</div>',
    ].join('');
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function daysBetween(start, end) {
    return Math.round((end - start) / (1000 * 60 * 60 * 24));
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
