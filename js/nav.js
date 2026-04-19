// nav.js — amig0-travel-company | OCTech Services
// Sidebar navigation: active state, section title, content area placeholder
// Depends on: auth.js (app-shell must be in DOM)

(function () {
  'use strict';

  var sectionTitles = {
    dashboard:  'Dashboard',
    clients:    'Clients',
    tours:      'Tours',
    passengers: 'Passengers',
    quotes:     'Quotes',
    invoicing:  'Invoicing',
    providers:  'Providers',
    briefings:  'Briefings',
  };

  var navLinks    = document.querySelectorAll('.nav-link');
  var sectionTitle = document.getElementById('section-title');
  var contentArea  = document.getElementById('content-area');

  navLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var section = link.getAttribute('data-section');
      setActiveSection(section);
    });
  });

  function setActiveSection(section) {
    // Update active link
    navLinks.forEach(function (l) { l.classList.remove('active'); });
    var activeLink = document.querySelector('.nav-link[data-section="' + section + '"]');
    if (activeLink) activeLink.classList.add('active');

    // Update topbar title
    sectionTitle.textContent = sectionTitles[section] || section;

    // Delegate to section module if available, else placeholder
    contentArea.innerHTML = '';
    if (section === 'dashboard' && window.Dashboard) {
      window.Dashboard.render(contentArea);
    } else {
      contentArea.innerHTML = buildPlaceholder(section);
    }
  }

  function buildPlaceholder(section) {
    var title = sectionTitles[section] || section;
    return (
      '<div class="section-placeholder">' +
        '<p class="section-placeholder-title">' + title + '</p>' +
        '<p class="section-placeholder-body">This section is coming soon.</p>' +
      '</div>'
    );
  }

  // Render dashboard placeholder on load
  setActiveSection('dashboard');

})();
