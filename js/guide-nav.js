// guide-nav.js — amig0 | OCTech Services
// Guide PWA: Bottom nav routing

(function () {
  'use strict';

  var content   = document.getElementById('guide-content');
  var navItems  = document.querySelectorAll('.gnav-item');

  var sections = {
    today:      window.GuideToday,
    itinerary:  window.GuideItinerary,
    passengers: window.GuidePassengers,
    briefings:  window.GuideBriefings
  };

  var current = null;

  window.GuideNav = { init: init };

  function init() {
    navItems.forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        navigate(item.getAttribute('data-section'));
      });
    });

    // Start on Today
    navigate('today');
  }

  function navigate(section) {
    if (current === section) return;
    current = section;

    navItems.forEach(function (item) {
      item.classList.toggle('active', item.getAttribute('data-section') === section);
    });

    var mod = sections[section];
    if (mod && typeof mod.render === 'function') {
      mod.render(content);
    } else {
      content.innerHTML = '<p class="guide-empty">Section not available.</p>';
    }
  }

})();
