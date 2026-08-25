// guide-today.js — amig0 | OCTech Services
// Guide PWA: Today view — current day hero + tour stats

(function () {
  'use strict';

  var db = firebase.firestore();

  window.GuideToday = { render: render };

  function render(container) {
    container.innerHTML = '<p class="guide-empty">Loading today\'s schedule…</p>';

    var tourId = window.GuideAuth && window.GuideAuth.tourId;
    if (!tourId) return;

    // Load tour + itineraries in parallel
    Promise.all([
      db.collection('tours').doc(tourId).get(),
      db.collection('tours').doc(tourId).collection('itineraries').orderBy('day').get(),
      db.collection('bookings').where('tourId', '==', tourId).get()
    ])
      .then(function (results) {
        var tourDoc      = results[0];
        var iSnap        = results[1];
        var bookingsSnap = results[2];

        if (!tourDoc.exists) {
          container.innerHTML = '<p class="guide-error-state">Tour not found.</p>';
          return;
        }

        var tour = tourDoc.data();
        var confirmedCount = bookingsSnap.docs.filter(function (d) {
          return d.data().status === 'confirmed';
        }).length;

        // Find today's itinerary day
        var today    = new Date();
        today.setHours(0, 0, 0, 0);
        var todayDay = null;

        var days = iSnap.docs.map(function (doc) {
          var d = doc.data();
          if (d.date) {
            var dayDate = d.date.toDate();
            dayDate.setHours(0, 0, 0, 0);
            if (dayDate.getTime() === today.getTime()) todayDay = d;
          }
          return d;
        });

        // If no exact date match, fall back to day number relative to tour start
        if (!todayDay && tour.startDate && days.length > 0) {
          var start = tour.startDate.toDate();
          start.setHours(0, 0, 0, 0);
          var dayNum = Math.floor((today - start) / 86400000) + 1;
          todayDay = days.find(function (d) { return d.day === dayNum; }) || null;
        }

        var start    = tour.startDate ? formatDate(tour.startDate.toDate()) : 'TBC';
        var end      = tour.endDate   ? formatDate(tour.endDate.toDate())   : 'TBC';
        var daysLeft = (tour.endDate)
          ? Math.max(0, Math.ceil((tour.endDate.toDate() - today) / 86400000))
          : null;

        // Hero block
        var heroHtml;
        if (todayDay) {
          var dateStr = todayDay.date ? formatDateLong(todayDay.date.toDate()) : formatDateLong(today);
          heroHtml = [
            '<div class="today-hero">',
              '<div class="today-hero-day">Day ' + (todayDay.day || '?') + ' &nbsp;·&nbsp; ' + dateStr + '</div>',
              '<div class="today-hero-title">' + esc(todayDay.title || 'Today') + '</div>',
              todayDay.location ? '<div class="today-hero-location">&#9679; ' + esc(todayDay.location) + '</div>' : '',
              todayDay.description ? '<div class="today-hero-desc">' + esc(todayDay.description) + '</div>' : '',
            '</div>'
          ].join('');
        } else {
          heroHtml = [
            '<div class="today-hero">',
              '<div class="today-hero-day">' + formatDateLong(today) + '</div>',
              '<div class="today-hero-title">' + esc(tour.name || 'Your Tour') + '</div>',
              '<div class="today-hero-desc">No itinerary entry for today. Check the Itinerary tab for the full schedule.</div>',
            '</div>'
          ].join('');
        }

        // Stats
        var statsHtml = [
          '<div class="today-stats">',
            '<div class="today-stat">',
              '<div class="today-stat-label">Destination</div>',
              '<div class="today-stat-value" style="font-size:1rem">' + esc(tour.destination || '—') + '</div>',
            '</div>',
            '<div class="today-stat">',
              '<div class="today-stat-label">Passengers</div>',
              '<div class="today-stat-value">' + confirmedCount + '</div>',
            '</div>',
            daysLeft !== null ? [
              '<div class="today-stat">',
                '<div class="today-stat-label">Days Left</div>',
                '<div class="today-stat-value">' + daysLeft + '</div>',
              '</div>'
            ].join('') : '',
          '</div>'
        ].join('');

        // Tour info card
        var infoHtml = [
          '<div class="guide-card">',
            '<div class="guide-card-header">',
              '<span class="guide-card-title">Tour Info</span>',
              '<span class="gbadge gbadge-' + tourStatusClass(tour.status) + '">' + esc(tour.status || 'draft') + '</span>',
            '</div>',
            '<div class="guide-card-body" style="display:flex;flex-direction:column;gap:var(--space-2)">',
              '<div style="display:flex;justify-content:space-between;font-size:0.875rem">',
                '<span style="color:var(--color-text-muted)">Start</span>',
                '<span>' + start + '</span>',
              '</div>',
              '<div style="display:flex;justify-content:space-between;font-size:0.875rem">',
                '<span style="color:var(--color-text-muted)">End</span>',
                '<span>' + end + '</span>',
              '</div>',
              '<div style="display:flex;justify-content:space-between;font-size:0.875rem">',
                '<span style="color:var(--color-text-muted)">Capacity</span>',
                '<span>' + confirmedCount + ' / ' + (tour.capacity || '—') + '</span>',
              '</div>',
            '</div>',
          '</div>'
        ].join('');

        container.innerHTML = [
          '<h2 class="guide-section-title">Today</h2>',
          heroHtml,
          statsHtml,
          infoHtml
        ].join('');
      })
      .catch(function (err) {
        console.error('[guide-today]', err.message);
        container.innerHTML = '<p class="guide-error-state">Failed to load today\'s schedule.</p>';
      });
  }

  function tourStatusClass(status) {
    var map = { draft: 'neutral', confirmed: 'info', active: 'success', completed: 'neutral', cancelled: 'error' };
    return map[status] || 'neutral';
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatDateLong(date) {
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
