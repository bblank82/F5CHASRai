// modules/map.js — Leaflet map, layers, and controls
import { state, setLocation, addLogEntry, uiState, saveUIState, setRadarSource, setRadarOpacity, setBasemapContrast, setBasemapLabelsBrightness, setRadarTilt, setBasemap } from './state.js';
import { reverseGeocode } from './geocoding.js';
import { findNearestStation, getRadarTileUrl, getCompositeTileUrl, RADAR_LEGENDS, updateRadarMetadataUI } from './radar.js';
import { initCounties } from './counties.js';

let map, userMarker, trackLayer, alertLayer, spcLayer, radarLayer, countiesLayer;
let layerVisibility = uiState.layers;
let isPickingLocation = false;
let isPickingStormCenter = false;

export function initMap() {
  map = L.map('map', {
    center: uiState.mapBounds.center,
    zoom: uiState.mapBounds.zoom,
    zoomControl: false,
    attributionControl: true,
  });

  map.on('moveend', () => {
    uiState.mapBounds.center = map.getCenter();
    uiState.mapBounds.zoom = map.getZoom();
    saveUIState();
  });

  // Custom Pane for Labels (On separate pane to stay above radar/overlays)
  map.createPane('labelsPane');
  map.getPane('labelsPane').style.zIndex = 500;
  map.getPane('labelsPane').style.pointerEvents = 'none';

  // Initialize Basemap from State
  updateBasemap(state.basemapId);

  // Custom pane for radar tiles — allows isolated CSS (blend mode, no filter)
  map.createPane('radarPane');
  map.getPane('radarPane').style.zIndex = 350; // above tiles, below overlays

  trackLayer = L.layerGroup();
  alertLayer = L.layerGroup();
  spcLayer = L.layerGroup();
  radarLayer = L.layerGroup();

  if (layerVisibility.track) trackLayer.addTo(map);
  if (layerVisibility.alerts) alertLayer.addTo(map);
  if (layerVisibility.spc) spcLayer.addTo(map);
  
  // Initialize county highlights (deferred to show on map according to state)
  initCounties(map).then(layer => {
    countiesLayer = layer;
    if (layerVisibility.counties && countiesLayer) {
      countiesLayer.addTo(map);
    }
  });

  if (layerVisibility.radar) {
    radarLayer.addTo(map);
    // Defer so the rest of the map and radar.js state are fully initialized
    setTimeout(() => {
      addRadarOverlay();
      const legend = document.getElementById('radar-legend');
      const controls = document.getElementById('radar-controls');
      legend && legend.classList.add('visible');
      controls && controls.classList.remove('hidden');
    }, 0);
  }

  setupLayerToggles();
  setupRadarControls();
  setupBasemapControls();
  requestGeolocation();

  // Map click handler
  map.on('click', (e) => {
    const { lat, lng } = e.latlng;

    // 1. User Position Picker
    if (isPickingLocation) {
      setManualLocation(lat, lng);
      toggleLocationPicker(false);
      return;
    }

    // 2. Storm Center Picker
    if (isPickingStormCenter) {
      document.getElementById('storm-lat').value = lat.toFixed(4);
      document.getElementById('storm-lon').value = lng.toFixed(4);
      toggleStormPicker(false);
      addLogEntry('system', 'Storm center coordinates set from map click.');
      return;
    }

    // 3. Radar Site Picking (Single Site mode only)
    if (state.radarMode === 'single' && layerVisibility.radar) {
      const station = findNearestStation(lat, lng);
      if (station) {
        state.radarSite = station.id;
        updateRadarSiteBadge(station.id);
        addLogEntry('system', `Radar station locked: ${station.id} (${station.name})`);
        addRadarOverlay();
      }
    }
  });

  return map;
}

