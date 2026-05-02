// guide-itinerary.js — amig0-travel-company | OCTech Services
// Guide PWA: Full day-by-day itinerary — today's day highlighted

(function () {
  'use strict';

  var db = firebase.firestore();

  window.GuideItinerary = { render: render };

  function render(container) {
    container.innerHTML = '<p class="guide-empty">Loading itinerary…</p>';

    var tourId = window.GuideAuth && window.GuideAuth.tourId;
    if (!tourId) return;

    db.collection('tours').doc(tourId)
      .collection('itineraries')
      .orderBy('day')
      .get()
      .then(function (snap) {
        if (snap.empty) {
          container.innerHTML = [
            '<h2 class="guide-section-title">Itinerary</h2>',
            '<div class="guide-card"><div class="guide-empty">No itinerary added yet.</div></div>'
          ].join('');
          return;
        }

        var today = new Date();
        today.setHours(0, 0, 0, 0);

        var days = snap.docs.map(function (doc) {
          var d = doc.data();

          var isToday = false;
          if (d.date) {
            var dayDate = d.date.toDate();
            dayDate.setHours(0, 0, 0, 0);
            isToday = dayDate.getTime() === today.getTime();
          }

          var dateStr = d.date ? formatDate(d.date.toDate()) : '';

          return [
            '<div class="guide-itinerary-day' + (isToday ? ' is-today' : '') + '">',
              '<div class="guide-day-num">D' + (d.day || '?') + '</div>',
              '<div class="guide-day-body">',
                '<div class="guide-day-title">',
                  esc(d.title || 'Day ' + d.day),
                  isToday ? ' &nbsp;<span class="gbadge gbadge-success">Today</span>' : '',
                '</div>',
                (d.location || dateStr) ? '<div class="guide-day-meta">' + (d.location ? '&#9679; ' + esc(d.location) : '') + (d.location && dateStr ? ' &nbsp;·&nbsp; ' : '') + dateStr + '</div>' : '',
                d.description ? '<div class="guide-day-desc">' + esc(d.description) + '</div>' : '',
              '</div>',
            '</div>'
          ].join('');
        });

        container.innerHTML = [
          '<h2 class="guide-section-title">Itinerary</h2>',
          '<div class="guide-card">' + days.join('') + '</div>'
        ].join('');
      })
      .catch(function (err) {
        console.error('[guide-itinerary]', err.message);
        container.innerHTML = '<p class="guide-error-state">Failed to load itinerary.</p>';
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
