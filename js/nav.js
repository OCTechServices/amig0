// nav.js — amig0 | OCTech Services
// Sidebar navigation: active state, section title, content area placeholder
// Depends on: auth.js (app-shell must be in DOM)

(function () {
  'use strict';

  var sectionTitles = {
    dashboard:  'Dashboard',
    clients:    cfg('clients'),
    tours:      cfg('tours'),
    passengers: cfg('passengers'),
    bookings:   cfg('bookings'),
    quotes:     'Quotes',
    invoicing:  'Invoicing',
    providers:  cfg('providers'),
    partners:    'Partner Network',
    marketplace: 'Marketplace',
    invites:     'Invite Codes',
    guides:      cfg('guides'),
    briefings:  cfg('briefings'),
    operators:  'Operators',
    reports:    'Reports',
  };

  // Apply config labels to nav link text and sidebar tagline
  var tagline = document.getElementById('sidebar-tagline');
  if (tagline && window.AppConfig) tagline.textContent = window.AppConfig.brandTagline;

  document.querySelectorAll('.nav-label[data-cfg]').forEach(function (el) {
    el.textContent = cfg(el.getAttribute('data-cfg'));
  });

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
    } else if (section === 'clients' && window.Clients) {
      window.Clients.render(contentArea);
    } else if (section === 'tours' && window.Tours) {
      window.Tours.render(contentArea);
    } else if (section === 'passengers' && window.Passengers) {
      window.Passengers.render(contentArea);
    } else if (section === 'bookings' && window.Bookings) {
      window.Bookings.render(contentArea);
    } else if (section === 'quotes' && window.Quotes) {
      window.Quotes.render(contentArea);
    } else if (section === 'invoicing' && window.Invoicing) {
      window.Invoicing.render(contentArea);
    } else if (section === 'providers' && window.Providers) {
      window.Providers.render(contentArea);
    } else if (section === 'partners' && window.Partners) {
      window.Partners.render(contentArea);
    } else if (section === 'marketplace' && window.Marketplace) {
      window.Marketplace.render(contentArea);
    } else if (section === 'invites' && window.Invites) {
      window.Invites.render(contentArea);
    } else if (section === 'guides' && window.Guides) {
      window.Guides.render(contentArea);
    } else if (section === 'briefings' && window.Briefings) {
      window.Briefings.render(contentArea);
    } else if (section === 'operators' && window.Operators) {
      window.Operators.render(contentArea);
    } else if (section === 'reports' && window.Reports) {
      window.Reports.render(contentArea);
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