function requestGeolocation() {
  const locText = document.getElementById('location-text');
  if (!navigator.geolocation) {
    locText.textContent = 'GPS unavailable';
    return;
  }
  
  // Basic one-shot to get initial position fast
  navigator.geolocation.getCurrentPosition((pos) => {
    // Only if not already set by manual override
    if (uiState.position.userLat === null) {
      const { latitude: lat, longitude: lon } = pos.coords;
      setLocation(lat, lon, false);
      updateUserMarker(lat, lon);
      updateLocationDisplay(lat, lon);
      refreshRadarSiteFromLocation(lat, lon);
    }
  }, () => {}, { enableHighAccuracy: true });

  navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      
      // If we don't have a manual override in uiState, let watchPosition update state
      if (uiState.position.userLat === null) {
        setLocation(lat, lon, false);
        updateUserMarker(lat, lon);
        updateLocationDisplay(lat, lon);
        refreshRadarSiteFromLocation(lat, lon);
      }
      
      document.getElementById('location-icon').textContent = '📍';
      document.getElementById('location-status-badge').classList.remove('badge-warning');
      document.getElementById('location-status-badge').classList.add('badge-neutral');
    },
    (err) => {
      console.warn('Geolocation error:', err);
      const locText = document.getElementById('location-text');
      if (locText) {
        locText.textContent = err.code === 1 ? 'GPS Denied' : 'GPS Timeout/Error';
      }
      document.getElementById('location-status-badge').classList.remove('badge-neutral');
      document.getElementById('location-status-badge').classList.add('badge-warning');
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
  );
}

function updateUserMarker(lat, lon) {
  if (userMarker) map.removeLayer(userMarker);
  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:#f59e0b;border:3px solid #fff;
      box-shadow:0 0 0 4px rgba(245,158,11,0.3),0 0 12px rgba(245,158,11,0.6);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
  userMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 })
    .addTo(map)
    .bindPopup(`<strong>Your Position</strong><br>${lat.toFixed(4)}, ${lon.toFixed(4)}`);
}

// If in single-site mode, pick the nearest station to the new location
function refreshRadarSiteFromLocation(lat, lon) {
  if (state.radarMode !== 'single') return;
  const station = findNearestStation(lat, lon);
  if (station && station.id !== state.radarSite) {
    state.radarSite = station.id;
    updateRadarSiteBadge(station.id);
    addLogEntry('system', `Radar site updated: ${station.id} (${station.name})`);
    addRadarOverlay();
  }
}

