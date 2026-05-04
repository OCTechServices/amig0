// portal-nav.js — amig0-travel-company | OCTech Services
// Portal navigation — section routing

(function () {
  'use strict';

  window.PortalNav = { init: init };

  var sections = {
    overview:  { label: 'My Trip',   module: function (el) { window.PortalOverview  && window.PortalOverview.render(el); } },
    itinerary: { label: 'Itinerary', module: function (el) { window.PortalItinerary && window.PortalItinerary.render(el); } },
    quotes:    { label: 'Quotes',    module: function (el) { window.PortalQuotes    && window.PortalQuotes.render(el); } },
    invoices:  { label: 'Invoices',  module: function (el) { window.PortalInvoices  && window.PortalInvoices.render(el); } },
    perks:       { label: 'Perks',       module: function (el) { window.PortalPerks       && window.PortalPerks.render(el); } },
    map:         { label: 'Map',         module: function (el) { window.PortalMap         && window.PortalMap.render(el); } },
    marketplace: { label: 'Marketplace', module: function (el) { window.PortalMarketplace && window.PortalMarketplace.render(el); } }
  };

  function init() {
    var links   = document.querySelectorAll('.pnav-link');
    var content = document.getElementById('portal-content');

    links.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var section = link.getAttribute('data-section');
        setActive(section, links, content);
      });
    });

    setActive('overview', links, content);
  }

  function setActive(section, links, content) {
    links.forEach(function (l) { l.classList.remove('active'); });
    var activeLink = document.querySelector('.pnav-link[data-section="' + section + '"]');
    if (activeLink) activeLink.classList.add('active');
    content.innerHTML = '';
    if (sections[section]) sections[section].module(content);
  }

})();
