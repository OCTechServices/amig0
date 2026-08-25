// portal-map.js — amig0 | OCTech Services
// Portal: Partner Map — Leaflet pins for verified partners + user Amig0 QR pass

(function () {
  'use strict';

  var db   = firebase.firestore();
  var auth = firebase.auth();

  window.PortalMap = { render: render };

  var MEXICO_CITY = [19.4326, -99.1332];
  var HOSTING_URL = 'https://amig0-travel-company-52fb1.web.app';

  var mapInstance = null;

  var CATEGORY_COLORS = {
    restaurant:    '#E8A045',
    bar:           '#1B3D28',
    transport:     '#1E40AF',
    experience:    '#7C3AED',
    shop:          '#BE185D',
    accommodation: '#047857',
    other:         '#6B7280'
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render(container) {
    // Destroy previous Leaflet instance to avoid "Map already initialised" error
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }

    var user = auth.currentUser;
    if (!user) return;

    var clientId   = window.PortalAuth && window.PortalAuth.clientId;
    var clientName = window.PortalAuth && window.PortalAuth.clientName || 'Traveller';

    container.innerHTML = [
      '<h2 class="portal-section-title">Partner Map</h2>',

      // User pass / personal QR
      '<div class="portal-card">',
        '<div class="portal-card-header">',
          '<span class="portal-card-title">Your Amig0 Pass</span>',
          '<span style="font-size:0.8rem;color:var(--color-text-muted)">Show at any partner venue</span>',
        '</div>',
        '<div class="map-pass-body">',
          '<img class="map-pass-qr" src="' + buildQRSrc(clientId || user.uid) + '" alt="Your Amig0 QR pass" width="80" height="80">',
          '<div class="map-pass-text">',
            '<p class="map-pass-name">' + esc(clientName) + '</p>',
            '<p class="map-pass-hint">Show this QR code at any verified Amig0 partner to unlock your exclusive perk.</p>',
          '</div>',
        '</div>',
      '</div>',

      // Map
      '<div class="portal-card">',
        '<div class="portal-card-header">',
          '<span class="portal-card-title">Verified Partners</span>',
          '<span id="map-partner-count" style="font-size:0.8rem;color:var(--color-text-muted)">Loading…</span>',
        '</div>',
        '<div id="portal-map-el" class="portal-map-el"></div>',
      '</div>',

      // Partners without coordinates (fallback list)
      '<div id="map-no-coords-wrap"></div>',
    ].join('');

    // Small timeout lets the DOM paint before Leaflet measures the container
    setTimeout(initMap, 50);
  }

  // ---------------------------------------------------------------------------
  // Leaflet init
  // ---------------------------------------------------------------------------
  function initMap() {
    var el = document.getElementById('portal-map-el');
    if (!el) return;

    if (typeof L === 'undefined') {
      el.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--color-text-muted)">Map library unavailable — check your connection.</p>';
      return;
    }

    mapInstance = L.map('portal-map-el', { zoomControl: true }).setView(MEXICO_CITY, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(mapInstance);

    loadPartners();
  }

  // ---------------------------------------------------------------------------
  // Load partners and plot pins
  // ---------------------------------------------------------------------------
  function loadPartners() {
    db.collection('partners').where('active', '==', true).get()
      .then(function (snap) {
        var partners      = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        var withCoords    = partners.filter(function (p) { return p.lat != null && p.lng != null; });
        var withoutCoords = partners.filter(function (p) { return p.lat == null || p.lng == null; });

        var countEl = document.getElementById('map-partner-count');
        if (countEl) countEl.textContent = partners.length + ' location' + (partners.length !== 1 ? 's' : '');

        withCoords.forEach(function (p) { addPin(p); });

        // Fit map to pins if any; else default Mexico City view
        if (withCoords.length > 0 && mapInstance) {
          var bounds = L.latLngBounds(withCoords.map(function (p) { return [p.lat, p.lng]; }));
          mapInstance.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
        }

        // No-coordinates fallback list
        var wrap = document.getElementById('map-no-coords-wrap');
        if (wrap && withoutCoords.length > 0) {
          wrap.innerHTML = [
            '<div class="portal-card">',
              '<div class="portal-card-header">',
                '<span class="portal-card-title">More Partners</span>',
                '<span style="font-size:0.8rem;color:var(--color-text-muted)">Not yet on map</span>',
              '</div>',
              withoutCoords.map(function (p) {
                return (
                  '<div class="checkin-history-row">' +
                    '<div class="checkin-history-left">' +
                      '<span class="checkin-history-name">' + esc(p.name) + '</span>' +
                      (p.discount ? '<span class="checkin-history-perk">' + esc(p.discount) + '</span>' : '') +
                    '</div>' +
                    '<span class="checkin-history-date">' + esc(p.city || p.address || '—') + '</span>' +
                  '</div>'
                );
              }).join(''),
            '</div>'
          ].join('');
        }
      })
      .catch(function (err) {
        console.error('[portal-map] load:', err.message);
        var el = document.getElementById('portal-map-el');
        if (el) el.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--color-error)">Failed to load partners.</p>';
      });
  }

  // ---------------------------------------------------------------------------
  // Add a single pin
  // ---------------------------------------------------------------------------
  function addPin(p) {
    if (!mapInstance) return;

    var color = CATEGORY_COLORS[p.category] || '#6B7280';

    var icon = L.divIcon({
      className:   '',
      html:        '<div class="map-pin" style="background:' + color + ';border-color:' + color + '"></div>',
      iconSize:    [18, 18],
      iconAnchor:  [9, 9],
      popupAnchor: [0, -14]
    });

    var popup = [
      '<div class="map-popup">',
        '<div class="map-popup-name">' + esc(p.name) + '</div>',
        (p.address
          ? '<div class="map-popup-address">' + esc(p.address) + (p.city ? ', ' + esc(p.city) : '') + '</div>'
          : ''),
        (p.discount
          ? '<div class="map-popup-perk">' +
              '<span class="map-popup-perk-label">Your perk</span> ' +
              '<span class="map-popup-perk-value">' + esc(p.discount) + '</span>' +
            '</div>'
          : ''),
        (p.description
          ? '<div class="map-popup-desc">' + esc(p.description) + '</div>'
          : ''),
      '</div>'
    ].join('');

    L.marker([p.lat, p.lng], { icon: icon })
      .addTo(mapInstance)
      .bindPopup(popup, { maxWidth: 260, className: 'amigo-popup' });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function buildQRSrc(id) {
    var data = HOSTING_URL + '/checkin?client=' + encodeURIComponent(id);
    return 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=' + encodeURIComponent(data);
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