export function setManualLocation(lat, lon) {
  setLocation(lat, lon, true); // true = isManual
  updateUserMarker(lat, lon);
  map.setView([lat, lon], 8);
  updateLocationDisplay(lat, lon, 'manual');
  addLogEntry('system', `Manual location set: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  refreshRadarSiteFromLocation(lat, lon);
}

async function updateLocationDisplay(lat, lon, suffix = '') {
  const locText = document.getElementById('location-text');
  const baseCoords = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  const suffixStr = suffix ? ` (${suffix})` : '';
  
  // Show base coords immediately
  locText.textContent = `${baseCoords}${suffixStr}`;
  
  // Fetch city info
  const cityInfo = await reverseGeocode(lat, lon);
  if (cityInfo) {
    locText.textContent = `${baseCoords}${suffixStr} • ${cityInfo}`;
  }
}

export function centerOnUser(forceGPS = false) {
  if (forceGPS) {
    if (!navigator.geolocation) {
      addLogEntry('system', 'Geolocation is not supported by this browser.');
      return;
    }

    const locText = document.getElementById('location-text');
    if (locText) locText.textContent = 'Locating (GPS)...';
    
    // Stage 1: High Accuracy (GPS)
    const tryGPS = (isFallback = false) => {
      const modeName = isFallback ? 'Network/Cell' : 'High-Precision GPS';
      if (locText) locText.textContent = `Locating (${modeName})...`;
      
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const accuracy = pos.coords.accuracy;
        const method = isFallback ? 'Network Fallback' : 'GPS Lock';
        
        setLocation(lat, lon, false);
        updateUserMarker(lat, lon);
        updateLocationDisplay(lat, lon);
        map.setView([lat, lon], Math.max(map.getZoom(), 8), { animate: true });
        addLogEntry('system', `Location Re-established via ${method} (±${Math.round(accuracy)}m).`);
      }, (err) => {
        console.warn(`${modeName} failed:`, err);
        
        if (!isFallback && err.code === err.TIMEOUT) {
          addLogEntry('system', 'GPS High-Precision Timeout: Attempting Network Fallback...');
          tryGPS(true); // Attempt low accuracy
        } else {
          // Total failure or denied
          const reason = err.code === 1 ? 'Permission Denied' : 'Signal Lost';
          addLogEntry('system', `GPS Reset Failed (${reason}): Reverting to last known.`);
          
          if (state.lastGoodLat) {
            const lat = state.lastGoodLat;
            const lon = state.lastGoodLon;
            setLocation(lat, lon, false);
            updateUserMarker(lat, lon);
            updateLocationDisplay(lat, lon, 'last known');
            map.setView([lat, lon], Math.max(map.getZoom(), 8), { animate: true });
          } else if (uiState.position.userLat) {
             updateLocationDisplay(uiState.position.userLat, uiState.position.userLon, 'manual');
          } else {
            if (locText) locText.textContent = `Error: ${reason}`;
          }
        }
      }, { 
        enableHighAccuracy: !isFallback, 
        timeout: isFallback ? 10000 : 20000, 
        maximumAge: 5000 
      });
    };

    tryGPS(false);
  } else if (state.userLat && state.userLon) {
    map.setView([state.userLat, state.userLon], map.getZoom(), { animate: true });
  }
}

// ---- Alert Layer ----
export function renderAlertPolygons(features) {
  alertLayer.clearLayers();
  features.forEach(f => {
    if (!f.geometry) return;
    const et = f.properties.event || '';
    let color = '#888';
    if (/tornado warning/i.test(et)) color = '#ff0000';
    else if (/severe thunderstorm warning/i.test(et)) color = '#ff8c00';
    else if (/tornado watch/i.test(et)) color = '#ffff00';
    else if (/severe thunderstorm watch/i.test(et)) color = '#00bfff';
    else if (/flash flood/i.test(et)) color = '#00ff00';

    try {
      L.geoJSON(f.geometry, {
        style: { color, weight: 2, fillOpacity: 0.12, fillColor: color, dashArray: et.toLowerCase().includes('watch') ? '6,4' : null },
      })
        .bindPopup(`<strong>${f.properties.event}</strong><br>${f.properties.areaDesc || ''}<br><small>Expires: ${f.properties.expires ? new Date(f.properties.expires).toLocaleTimeString() : 'Unknown'}</small>`)
        .addTo(alertLayer);
    } catch (e) { /* skip malformed */ }
  });
}

// ---- SPC Layer ----
export function renderSPCPolygons(features) {
  spcLayer.clearLayers();
  const colorMap = {
    'TSTM': '#c8c8c8', 'MRGL': '#6aab47', 'SLGT': '#f5f500',
    'ENH': '#ff8c00', 'MDT': '#ff0000', 'HIGH': '#ff00ff',
  };
  features.forEach(f => {
    if (!f.geometry) return;
    const label = (f.properties.LABEL || f.properties.DN || '').toString().toUpperCase();
    const color = colorMap[label] || '#888';
    try {
      L.geoJSON(f.geometry, {
        style: { color, weight: 2, fillOpacity: 0.08, fillColor: color },
      })
        .bindPopup(`<strong>SPC Outlook: ${label}</strong>`)
        .addTo(spcLayer);
    } catch (e) { /* skip */ }
  });
}

// ---- Storm Track Layer ----
export function renderStormTrack(stormLat, stormLon, dirDeg, speedKt) {
  trackLayer.clearLayers();

  const KNOTS_TO_DEG_LAT = 1 / 60;
  const points = [[stormLat, stormLon]];
  const intervals = [15, 30, 60, 90]; // minutes

  const dirRad = (dirDeg * Math.PI) / 180;
  const cos_dir = Math.cos(dirRad);
  const sin_dir = Math.sin(dirRad);

  intervals.forEach(mins => {
    const distNm = (speedKt * mins) / 60;
    const dLat = distNm * cos_dir * KNOTS_TO_DEG_LAT;
    const dLon = distNm * sin_dir * KNOTS_TO_DEG_LAT / Math.cos((stormLat * Math.PI) / 180);
    points.push([stormLat + dLat, stormLon + dLon]);
  });

  // Dashed track line
  L.polyline(points, {
    color: '#38bdf8',
    weight: 2.5,
    dashArray: '8,5',
    opacity: 0.9,
  }).addTo(trackLayer);

  // Storm origin marker
  const stormIcon = L.divIcon({
    className: '',
    html: `<div style="
      width:18px;height:18px;border-radius:50%;
      background:rgba(56,189,248,0.2);
      border:2px solid #38bdf8;
      box-shadow:0 0 12px rgba(56,189,248,0.5);
    "></div>`,
    iconSize: [18, 18], iconAnchor: [9, 9],
  });
  L.marker([stormLat, stormLon], { icon: stormIcon })
    .bindPopup(`<strong>Storm Position</strong><br>Moving ${dirDeg}° at ${speedKt} kt`)
    .addTo(trackLayer);

  // Time markers
  const labels = ['15m', '30m', '1hr', '90m'];
  points.slice(1).forEach((pt, i) => {
    const dotIcon = L.divIcon({
      className: '',
      html: `<div style="
        background:rgba(8,9,12,0.8);border:1px solid #38bdf8;
        color:#38bdf8;font-size:9px;padding:1px 4px;border-radius:3px;
        font-family:'JetBrains Mono',monospace;white-space:nowrap;
      ">${labels[i]}</div>`,
      iconAnchor: [0, 0],
    });
    L.marker(pt, { icon: dotIcon }).addTo(trackLayer);
    L.circleMarker(pt, { radius: 4, color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.5, weight: 1 }).addTo(trackLayer);
  });

  // Return intercept suggestions (SE of storm track)
  return computeInterceptPoints(points, stormLat, stormLon);
}

