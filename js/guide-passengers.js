// guide-passengers.js — amig0 | OCTech Services
// Guide PWA: Confirmed passenger roster with dietary/medical flags

(function () {
  'use strict';

  var db = firebase.firestore();

  window.GuidePassengers = { render: render };

  function render(container) {
    container.innerHTML = '<p class="guide-empty">Loading passengers…</p>';

    var tourId = window.GuideAuth && window.GuideAuth.tourId;
    if (!tourId) return;

    // Load bookings for this tour, filter confirmed in JS
    db.collection('bookings')
      .where('tourId', '==', tourId)
      .get()
      .then(function (snap) {
        var confirmedIds = snap.docs
          .filter(function (d) { return d.data().status === 'confirmed'; })
          .map(function (d) { return d.data().passengerId; })
          .filter(Boolean);

        if (confirmedIds.length === 0) {
          container.innerHTML = [
            '<h2 class="guide-section-title">Passengers</h2>',
            '<div class="guide-card"><div class="guide-empty">No confirmed passengers yet.</div></div>'
          ].join('');
          return;
        }

        // Fetch passengers in batches of 10 (Firestore 'in' limit)
        var batches = [];
        for (var i = 0; i < confirmedIds.length; i += 10) {
          batches.push(confirmedIds.slice(i, i + 10));
        }

        return Promise.all(batches.map(function (batch) {
          return db.collection('passengers')
            .where(firebase.firestore.FieldPath.documentId(), 'in', batch)
            .get()
            .then(function (pSnap) {
              return pSnap.docs.map(function (d) { return d.data(); });
            });
        })).then(function (results) {
          var passengers = [].concat.apply([], results);

          // Sort by last name
          passengers.sort(function (a, b) {
            return (a.lastName || '').localeCompare(b.lastName || '');
          });

          var rows = passengers.map(function (p) {
            var name    = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Traveller';
            var initials = [(p.firstName || '').charAt(0), (p.lastName || '').charAt(0)]
              .filter(Boolean).join('').toUpperCase() || '?';

            var flags = [];
            if (p.dietaryRequirements && p.dietaryRequirements.trim()) {
              flags.push('<span class="guide-flag guide-flag-dietary">&#127860; ' + esc(p.dietaryRequirements) + '</span>');
            }
            if (p.medicalNotes && p.medicalNotes.trim()) {
              flags.push('<span class="guide-flag guide-flag-medical">&#9763; Medical note</span>');
            }

            return [
              '<div class="guide-passenger-row">',
                '<div class="guide-passenger-avatar">' + initials + '</div>',
                '<div class="guide-passenger-info">',
                  '<div class="guide-passenger-name">' + esc(name) + '</div>',
                  '<div class="guide-passenger-meta">',
                    [
                      p.nationality ? esc(p.nationality) : '',
                      p.phone       ? esc(p.phone)       : ''
                    ].filter(Boolean).join(' · ') || '&nbsp;',
                  '</div>',
                  flags.length ? '<div class="guide-passenger-flags">' + flags.join('') + '</div>' : '',
                '</div>',
              '</div>'
            ].join('');
          });

          container.innerHTML = [
            '<h2 class="guide-section-title">Passengers <span style="font-size:1rem;font-weight:500;color:var(--color-text-muted)">(' + passengers.length + ')</span></h2>',
            '<div class="guide-card">' + rows.join('') + '</div>'
          ].join('');
        });
      })
      .catch(function (err) {
        console.error('[guide-passengers]', err.message);
        container.innerHTML = '<p class="guide-error-state">Failed to load passengers.</p>';
      });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
