// portal-itinerary.js — amig0 | OCTech Services
// Portal: Day-by-day itinerary for client's confirmed tour

(function () {
  'use strict';

  var db = firebase.firestore();

  window.PortalItinerary = { render: render };

  function render(container) {
    container.innerHTML = '<p class="portal-empty">Loading itinerary…</p>';

    var clientId = window.PortalAuth && window.PortalAuth.clientId;
    if (!clientId) return;

    db.collection('bookings')
      .where('clientId', '==', clientId)
      .get()
      .then(function (snap) {
        var confirmed = snap.docs.filter(function (d) { return d.data().status === 'confirmed'; });

        if (confirmed.length === 0) {
          container.innerHTML = '<h2 class="portal-section-title">Itinerary</h2><div class="portal-card"><div class="portal-empty">No confirmed tour found.</div></div>';
          return;
        }

        var tourId = confirmed[0].data().tourId;

        return db.collection('tours').doc(tourId).get()
          .then(function (tourDoc) {
            var tourName = tourDoc.exists ? (tourDoc.data().name || 'Your Tour') : 'Your Tour';

            return db.collection('tours').doc(tourId)
              .collection('itineraries')
              .orderBy('day')
              .get()
              .then(function (iSnap) {
                if (iSnap.empty) {
                  container.innerHTML = [
                    '<h2 class="portal-section-title">Itinerary</h2>',
                    '<div class="portal-card">',
                      '<div class="portal-empty">Your itinerary is being prepared. Check back soon.</div>',
                    '</div>'
                  ].join('');
                  return;
                }

                var days = iSnap.docs.map(function (doc) {
                  var d    = doc.data();
                  var date = d.date ? formatDate(d.date.toDate()) : '';
                  return [
                    '<div class="itinerary-day">',
                      '<div class="itinerary-day-num">D' + (d.day || '?') + '</div>',
                      '<div class="itinerary-day-body">',
                        '<div class="itinerary-day-title">' + esc(d.title || 'Day ' + d.day) + '</div>',
                        d.location ? '<div class="itinerary-day-location">&#9679; ' + esc(d.location) + (date ? ' &nbsp;·&nbsp; ' + date : '') + '</div>' : '',
                        d.description ? '<div class="itinerary-day-desc">' + esc(d.description) + '</div>' : '',
                      '</div>',
                    '</div>'
                  ].join('');
                });

                container.innerHTML = [
                  '<h2 class="portal-section-title">Itinerary — ' + esc(tourName) + '</h2>',
                  '<div class="portal-card">',
                    days.join(''),
                  '</div>'
                ].join('');
              });
          });
      })
      .catch(function (err) {
        console.error('[portal-itinerary]', err.message);
        container.innerHTML = '<p class="portal-error-state">Failed to load itinerary. Please try again.</p>';
      });
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