function computeInterceptPoints(trackPoints, stormLat, stormLon) {
  const suggestions = [];
  // Suggest points ~10-15 miles ESE of each track point (safe intercept zone)
  const ESE_OFFSET_LAT = -0.05;   // slightly south
  const ESE_OFFSET_LON = 0.18;    // east

  [1, 2].forEach((i) => {
    const pt = trackPoints[i];
    if (!pt) return;
    const iLat = pt[0] + ESE_OFFSET_LAT;
    const iLon = pt[1] + ESE_OFFSET_LON;

    // Draw intercept marker
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:10px;height:10px;border-radius:50%;
        background:#22c55e;border:2px solid #fff;
        box-shadow:0 0 8px rgba(34,197,94,0.6);
      "></div>`,
      iconSize: [10, 10], iconAnchor: [5, 5],
    });
    L.marker([iLat, iLon], { icon })
      .bindPopup(`<strong>Intercept Point ${i}</strong><br>${iLat.toFixed(4)}, ${iLon.toFixed(4)}<br><small>~${i === 1 ? '30' : '60'} min window</small>`)
      .addTo(trackLayer);

    suggestions.push({ lat: iLat, lon: iLon, label: `Intercept ${i === 1 ? '30m' : '60m'}: ${iLat.toFixed(3)}, ${iLon.toFixed(3)}` });
  });

  return suggestions;
}

export function getMap() { return map; }

export function getBailoutLink(stormDir) {
  if (!state.userLat || !state.userLon) return null;
  // Bail out direction = opposite of storm motion (approx)
  const oppositeDir = (stormDir + 180) % 360;
  const distLat = 0.5 * Math.cos((oppositeDir * Math.PI) / 180);
  const distLon = 0.5 * Math.sin((oppositeDir * Math.PI) / 180);
  const destLat = state.userLat + distLat;
  const destLon = state.userLon + distLon;
  return `https://www.google.com/maps/dir/?api=1&origin=${state.userLat},${state.userLon}&destination=${destLat.toFixed(4)},${destLon.toFixed(4)}&travelmode=driving`;
}

