// guide-briefings.js — amig0 | OCTech Services
// Guide PWA: Guide briefings for this tour — collapsible cards

(function () {
  'use strict';

  var db = firebase.firestore();

  window.GuideBriefings = { render: render };

  function render(container) {
    container.innerHTML = '<p class="guide-empty">Loading briefings…</p>';

    var tourId = window.GuideAuth && window.GuideAuth.tourId;
    if (!tourId) return;

    // Load guide briefings for this tour — filter type in JS to avoid composite index
    db.collection('briefings')
      .where('tourId', '==', tourId)
      .get()
      .then(function (snap) {
        var guideBriefings = snap.docs.filter(function (d) {
          var type = d.data().type;
          return type === 'guide' || type === 'internal';
        });

        if (guideBriefings.length === 0) {
          container.innerHTML = [
            '<h2 class="guide-section-title">Briefings</h2>',
            '<div class="guide-card"><div class="guide-empty">No briefings for this tour yet.</div></div>'
          ].join('');
          return;
        }

        var cards = guideBriefings.map(function (doc, index) {
          var d  = doc.data();
          var id = 'briefing-' + index;

          return [
            '<div class="guide-briefing-card" id="' + id + '">',
              '<div class="guide-briefing-header" data-id="' + id + '">',
                '<div>',
                  '<div class="guide-briefing-title">' + esc(d.title || 'Briefing') + '</div>',
                  '<div style="font-size:0.75rem;color:var(--color-text-muted);margin-top:2px">',
                    '<span class="gbadge gbadge-' + briefingTypeClass(d.type) + '">' + esc(d.type || 'guide') + '</span>',
                    d.updatedAt ? ' &nbsp;Updated ' + formatDate(d.updatedAt.toDate()) : '',
                  '</div>',
                '</div>',
                '<span class="guide-briefing-toggle">&#9660;</span>',
              '</div>',
              '<div class="guide-briefing-body">' + esc(d.content || '') + '</div>',
            '</div>'
          ].join('');
        });

        container.innerHTML = [
          '<h2 class="guide-section-title">Briefings</h2>',
          cards.join('')
        ].join('');

        // Accordion toggle
        container.querySelectorAll('.guide-briefing-header').forEach(function (header) {
          header.addEventListener('click', function () {
            var card = document.getElementById(header.getAttribute('data-id'));
            card.classList.toggle('is-open');
          });
        });

        // Auto-open first briefing
        var first = container.querySelector('.guide-briefing-card');
        if (first) first.classList.add('is-open');
      })
      .catch(function (err) {
        console.error('[guide-briefings]', err.message);
        container.innerHTML = '<p class="guide-error-state">Failed to load briefings.</p>';
      });
  }

  function briefingTypeClass(type) {
    var map = { guide: 'info', internal: 'warning', client: 'success' };
    return map[type] || 'neutral';
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
