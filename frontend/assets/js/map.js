/**
 * Defence GIS — Leaflet Map Controller
 *
 * Implements smooth Uber-like marker interpolation, directional SVG icons,
 * satellite/terrain view toggles, fullscreen view, legend, "Follow Asset" mode,
 * and sidebar search/filter controls.
 */
'use strict';

var API_BASE = '/DefenceGIS/api';

var MapController = {
    map: null,
    assetLayer: null,
    zoneLayer: null,
    wmsLayer: null,
    zoneLayers: {},
    assetMarkers: {},    // assetId → Leaflet marker
    prevPositions: {},   // assetId → {lat, lng} (for interpolation)
    followedAssetId: null, // assetId currently being followed
    searchQuery: '',
    filterType: 'all',
    filterStatus: 'all',
    assetCache: [],      // cache of latest asset states

    // ── Base Maps ────────────────────────────────────────────────────────────
    tileLayers: {
        osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            referrerPolicy: 'strict-origin-when-cross-origin',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
        }),

        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri'
        }),

        terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            maxZoom: 17,
            attribution: 'Map data &copy; OpenTopoMap'
        })
    },

    init: function(containerId) {
        if (this.map) return;
        var self = this;
        this.zoneLayers = {};

        this.map = L.map(containerId, {
            center: [26.2389, 73.0243],
            zoom: 13,
            zoomControl: true
        });

        // Add default base layer
        this.tileLayers.osm.addTo(this.map);

        this.assetLayer = L.layerGroup().addTo(this.map);
        this.zoneLayer = L.layerGroup().addTo(this.map);

        // Add Layer Switcher (Satellite, Terrain, etc.)
        var baseMaps = {
            "🌐 Street View": this.tileLayers.osm,
            "🛰️ Satellite View": this.tileLayers.satellite,
            "⛰️ Terrain View": this.tileLayers.terrain
        };
        var overlayMaps = {
            "🚁 Active Assets": this.assetLayer,
            "📍 Geofence Zones": this.zoneLayer
        };
        L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(this.map);

        // Scale bar
        L.control.scale({ imperial: false }).addTo(this.map);

        // Custom Fullscreen Control
        L.Control.Fullscreen = L.Control.extend({
            onAdd: function(map) {
                var btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom');
                btn.innerHTML = '📺';
                btn.title = 'Toggle Fullscreen';
                btn.style.width = '30px';
                btn.style.height = '30px';
                btn.style.fontSize = '14px';
                btn.style.background = 'var(--color-surface)';
                btn.style.color = 'var(--color-text-primary)';
                btn.style.border = '1px solid var(--color-card-border)';
                btn.style.borderRadius = 'var(--radius-sm)';
                btn.style.cursor = 'pointer';
                btn.style.display = 'flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';

                btn.onclick = function() {
                    var container = map.getContainer();
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                        btn.innerHTML = '📺';
                    } else {
                        container.requestFullscreen();
                        btn.innerHTML = '✖';
                    }
                };
                return btn;
            }
        });
        new L.Control.Fullscreen({ position: 'topleft' }).addTo(this.map);

        // Circular Compass dial
        L.Control.Compass = L.Control.extend({
            onAdd: function(map) {
                var div = L.DomUtil.create('div', 'leaflet-bar compass-control');
                div.style.width = '36px';
                div.style.height = '36px';
                div.style.background = 'var(--color-surface)';
                div.style.border = '1px solid var(--color-card-border)';
                div.style.borderRadius = '50%';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.justifyContent = 'center';
                div.style.boxShadow = 'var(--shadow-sm)';
                div.style.cursor = 'pointer';
                div.title = 'North Indicator';

                div.innerHTML =
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none">' +
                    '  <circle cx="12" cy="12" r="10" stroke="var(--color-text-muted)" stroke-width="1.5"/>' +
                    '  <polygon points="12,4 15,12 12,10 9,12" fill="var(--color-danger)"/>' +
                    '  <polygon points="12,20 15,12 12,10 9,12" fill="var(--color-text-secondary)"/>' +
                    '  <text x="12" y="9" font-size="6" font-family="sans-serif" font-weight="bold" fill="var(--color-danger)" text-anchor="middle">N</text>' +
                    '</svg>';
                return div;
            }
        });
        new L.Control.Compass({ position: 'topleft' }).addTo(this.map);

        // Coordinates display
        L.Control.MousePosition = L.Control.extend({
            onAdd: function(map) {
                var div = L.DomUtil.create('div', 'leaflet-bar mouse-position-control');
                div.style.padding = '4px 8px';
                div.style.background = 'var(--color-surface)';
                div.style.color = 'var(--color-text-secondary)';
                div.style.border = '1px solid var(--color-card-border)';
                div.style.borderRadius = 'var(--radius-sm)';
                div.style.fontSize = '11px';
                div.style.fontFamily = 'var(--font-mono)';
                div.innerHTML = 'Lat: — | Lng: —';

                map.on('mousemove', function(e) {
                    div.innerHTML = 'Lat: ' + e.latlng.lat.toFixed(5) + ' | Lng: ' + e.latlng.lng.toFixed(5);
                });
                return div;
            }
        });
        new L.Control.MousePosition({ position: 'bottomleft' }).addTo(this.map);

        // Auto center (follow) toggle control
        L.Control.AutoCenter = L.Control.extend({
            onAdd: function(map) {
                var btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom auto-center-control');
                btn.innerHTML = '🎯';
                btn.title = 'Toggle Auto-Center / Follow Mode';
                btn.style.width = '30px';
                btn.style.height = '30px';
                btn.style.fontSize = '14px';
                btn.style.background = 'var(--color-surface)';
                btn.style.color = 'var(--color-text-primary)';
                btn.style.border = '1px solid var(--color-card-border)';
                btn.style.borderRadius = 'var(--radius-sm)';
                btn.style.cursor = 'pointer';
                btn.style.display = 'flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';

                btn.onclick = function() {
                    if (self.followedAssetId) {
                        self.followedAssetId = null;
                        btn.style.background = 'var(--color-surface)';
                        btn.style.color = 'var(--color-text-primary)';
                        if (typeof App !== 'undefined') App.showToast('Follow Mode: DISABLED', 'info');
                    } else {
                        var keys = Object.keys(self.assetMarkers);
                        if (keys.length > 0) {
                            self.followedAssetId = parseInt(keys[0]);
                            var marker = self.assetMarkers[self.followedAssetId];
                            if (marker) {
                                map.setView(marker.getLatLng(), 15);
                                marker.openPopup();
                            }
                            btn.style.background = 'var(--color-accent)';
                            btn.style.color = 'var(--color-primary)';
                            if (typeof App !== 'undefined') App.showToast('Follow Mode: ENABLED', 'success');
                        } else {
                            if (typeof App !== 'undefined') App.showToast('No active assets to follow', 'warning');
                        }
                    }
                    self.loadAssetMarkers();
                };
                self.autoCenterBtn = btn;
                return btn;
            }
        });
        new L.Control.AutoCenter({ position: 'topleft' }).addTo(this.map);

        // Custom Legend Control
        L.Control.Legend = L.Control.extend({
            onAdd: function(map) {
                var div = L.DomUtil.create('div', 'leaflet-bar legend-control');
                div.style.padding = '8px 12px';
                div.style.background = 'var(--color-surface)';
                div.style.color = 'var(--color-text-primary)';
                div.style.border = '1px solid var(--color-card-border)';
                div.style.fontSize = '11px';
                div.style.borderRadius = 'var(--radius-md)';
                div.style.lineHeight = '1.6';

                div.innerHTML =
                    '<strong style="color:var(--color-accent)">🗺️ LEGEND</strong><br>' +
                    '<span style="color:#00e676;">●</span> Moving (Active)<br>' +
                    '<span style="color:#ffab40;">●</span> Idle (Parked)<br>' +
                    '<span style="color:#ff5252;">●</span> Offline (Comms Lost)<br>' +
                    '<span style="color:#bb86fc;">●</span> Fixed Station<br>' +
                    '<hr style="margin:4px 0; border-color:var(--color-card-border);">' +
                    '<span style="display:inline-block;width:10px;height:10px;background:#f00;opacity:0.3;margin-right:4px;"></span> Restricted Zone<br>' +
                    '<span style="display:inline-block;width:10px;height:10px;background:#f80;opacity:0.3;margin-right:4px;"></span> Warning Zone';
                return div;
            }
        });
        new L.Control.Legend({ position: 'bottomright' }).addTo(this.map);

        // Map resets highlight when popup closed
        this.map.on('popupclose', function() {
            self.resetZoneStyles();
        });

        // Initialize sidebar listeners if on live tracking page
        this.initSidebarListeners();
    },

    loadAssetMarkers: function() {
        var self = this;
        fetch(API_BASE + '/positions/latest', { credentials: 'same-origin' })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.status !== 'success' || !res.data) return;
                var features = res.data.features || [];
                self.assetCache = features;

                // Sync sidebar UI lists
                self.syncAssetSidebar();

                features.forEach(function(feature) {
                    var p    = feature.properties;
                    var id   = p.assetId;
                    var lnglat = feature.geometry.coordinates;
                    var newLat = lnglat[1], newLng = lnglat[0];

                    // Check status: moving (speed > 2 km/h), offline (not updated for 60s), else idle
                    var status = 'idle';
                    if (p.speed > 2) {
                        status = 'moving';
                    }
                    // If recordedAt is more than 60s ago, class as offline
                    var lastUpdate = p.recordedAt ? new Date(p.recordedAt) : null;
                    if (lastUpdate && (new Date() - lastUpdate) > 60000) {
                        status = 'offline';
                    }

                    // Check selected state
                    var isSelected = (id === self.followedAssetId);

                    // Direction arrow / asset icon HTML
                    var iconHtml = self.getAssetSvgHtml(p.assetType, status, p.heading || 0, isSelected, p.assetName);

                    var popupContent =
                        '<div class="asset-popup" style="font-size:12px;color:var(--color-text-primary);min-width:200px;">' +
                        '  <strong style="font-size:14px;color:var(--color-accent);">' + p.assetName + '</strong> (' + p.assetCode + ')<br>' +
                        '  <hr style="margin:4px 0; border-color:var(--color-card-border);">' +
                        '  <strong>Type:</strong> ' + p.assetType.toUpperCase() + '<br>' +
                        '  <strong>Status:</strong> <span class="badge badge-' + (status === 'moving' ? 'success' : status === 'offline' ? 'danger' : 'warning') + '">' + status.toUpperCase() + '</span><br>' +
                        '  <strong>Speed:</strong> ' + (p.speed || 0).toFixed(1) + ' km/h<br>' +
                        '  <strong>Heading:</strong> ' + Math.round(p.heading || 0) + '°<br>' +
                        '  <strong>Altitude:</strong> ' + Math.round(p.altitude || 0) + ' m<br>' +
                        '  <strong>Updated:</strong> ' + (lastUpdate ? lastUpdate.toLocaleTimeString('en-IN') : '—') + '<br>' +
                        '  <button class="btn btn-primary btn-sm" style="width:100%;margin-top:6px;" onclick="MapController.toggleFollow(' + id + ')">' +
                        (isSelected ? '❌ Unfollow' : '🎯 Follow Asset') + '</button>' +
                        '</div>';

                    if (self.assetMarkers[id]) {
                        // Animate marker move over 5000ms (100 steps)
                        var prev = self.prevPositions[id];
                        if (prev && (prev.lat !== newLat || prev.lng !== newLng)) {
                            self.animateMarker(self.assetMarkers[id], prev.lat, prev.lng, newLat, newLng, 100);
                        } else {
                            self.assetMarkers[id].setLatLng([newLat, newLng]);
                        }
                        self.assetMarkers[id].setIcon(L.divIcon({
                            className: '', html: iconHtml, iconSize: [36, 36], iconAnchor: [18, 18]
                        }));
                        self.assetMarkers[id].getPopup().setContent(popupContent);
                    } else {
                        // Create marker
                        var icon = L.divIcon({
                            className: '', html: iconHtml, iconSize: [36, 36], iconAnchor: [18, 18]
                        });
                        var marker = L.marker([newLat, newLng], { icon: icon })
                            .bindPopup(popupContent)
                            .addTo(self.assetLayer);
                        self.assetMarkers[id] = marker;
                    }

                    // Keep track of coordinates
                    self.prevPositions[id] = { lat: newLat, lng: newLng };

                    // Follow mode: pan map in real-time
                    if (isSelected) {
                        self.map.panTo([newLat, newLng]);
                    }
                });
            })
            .catch(function(err) {
                console.error('Failed to load asset markers:', err);
            });
    },

    /** Animate transition between coordinates in 100 steps over 5000ms. */
    animateMarker: function(marker, lat1, lng1, lat2, lng2, steps) {
        var step = 0;
        var intervalMs = 5000 / steps; // 50ms per step
        var iv = setInterval(function() {
            step++;
            var t   = step / steps;
            var lat = lat1 + (lat2 - lat1) * t;
            var lng = lng1 + (lng2 - lng1) * t;
            marker.setLatLng([lat, lng]);
            if (step >= steps) clearInterval(iv);
        }, intervalMs);
    },

    /** Custom Professional SVGs for Asset Types */
    getAssetSvgHtml: function(type, status, heading, isSelected, name) {
        // Base color determined by type for high contrast on all maps
        var color = '#2f80ed'; // Default Vehicle (Military Blue)
        if (type === 'drone') {
            color = '#00d4ff'; // Cyan
        } else if (type === 'tank') {
            color = '#7f9a60'; // Olive Green
        } else if (type === 'person') {
            color = '#ffffff'; // White
        } else if (type === 'radar_station' || type === 'radar') {
            color = '#bb86fc'; // Purple
        } else if (name && name.includes('Medical')) {
            color = '#ff5252'; // Red + White cross
        } else if (name && (name.includes('Comms') || name.includes('Communication'))) {
            color = '#ff9100'; // Orange
        } else if (name && name.includes('Command')) {
            color = '#1f3c6d'; // Dark Blue
        }

        var isSpecialRadar = (type === 'radar_station' || type === 'radar');

        // Status Indicator Dot color
        var statusColor = '#ffab40'; // idle (Yellow)
        if (status === 'moving') statusColor = '#00e676'; // moving (Green)
        else if (status === 'offline') statusColor = '#ff5252'; // offline (Red)

        // Selection style classes and custom elements
        var extraClass = isSelected ? ' marker-selected' : '';
        var selectedHaloStyle = isSelected ? 'border: 2px solid #ffffff; box-shadow: 0 0 15px #00d4ff, inset 0 0 8px #00d4ff;' : '';

        // SVG shape selector
        var svgBody = '';
        var rotateSvg = true;

        if (type === 'drone') {
            // Drone: quadcopter with central body and arms
            svgBody = '<circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5" />' +
                      '<path d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />' +
                      '<circle cx="4" cy="4" r="1.8" fill="none" stroke="currentColor" stroke-width="1" />' +
                      '<circle cx="20" cy="4" r="1.8" fill="none" stroke="currentColor" stroke-width="1" />' +
                      '<circle cx="4" cy="20" r="1.8" fill="none" stroke="currentColor" stroke-width="1" />' +
                      '<circle cx="20" cy="20" r="1.8" fill="none" stroke="currentColor" stroke-width="1" />' +
                      '<polygon points="12,5 9,8 15,8" fill="currentColor" />';
        } else if (type === 'tank') {
            // Tank turret and tracks
            svgBody = '<rect x="3" y="3" width="3.5" height="18" rx="1" fill="#475569" />' +
                      '<rect x="17.5" y="3" width="3.5" height="18" rx="1" fill="#475569" />' +
                      '<rect x="6.5" y="5" width="11" height="14" rx="2" fill="currentColor" />' +
                      '<rect x="8.5" y="10" width="7" height="6" rx="1.5" fill="#0f172a" stroke="currentColor" stroke-width="0.8" />' +
                      '<rect x="11.2" y="1" width="1.6" height="10" fill="currentColor" />' +
                      '<rect x="10.2" y="1" width="3.6" height="1.2" fill="currentColor" />';
        } else if (type === 'person') {
            // Soldier walking/standing icon (no rotation)
            rotateSvg = false;
            svgBody = '<circle cx="12" cy="6" r="4.5" fill="currentColor" stroke="#060f1d" stroke-width="1" />' +
                      '<path d="M6 13c0-2 1.5-3.5 3.5-4h5c2 0.5 3.5 2 3.5 4v4h-2.5v6h-2v-6h-3v6h-2v-6H6v-4z" fill="currentColor" stroke="#060f1d" stroke-width="1" />' +
                      '<line x1="8" y1="14" x2="16" y2="15" stroke="#060f1d" stroke-width="2" stroke-linecap="round" />';
        } else if (isSpecialRadar) {
            // Radar antenna dish with scanner wave rings (no rotation)
            rotateSvg = false;
            svgBody = '<path d="M6 21h12v-1.5H6V21zM12 19.5v-4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />' +
                      '<path d="M4 11.5a8 8 0 0116 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />' +
                      '<circle cx="12" cy="11.5" r="1.5" fill="currentColor" />' +
                      '<line x1="12" y1="11.5" x2="12" y2="6.5" stroke="currentColor" stroke-width="1.8" />' +
                      '<circle cx="12" cy="5.5" r="1.5" fill="currentColor" />' +
                      '<path d="M9.5 4a3.5 3.5 0 015 0M7.5 2a6.5 6.5 0 019 0" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" />';
        } else if (name && name.includes('Medical')) {
            // Medical Vehicle (Red cross top view on white base or vice versa)
            svgBody = '<rect x="6" y="2" width="12" height="20" rx="2.5" fill="currentColor" />' +
                      '<rect x="7" y="5.5" width="10" height="2.5" fill="#0f172a" opacity="0.65" />' +
                      '<rect x="4" y="7" width="2" height="3" rx="0.5" fill="currentColor" />' +
                      '<rect x="18" y="7" width="2" height="3" rx="0.5" fill="currentColor" />' +
                      '<rect x="8.5" y="10.5" width="7" height="7" rx="1.5" fill="#ffffff" />' +
                      '<path d="M12 11.5v5M9.5 14h5" stroke="#ff5252" stroke-width="2" stroke-linecap="round" />';
        } else if (name && name.includes('Command')) {
            // Command Vehicle top view
            svgBody = '<rect x="6" y="3" width="12" height="18" rx="3" fill="currentColor" />' +
                      '<rect x="7.5" y="6" width="9" height="2.5" fill="#0f172a" opacity="0.65" />' +
                      '<rect x="4.5" y="7" width="1.5" height="3" rx="0.5" fill="currentColor" />' +
                      '<rect x="18" y="7" width="1.5" height="3" rx="0.5" fill="currentColor" />' +
                      '<polygon points="12,11 13.2,13.6 16.2,13.6 13.8,15.2 14.8,18 12,16.4 9.2,18 10.2,15.2 7.8,13.6 10.8,13.6" fill="#ffd700" />';
        } else if (name && (name.includes('Comms') || name.includes('Communication'))) {
            // Comms Vehicle with satellite dish antenna
            svgBody = '<rect x="6" y="2" width="12" height="20" rx="2.5" fill="currentColor" />' +
                      '<rect x="7" y="5.5" width="10" height="2.5" fill="#0f172a" opacity="0.65" />' +
                      '<circle cx="12" cy="14" r="3" fill="none" stroke="#ffffff" stroke-width="1.2" />' +
                      '<circle cx="12" cy="14" r="0.8" fill="#ffffff" />' +
                      '<line x1="12" y1="14" x2="14" y2="16" stroke="#ffffff" stroke-width="1.2" />';
        } else {
            // Standard Military Truck
            svgBody = '<rect x="5.5" y="2" width="13" height="20" rx="2" fill="currentColor" />' +
                      '<rect x="6.5" y="5" width="11" height="2.5" fill="#0f172a" opacity="0.65" />' +
                      '<line x1="7" y1="10.5" x2="17" y2="10.5" stroke="#ffffff" stroke-width="0.8" opacity="0.5" />' +
                      '<line x1="7" y1="14.5" x2="17" y2="14.5" stroke="#ffffff" stroke-width="0.8" opacity="0.5" />' +
                      '<line x1="7" y1="18.5" x2="17" y2="18.5" stroke="#ffffff" stroke-width="0.8" opacity="0.5" />';
        }

        var transform = rotateSvg ? 'transform: rotate(' + heading + 'deg);' : '';

        // Generate final HTML with outline, drop shadow, status indicators and labels positioned safely
        return '<div class="marker-container' + extraClass + '" style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center; ' + selectedHaloStyle + ' border-radius:50%;">' +
               '  <svg style="width:24px; height:24px; ' + transform + ' transition: transform 0.15s ease-out; filter: drop-shadow(1px 0 0 #060f1d) drop-shadow(-1px 0 0 #060f1d) drop-shadow(0 1px 0 #060f1d) drop-shadow(0 -1px 0 #060f1d) drop-shadow(0 2px 4px rgba(0,0,0,0.65));" viewBox="0 0 24 24" fill="' + color + '">' +
                  svgBody +
               '  </svg>' +
               '  <span class="marker-status-dot" style="position:absolute; top:2px; right:2px; width:8px; height:8px; background:' + statusColor + '; border:1.2px solid #ffffff; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.6); z-index:5;"></span>' +
               '  <span class="marker-label" style="position:absolute; bottom:-12px; font-size:10px; font-weight:600; background:rgba(6, 15, 29, 0.85); color:#ffffff; border:1px solid rgba(0, 212, 255, 0.25); padding:1px 5px; border-radius:4px; white-space:nowrap; pointer-events:none; box-shadow:0 2px 4px rgba(0,0,0,0.5); z-index:10;">' + name.substring(0, 10) + '</span>' +
               '</div>';
    },

    showAssetDetailsCard: function(p, status) {
        var card = document.getElementById('asset-detail-card');
        if (!card) return;

        // Generate deterministic mock mission
        var mission = 'Routine Patrol';
        if (p.assetType === 'drone') mission = 'Reconnaissance Flyover';
        else if (p.assetType === 'tank') mission = 'Tactical Border Watch';
        else if (p.assetType === 'person') mission = 'Sentry Post Guard';
        else if (p.assetName.includes('Medical')) mission = 'Support / First-Aid Standby';
        else if (p.assetName && (p.assetName.includes('Comms') || p.assetName.includes('Communication'))) mission = 'Signal Relay Operations';
        else if (p.assetType === 'radar_station' || p.assetType === 'radar') mission = 'Airspace Surveillance';

        // Update elements
        document.getElementById('detail-name').textContent = p.assetName || 'Asset Details';
        document.getElementById('detail-code').textContent = p.assetCode || '—';
        document.getElementById('detail-type').textContent = (p.assetType || '—').replace('_', ' ');
        
        var statusEl = document.getElementById('detail-status');
        var badgeClass = status === 'moving' ? 'success' : status === 'offline' ? 'danger' : 'warning';
        statusEl.innerHTML = '<span class="badge badge-' + badgeClass + '">' + status.toUpperCase() + '</span>';

        document.getElementById('detail-speed').textContent = (p.speed || 0).toFixed(1) + ' km/h';
        document.getElementById('detail-heading').textContent = Math.round(p.heading || 0) + '°';
        document.getElementById('detail-altitude').textContent = Math.round(p.altitude || 0) + ' m';
        document.getElementById('detail-zone').textContent = p.currentZones || 'None';
        document.getElementById('detail-mission').textContent = mission;

        // Action buttons
        var self = this;
        var btnFollow = document.getElementById('detail-btn-follow');
        var btnZoom = document.getElementById('detail-btn-zoom');
        var btnClose = document.getElementById('detail-close');

        if (btnFollow) {
            btnFollow.innerHTML = (self.followedAssetId === p.assetId) ? '❌ Unfollow' : '🎯 Follow';
            btnFollow.onclick = function() {
                self.toggleFollow(p.assetId);
            };
        }

        if (btnZoom) {
            btnZoom.onclick = function() {
                var marker = self.assetMarkers[p.assetId];
                if (marker) {
                    self.map.setView(marker.getLatLng(), 16);
                }
            };
        }

        if (btnClose) {
            btnClose.onclick = function() {
                self.closeAssetDetailsCard();
            };
        }

        // Show card
        card.classList.remove('hidden');
    },

    closeAssetDetailsCard: function() {
        var card = document.getElementById('asset-detail-card');
        if (card) {
            card.classList.add('hidden');
        }
        this.followedAssetId = null;
        this.loadAssetMarkers();
    },

    toggleFollow: function(assetId) {
        if (this.followedAssetId === assetId) {
            this.followedAssetId = null;
            this.map.closePopup();
            console.log("Follow disabled");
        } else {
            this.followedAssetId = assetId;
            var marker = this.assetMarkers[assetId];
            if (marker) {
                marker.openPopup();
                this.map.setView(marker.getLatLng(), 15);
            }
            console.log("Following asset id=" + assetId);
        }
        
        // Sync follow button highlight
        if (this.autoCenterBtn) {
            if (this.followedAssetId) {
                this.autoCenterBtn.style.background = 'var(--color-accent)';
                this.autoCenterBtn.style.color = 'var(--color-primary)';
            } else {
                this.autoCenterBtn.style.background = 'var(--color-surface)';
                this.autoCenterBtn.style.color = 'var(--color-text-primary)';
            }
        }
        this.loadAssetMarkers(); // redraw content immediately
    },

    // ── Sidebar Syncer / Asset List Renderer ───────────────────────────────
    initSidebarListeners: function() {
        var self = this;
        var searchInput = document.getElementById('asset-search');
        var typeFilter  = document.getElementById('filter-type');
        var statFilter  = document.getElementById('filter-status');

        if (searchInput) {
            searchInput.addEventListener('input', function() {
                self.searchQuery = this.value.toLowerCase();
                self.syncAssetSidebar();
            });
        }
        if (typeFilter) {
            typeFilter.addEventListener('change', function() {
                self.filterType = this.value;
                self.syncAssetSidebar();
            });
        }
        if (statFilter) {
            statFilter.addEventListener('change', function() {
                self.filterStatus = this.value;
                self.syncAssetSidebar();
            });
        }
    },

    syncAssetSidebar: function() {
        var listContainer = document.getElementById('asset-list');
        if (!listContainer) return; // not on page with sidebar

        var self = this;
        var filtered = self.assetCache.filter(function(feature) {
            var p = feature.properties;

            // Search query filter
            var matchesSearch = p.assetName.toLowerCase().includes(self.searchQuery) ||
                                p.assetCode.toLowerCase().includes(self.searchQuery);

            // Type filter
            var matchesType = (self.filterType === 'all') || (p.assetType === self.filterType);

            // Status evaluates speed/updates
            var status = 'idle';
            if (p.speed > 2) status = 'moving';
            var lastUpdate = p.recordedAt ? new Date(p.recordedAt) : null;
            if (lastUpdate && (new Date() - lastUpdate) > 60000) status = 'offline';

            var matchesStatus = (self.filterStatus === 'all') || (status === self.filterStatus);

            return matchesSearch && matchesType && matchesStatus;
        });

        // Compute counts from cache
        var total = self.assetCache.length;
        var moving = 0, idle = 0, offline = 0;
        self.assetCache.forEach(function(f) {
            var speed = f.properties.speed || 0;
            var updated = f.properties.recordedAt ? new Date(f.properties.recordedAt) : null;
            if (updated && (new Date() - updated) > 60000) offline++;
            else if (speed > 2) moving++;
            else idle++;
        });

        // Update counts
        var totalEl  = document.getElementById('sidebar-count-total');
        var movingEl = document.getElementById('sidebar-count-moving');
        var idleEl   = document.getElementById('sidebar-count-idle');
        var offlineEl = document.getElementById('sidebar-count-offline');
        if (totalEl) totalEl.textContent = total;
        if (movingEl) movingEl.textContent = moving;
        if (idleEl) idleEl.textContent = idle;
        if (offlineEl) offlineEl.textContent = offline;

        // Render list items
        if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="color:var(--color-text-muted); text-align:center; padding:var(--space-xl);">No matching assets</div>';
            return;
        }

        var html = '';
        filtered.forEach(function(feature) {
            var p    = feature.properties;
            var id   = p.assetId;
            var lnglat = feature.geometry.coordinates;
            var status = 'idle';
            if (p.speed > 2) status = 'moving';
            var lastUpdate = p.recordedAt ? new Date(p.recordedAt) : null;
            if (lastUpdate && (new Date() - lastUpdate) > 60000) status = 'offline';

            var isSelected = (id === self.followedAssetId);
            var activeClass = isSelected ? 'background: var(--color-surface-hover); border-left: 4px solid var(--color-accent);' : '';

            var statusDot = status === 'moving' ? '#00e676' : status === 'offline' ? '#ff5252' : '#ffab40';

            html += '<div onclick="MapController.focusAssetFromSidebar(' + id + ',' + lnglat[1] + ',' + lnglat[0] + ')" style="padding: 10px 14px; border-bottom: 1px solid var(--color-card-border); cursor:pointer; transition: background 0.2s; ' + activeClass + '" class="sidebar-asset-item">';
            html += '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">';
            html += '    <span style="font-weight:600; color:var(--color-text-primary);">' + p.assetName + '</span>';
            html += '    <span style="font-size:10px; color:var(--color-text-muted);">' + p.assetCode + '</span>';
            html += '  </div>';
            html += '  <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px;">';
            html += '    <span style="color:var(--color-text-secondary); text-transform:capitalize;">🛠️ ' + p.assetType.replace('_', ' ') + '</span>';
            html += '    <span style="display:flex; align-items:center; gap:4px; font-weight:600; color:' + statusDot + ';">';
            html += '      <span style="width:6px; height:6px; background:' + statusDot + '; border-radius:50%; display:inline-block;"></span>' + status.toUpperCase();
            html += '    </span>';
            html += '  </div>';
            html += '  <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:10px; color:var(--color-text-muted);">';
            html += '    <span>Speed: ' + (p.speed || 0).toFixed(1) + ' km/h</span>';
            html += '    <span>Updated: ' + (lastUpdate ? lastUpdate.toLocaleTimeString('en-IN') : '—') + '</span>';
            html += '  </div>';
            html += '</div>';
        });
        listContainer.innerHTML = html;
    },

    focusAssetFromSidebar: function(id, lat, lng) {
        var self = this;
        self.followedAssetId = id;
        self.map.setView([lat, lng], 15);
        var marker = self.assetMarkers[id];
        if (marker) {
            marker.openPopup();
        }

        var feature = self.assetCache.find(function(f) { return f.properties.assetId === id; });
        if (feature) {
            var p = feature.properties;
            var status = 'idle';
            if (p.speed > 2) status = 'moving';
            var lastUpdate = p.recordedAt ? new Date(p.recordedAt) : null;
            if (lastUpdate && (new Date() - lastUpdate) > 60000) status = 'offline';
            self.showAssetDetailsCard(p, status);
        }

        if (self.autoCenterBtn) {
            self.autoCenterBtn.style.background = 'var(--color-accent)';
            self.autoCenterBtn.style.color = 'var(--color-primary)';
        }

        self.syncAssetSidebar();
        self.loadAssetMarkers();
    },

    loadGeofenceZones: function() {
        var self = this;
        fetch(API_BASE + '/geofences', { credentials: 'same-origin' })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.status !== 'success' || !res.data) return;
                self.zoneLayer.clearLayers();
                self.zoneLayers = {};
                L.geoJSON(res.data, {
                    style: function(feature) {
                        var color = feature.properties.color || '#ff0000';
                        return {
                            color: color, weight: 2, opacity: 0.8,
                            fillColor: color, fillOpacity: 0.15
                        };
                    },
                    onEachFeature: function(feature, layer) {
                        var p = feature.properties;
                        self.zoneLayers[p.id] = layer;
                        layer.on('click', function(e) {
                            L.DomEvent.stopPropagation(e);
                            self.highlightAndZoomTo(p.id);
                        });
                    }
                }).addTo(self.zoneLayer);
            })
            .catch(function(err) {
                console.error('Failed to load geofence zones:', err);
            });
    },

    highlightAndZoomTo: function(id) {
        var self = this;
        var selectedLayer = self.zoneLayers[id];
        if (!selectedLayer) return;

        self.map.fitBounds(selectedLayer.getBounds());
        self.highlightZone(id);

        fetch(API_BASE + '/geofences/' + id, { credentials: 'same-origin' })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.status !== 'success' || !res.data) return;
                var data = res.data;
                var createdDate = data.createdAt ? new Date(data.createdAt).toLocaleString('en-IN') : '—';
                var coords = data.coordinates || '';
                if (coords.length > 80) {
                    coords = coords.substring(0, 77) + '...';
                }

                var popupContent =
                    '<div class="geofence-popup" style="color: var(--color-text-primary); min-width: 250px;">' +
                    '  <h3 style="margin: 0 0 8px 0; color: var(--color-accent); font-size: 14px; border-bottom: 1px solid var(--color-card-border); padding-bottom: 4px;">' + data.zoneName + '</h3>' +
                    '  <table style="width: 100%; font-size: 12px; border-collapse: collapse;">' +
                    '    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);"><td style="padding: 4px 0; color: var(--color-text-muted);">Type:</td><td style="padding: 4px 0; font-weight: bold; text-transform: capitalize;">' + data.zoneType + '</td></tr>' +
                    '    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);"><td style="padding: 4px 0; color: var(--color-text-muted);">Status:</td><td style="padding: 4px 0; font-weight: bold; color: var(--color-success); text-transform: uppercase;">' + data.status + '</td></tr>' +
                    '    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);"><td style="padding: 4px 0; color: var(--color-text-muted);">Created:</td><td style="padding: 4px 0;">' + createdDate + '</td></tr>' +
                    '    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);"><td style="padding: 4px 0; color: var(--color-text-muted);">Area:</td><td style="padding: 4px 0; font-weight: bold;">' + Number(data.area).toLocaleString('en-IN') + ' m²</td></tr>' +
                    '    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);"><td style="padding: 4px 0; color: var(--color-text-muted);">Assets Inside:</td><td style="padding: 4px 0; font-weight: bold;">' + data.assetsInsideCount + '</td></tr>' +
                    '    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);"><td style="padding: 4px 0; color: var(--color-text-muted);">Alerts Inside:</td><td style="padding: 4px 0; font-weight: bold; color: ' + (data.alertsCount > 0 ? 'var(--color-danger)' : 'var(--color-text-primary)') + '">' + data.alertsCount + '</td></tr>' +
                    '  </table>' +
                    '</div>';

                selectedLayer.bindPopup(popupContent).openPopup(selectedLayer.getBounds().getCenter());
            })
            .catch(function(err) {
                console.error('Failed to load geofence details:', err);
            });
    },

    highlightZone: function(id) {
        var self = this;
        if (self.animationInterval) {
            clearInterval(self.animationInterval);
            self.animationInterval = null;
        }

        var selectedLayer = self.zoneLayers[id];
        if (!selectedLayer) return;

        for (var zoneId in self.zoneLayers) {
            var layer = self.zoneLayers[zoneId];
            if (parseInt(zoneId) === id) {
                var color = layer.feature.properties.color || '#ff0000';
                layer.setStyle({
                    color: color, weight: 5, opacity: 1.0, fillColor: color, fillOpacity: 0.5
                });
                layer.bringToFront();
            } else {
                layer.setStyle({ opacity: 0.15, fillOpacity: 0.05 });
            }
        }

        var baseWeight = 5;
        var step = 0;
        self.animationInterval = setInterval(function() {
            step += 1;
            var weight = baseWeight + Math.sin(step * 0.4) * 2.5;
            selectedLayer.setStyle({ weight: weight });
        }, 100);
    },

    resetZoneStyles: function() {
        var self = this;
        if (self.animationInterval) {
            clearInterval(self.animationInterval);
            self.animationInterval = null;
        }
        for (var zoneId in self.zoneLayers) {
            var layer = self.zoneLayers[zoneId];
            var color = layer.feature.properties.color || '#ff0000';
            layer.setStyle({
                color: color, weight: 2, opacity: 0.8, fillColor: color, fillOpacity: 0.15
            });
        }
    },

    addWmsLayer: function() {
        if (this.wmsLayer) return;
        this.wmsLayer = L.tileLayer.wms('http://localhost:8085/geoserver/defence/wms', {
            layers: 'defence:asset_positions',
            format: 'image/png',
            transparent: true,
            attribution: 'GeoServer'
        }).addTo(this.map);
    },

    centerOn: function(lat, lng, zoom) {
        if (this.map) this.map.setView([lat, lng], zoom || 15);
    },

    startAutoRefresh: function(intervalMs) {
        var self = this;
        // Load initially
        self.loadAssetMarkers();
        setInterval(function() {
            self.loadAssetMarkers();
        }, intervalMs || 10000);
    }
};