export function setLayerVisibility(layer, isVisible) {
  uiState.layers[layer] = isVisible;
  
  const btn = document.querySelector(`.layer-toggle[data-layer="${layer}"]`);
  if (btn) btn.classList.toggle('active', isVisible);
  
  saveUIState();

  if (layer === 'spc') isVisible ? map.addLayer(spcLayer) : map.removeLayer(spcLayer);
  if (layer === 'alerts') isVisible ? map.addLayer(alertLayer) : map.removeLayer(alertLayer);
  if (layer === 'track') isVisible ? map.addLayer(trackLayer) : map.removeLayer(trackLayer);
  if (layer === 'counties' && countiesLayer) isVisible ? map.addLayer(countiesLayer) : map.removeLayer(countiesLayer);
  if (layer === 'radar') {
    const legend = document.getElementById('radar-legend');
    const controls = document.getElementById('radar-controls');
    if (isVisible) {
      map.addLayer(radarLayer);
      addRadarOverlay();
      legend && legend.classList.add('visible');
      controls && controls.classList.remove('hidden');
    } else {
      map.removeLayer(radarLayer);
      legend && legend.classList.remove('visible');
      controls && controls.classList.add('hidden');
    }
  }
}

function setupLayerToggles() {
  document.querySelectorAll('.layer-toggle').forEach(btn => {
    const layer = btn.dataset.layer;
    const layerVisibility = uiState.layers || { radar: false, spc: true, track: true, alerts: true, counties: true };
    btn.classList.toggle('active', layerVisibility[layer]);
    
    btn.addEventListener('click', () => {
      if (btn.hasAttribute('disabled')) return;
      const current = uiState.layers?.[layer] ?? false;
      setLayerVisibility(layer, !current);
    });
  });
}

export function clearRadarOverlay() {
  radarLayer.clearLayers();
}

export async function addRadarOverlay() {
  radarLayer.clearLayers();
  
  let rs;
  if (state.radarMode === 'single' && state.radarSite) {
    let p = state.radarProduct;
    // Apply tilt if applicable to IEM product codes (N0Q, N0U, N0S)
    if (state.radarTilt && state.radarTilt !== '0' && (p === 'N0Q' || p === 'N0U' || p === 'N0S')) {
      p = state.radarTilt + p.substring(1);
    }
    rs = getRadarTileUrl(state.radarSite, p);
  } else {
    // Composite only supports N0Q and NET
    const prod = (state.radarProduct === 'N0Q' || state.radarProduct === 'NET') ? state.radarProduct : 'N0Q';
    rs = await getCompositeTileUrl(prod);
  }

  if (!rs) return;

  const attribution = rs.url.includes('rainviewer') ? 'RainViewer' : 
                      rs.url.includes('nowcoast') ? 'NOAA nowCOAST' : 
                      'NEXRAD via IEM';

  let radarTiles;
  if (rs.type === 'wms') {
    radarTiles = L.tileLayer.wms(rs.url, {
      ...rs.options,
      opacity: state.radarOpacity,
      attribution: attribution,
      pane: 'radarPane'
    });
  } else {
    radarTiles = L.tileLayer(rs.url, {
      opacity: state.radarOpacity,
      attribution: attribution,
      maxZoom: 14,
      ...rs.options,
      pane: 'radarPane'
    });
  }
  
  radarTiles.addTo(radarLayer);
  updateRadarLegend(state.radarProduct);
  updateRadarMetadataUI();

  // Return promise to track image load status
  return new Promise((resolve) => {
    radarTiles.on('load', () => resolve());
    radarTiles.on('tileerror', () => resolve());
  });
}


function updateRadarLegend(prod) {
  const legend = document.getElementById('radar-legend');
  const config = RADAR_LEGENDS[prod] || RADAR_LEGENDS['N0Q'];
  
  if (!legend) return;
  
  legend.innerHTML = `
    <div class="radar-legend-title">${config.title}</div>
    <div class="radar-legend-bar">
      ${config.colors.map(c => `<div style="flex:1;background:${c}"></div>`).join('')}
    </div>
    <div class="radar-legend-labels">
      ${config.labels.map(l => `<span>${l}</span>`).join('')}
    </div>
  `;
}

function updateRadarSiteBadge(id) {
  const badge = document.getElementById('radar-site-badge');
  if (badge) {
    badge.textContent = id;
    badge.classList.remove('hidden');
  }
}

