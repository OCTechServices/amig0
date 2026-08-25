// config.js — amig0 | OCTech Services
// Instance configuration — branding, labels, locale.
// Fork this file per deployment. Never hardcode instance values in module code.
//
// To create a new instance:
//   1. Fork the repo
//   2. Replace this file with the new instance config
//   3. Replace firebase-config.js with the new Firebase project config
//   4. Deploy

(function () {
  'use strict';

  window.AppConfig = {

    // -------------------------------------------------------------------------
    // Branding
    // -------------------------------------------------------------------------
    brandName:    'Amig0 Travel',
    brandTagline: 'Travel CRM',

    // Page titles — set per app shell
    crmTitle:    'Amig0 Travel — CRM',
    portalTitle: 'Amig0 Travel — My Trip',
    guideTitle:  'Amig0 — Guide',
    guideAppName: 'Amig0 Guide',

    // PDF header — two-line brand mark
    pdfBrandMark: 'Amig0',
    pdfBrandSub:  'Travel Company',

    // Site URL — used in PDF footer
    siteUrl: 'amig0travel.com',

    // -------------------------------------------------------------------------
    // Terminology — singular and plural for each entity
    // Swap these per instance (e.g. tour → retreat, passenger → participant)
    // -------------------------------------------------------------------------
    labels: {
      // Core entities
      client:     'Client',
      clients:    'Clients',
      tour:       'Tour',
      tours:      'Tours',
      passenger:  'Passenger',
      passengers: 'Passengers',
      booking:    'Booking',
      bookings:   'Bookings',
      guide:      'Guide',
      guides:     'Guides',
      briefing:   'Briefing',
      briefings:  'Briefings',
      provider:   'Provider',
      providers:  'Providers',

      // Actions — derived from entities above by default, override if needed
      addTour:      'Add Tour',
      addPassenger: 'Add Passenger',
      addBooking:   'Add Booking',
      addGuide:     'Add Guide',
      addBriefing:  'Add Briefing',
      addProvider:  'Add Provider',
    },

    // -------------------------------------------------------------------------
    // Locale & currency
    // -------------------------------------------------------------------------
    defaultCurrency: 'USD',
    locale:          'en-US',
    dateLocale:      'en-GB',

  };

  // ---------------------------------------------------------------------------
  // cfg(key) — label lookup helper, available globally to all modules
  // Usage: cfg('tour') → 'Tour'  |  cfg('tours') → 'Tours'
  // ---------------------------------------------------------------------------
  window.cfg = function (key) {
    return (
      window.AppConfig &&
      window.AppConfig.labels &&
      window.AppConfig.labels[key] !== undefined
        ? window.AppConfig.labels[key]
        : key
    );
  };

})();