function setupRadarControls() {
  const modeSelect = document.getElementById('radar-mode-select');
  const sourceSelect = document.getElementById('radar-source-select');
  const opacitySlider = document.getElementById('radar-opacity-slider');
  const opacityValue = document.getElementById('radar-opacity-value');
  const productBtns = document.querySelectorAll('#radar-product-btns .prod-btn');

  if (opacitySlider && opacityValue) {
    opacitySlider.value = state.radarOpacity;
    opacityValue.textContent = `${Math.round(state.radarOpacity * 100)}%`;
    opacitySlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      opacityValue.textContent = `${Math.round(val * 100)}%`;
      setRadarOpacity(val);
      addRadarOverlay();
    });
  }

  if (sourceSelect) {
    sourceSelect.value = state.radarSource;
    sourceSelect.addEventListener('change', (e) => {
      setRadarSource(e.target.value);
      addRadarOverlay();
    });
  }

  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      state.radarMode = e.target.value;
      const badge = document.getElementById('radar-site-badge');
      if (state.radarMode === 'single') {
        badge && badge.classList.remove('hidden');
        // Always pick nearest to current location
        if (state.userLat && state.userLon) {
          const station = findNearestStation(state.userLat, state.userLon);
          if (station) {
            state.radarSite = station.id;
            updateRadarSiteBadge(station.id);
          }
        }
      } else {
        badge && badge.classList.add('hidden');
        if (state.radarProduct !== 'N0Q') {
          state.radarProduct = 'N0Q';
          const btns = document.querySelectorAll('#radar-product-btns .prod-btn');
          btns.forEach(b => {
             b.classList.toggle('active', b.dataset.prod === 'N0Q');
          });
        }
      }

      syncRadarControlsUI();
      addRadarOverlay();
    });
  }

  productBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      productBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.radarProduct = btn.dataset.prod;

      // VEL, SRV, and Echo Tops are all single-site only products
      const needsSingleSite = ['N0U', 'N0S', 'NET'].includes(state.radarProduct);

      if (needsSingleSite) {
        // Force single-site mode
        state.radarMode = 'single';
        if (modeSelect) modeSelect.value = 'single';
        document.getElementById('radar-site-badge')?.classList.remove('hidden');

        // Always pick nearest to current location
        if (state.userLat && state.userLon) {
          const station = findNearestStation(state.userLat, state.userLon);
          if (station) {
            state.radarSite = station.id;
            updateRadarSiteBadge(station.id);
            addLogEntry('system', `Nearest radar: ${station.id} (${station.name}) — ${state.radarProduct}`);
          }
        } else {
          addLogEntry('system', `${state.radarProduct} requires Single Site — set your location to auto-select a site.`);
        }
      } else if (state.radarMode === 'single' && state.userLat && state.userLon) {
        // Already in single-site (e.g. REFL while location changed) — refresh nearest site
        const station = findNearestStation(state.userLat, state.userLon);
        if (station) {
          state.radarSite = station.id;
          updateRadarSiteBadge(station.id);
        }
      } else {
        // Back to composite
        document.getElementById('radar-site-badge')?.classList.add('hidden');
      }

      syncRadarControlsUI();
      addRadarOverlay();
    });
  });

  // Tilt Selector
  const tiltSelect = document.getElementById('radar-tilt-select');
  if (tiltSelect) {
    tiltSelect.value = state.radarTilt || '0';
    tiltSelect.addEventListener('change', (e) => {
      setRadarTilt(e.target.value);
      addRadarOverlay();
    });
  }

  // Initial sync
  syncRadarControlsUI();
}

const BASEMAP_CFG = {
  dark: {
    base: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    labels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'
  },
  roads: {
    base: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    labels: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png'
  },
  light: {
    base: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    labels: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png'
  },
  topo: {
    base: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    labels: null
  }
};

let baseLayer, labelLayer;

export function updateBasemap(id) {
  const cfg = BASEMAP_CFG[id] || BASEMAP_CFG.dark;
  if (baseLayer) map.removeLayer(baseLayer);
  if (labelLayer) map.removeLayer(labelLayer);

  baseLayer = L.tileLayer(cfg.base, {
    attribution: '© CARTO, © OSM',
    maxZoom: 18
  }).addTo(map);

  if (cfg.labels) {
    labelLayer = L.tileLayer(cfg.labels, {
      pane: 'labelsPane',
      maxZoom: 18
    }).addTo(map);
    applyLabelsFilter(state.basemapLabelsBrightness);
  }
  
  applyBasemapFilter(state.basemapContrast);
}

export function setupBasemapControls() {
  const contrastSlider = document.getElementById('map-contrast-slider');
  const contrastValue = document.getElementById('map-contrast-value');
  const labelSlider = document.getElementById('map-labels-slider');
  const labelValue = document.getElementById('map-labels-value');
  const basemapSelect = document.getElementById('basemap-select');

  if (contrastSlider && contrastValue) {
    contrastSlider.value = state.basemapContrast || 1.0;
    contrastValue.textContent = `${Math.round(contrastSlider.value * 100)}%`;
    applyBasemapFilter(contrastSlider.value);
    contrastSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      contrastValue.textContent = `${Math.round(val * 100)}%`;
      setBasemapContrast(val);
      applyBasemapFilter(val);
    });
  }

  if (labelSlider && labelValue) {
    labelSlider.value = state.basemapLabelsBrightness || 1.0;
    labelValue.textContent = `${Math.round(labelSlider.value * 100)}%`;
    applyLabelsFilter(labelSlider.value);
    labelSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      labelValue.textContent = `${Math.round(val * 100)}%`;
      setBasemapLabelsBrightness(val);
      applyLabelsFilter(val);
    });
  }

  if (basemapSelect) {
    basemapSelect.value = state.basemapId || 'dark';
    basemapSelect.addEventListener('change', (e) => {
      setBasemap(e.target.value);
      updateBasemap(e.target.value);
    });
  }
}

function applyBasemapFilter(val) {
  const pane = map.getPane('tilePane');
  if (pane) {
    const brightness = val < 1.0 ? 0.7 + (val * 0.3) : 1.0;
    pane.style.filter = `contrast(${val}) brightness(${brightness})`;
  }
}

function applyLabelsFilter(val) {
  const pane = map.getPane('labelsPane');
  if (pane) {
    // Specifically brighten the labels layer
    pane.style.filter = `brightness(${val}) contrast(1.2)`;
  }
}

function syncRadarControlsUI() {
  const sourceSelect = document.getElementById('radar-source-select');
  const prod = state.radarProduct;
  const mode = state.radarMode;

  // RainViewer and NowCOAST are composite-reflectivity-only
  // So disable source select if in single site mode OR if selecting velocity products.
  const allowSourceSelect = mode === 'composite' && (prod === 'N0Q' || prod === 'NET');
  if (sourceSelect) {
    sourceSelect.disabled = !allowSourceSelect;
    sourceSelect.title = allowSourceSelect ? 'Select radar provider' : 'Secondary sources unavailable for this product/mode';
    if (!allowSourceSelect) sourceSelect.value = 'iem';
  }
}

export function toggleLocationPicker(active) {
  isPickingLocation = active;
  if (active) isPickingStormCenter = false; // mutually exclusive
  const btn = document.getElementById('set-pos-btn');
  const mapContainer = document.getElementById('map');
  
  if (btn) btn.classList.toggle('active', active);
  if (mapContainer) {
    mapContainer.classList.toggle('cursor-crosshair', active);
    mapContainer.classList.toggle('picking-active', active);
  }
  
  if (active) {
    addLogEntry('system', 'Location picker active: Overlay popups disabled. Click map to set position.');
  }
}

export function toggleStormPicker(active) {
  isPickingStormCenter = active;
  if (active) isPickingLocation = false; // mutually exclusive
  const btn = document.getElementById('storm-pick-btn');
  const mapContainer = document.getElementById('map');
  
  if (btn) btn.classList.toggle('active', active);
  if (mapContainer) {
    mapContainer.classList.toggle('cursor-crosshair', active);
    mapContainer.classList.toggle('picking-active', active);
  }

  // Also ensure set-pos-btn is NOT active
  document.getElementById('set-pos-btn')?.classList.remove('active');

  if (active) {
    addLogEntry('system', 'Storm picker active: Overlay popups disabled. Click map to set center.');
  }
}

export function isPicking() {
  return isPickingLocation || isPickingStormCenter;
}
