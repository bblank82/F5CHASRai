import { NEXRAD_STATIONS } from './radar_stations.js';
import { state, addLogEntry } from './state.js';

/**
 * Finds the nearest NEXRAD station to the given coordinates.
 */
export function findNearestStation(lat, lon) {
  let nearest = null;
  let minDist = Infinity;

  for (const id in NEXRAD_STATIONS) {
    const station = NEXRAD_STATIONS[id];
    const dist = getDistance(lat, lon, station.lat, station.lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = { id, ...station };
    }
  }

  return nearest;
}

/**
 * Generates the tile URL for a specific station and product.
 * @param {string} stationId - 4-character ICAO (e.g., KTLX)
 * @param {string} product - N0Q (Refl), N0U (Vel), N0S (SRV), NET (Echo Tops)
 */
export function getRadarTileUrl(stationId, product) {
  // IEM uses 3-letter codes (BIS, TLX) not 4-letter ICAO (KBIS, KTLX)
  const siteId = stationId.startsWith('K') ? stationId.slice(1) : stationId;
  const ts = getIEMTimestamp(state.targetTime);
  if (ts) {
    return {
      type: 'tms',
      url: `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${siteId}-${product}-${ts}/{z}/{x}/{y}.png`
    };
  }
  return {
    type: 'tms',
    url: `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${siteId}-${product}-0/{z}/{x}/{y}.png`
  };
}

/**
 * Gets the composite tile URL for a specific product.
 */
export async function getCompositeTileUrl(product) {
  const source = state.radarSource || 'iem';
  const prodCode = (product === 'N0Q' || product === 'NET') ? product : 'N0Q';

  // RainViewer and NowCOAST are composite-only and typically reflectivity-only.
  // We force IEM for N0U/N0S or if selected specifically.
  if (source === 'rainviewer' && prodCode === 'N0Q' && !state.targetTime) {
    return await getRainViewerUrl();
  }
  
  if (source === 'nowcoast' && prodCode === 'N0Q') {
    return getNowCOASTUrl();
  }

  // Default: IEM
  const ts = getIEMTimestamp(state.targetTime);
  if (ts) {
    return {
      type: 'tms',
      url: `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-${prodCode}-${ts}/{z}/{x}/{y}.png`
    };
  }

  // Live IEM: use ridge::USCOMP with timestamp 0 (= most recent)
  return {
    type: 'tms',
    url: `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-${prodCode}-0/{z}/{x}/{y}.png`
  };
}

async function getRainViewerUrl() {
  try {
    // RainViewer requires a hash from their API metadata
    if (!state.lastRainViewerHash) {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const data = await res.json();
      if (data && data.radar && data.radar.past && data.radar.past.length > 0) {
        state.lastRainViewerHash = data.radar.past[data.radar.past.length - 1].path.split('/')[3];
      }
    }
    
    if (state.lastRainViewerHash) {
      return {
        type: 'tms',
        url: `https://tilecache.rainviewer.com/v2/radar/${state.lastRainViewerHash}/512/{z}/{x}/{y}/1/1_1.png`,
        options: { tileSize: 512, zoomOffset: -1 }
      };
    }
  } catch (e) {
    console.error('RainViewer fetch error:', e);
  }
  
  // Fallback to IEM if RainViewer fails
  return {
    type: 'tms',
    url: `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-0/{z}/{x}/{y}.png`
  };
}

function getNowCOASTUrl() {
  // NOAA NowCOAST 3.0 MRMS Base Reflectivity Mosaic (Active as of 2024-2026)
  return {
    type: 'wms',
    url: 'https://nowcoast.noaa.gov/geoserver/observations/weather_radar/ows',
    options: {
      layers: 'base_reflectivity_mosaic',
      format: 'image/png',
      transparent: true,
      version: '1.3.0'
    }
  };
}

function getIEMTimestamp(date) {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  
  // Mosaics and history tiles are rigidly generated every 5 minutes.
  const rawMin = date.getUTCMinutes();
  const mi = String(rawMin - (rawMin % 5)).padStart(2, '0');
  
  return `${y}${m}${d}${h}${mi}`;
}

function formatISO(date) {
  return date.toISOString().split('.')[0] + 'Z';
}

/**
 * Helper: Haversine distance.
 */
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function deg2rad(deg) { return deg * (Math.PI/180); }

/**
 * Legend configurations for different radar products.
 */
export const RADAR_LEGENDS = {
  'N0Q': {
    title: 'Reflectivity (dBZ)',
    colors: ['#00e4ff', '#0096ff', '#00c800', '#00a000', '#f0f000', '#e87000', '#ff0000', '#c80000', '#ff00ff'],
    labels: ['Light', 'Moderate', 'Heavy']
  },
  'N0U': {
    title: 'Base Velocity (kt)',
    colors: ['#00ff00', '#00c800', '#008000', '#444', '#800000', '#c80000', '#ff0000'],
    labels: ['Inbound', 'Neutral', 'Outbound']
  },
  'N0S': {
    title: 'Rel. Velocity (SRV)',
    colors: ['#00ff00', '#00c800', '#008000', '#444', '#800000', '#c80000', '#ff0000'],
    labels: ['Inbound', 'Neutral', 'Outbound']
  },
  'NET': {
    title: 'Echo Tops (kft)',
    colors: ['#000080', '#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff0000'],
    labels: ['10', '30', '50+']
  }
};

/**
 * Updates the Radar Metadata accordion panel with current state.
 */
export function updateRadarMetadataUI() {
  const prodEl = document.getElementById('radar-meta-product');
  const tiltEl = document.getElementById('radar-meta-tilt');
  const timeEl = document.getElementById('radar-meta-time');
  const provEl = document.getElementById('radar-meta-provider');
  const siteBadge = document.getElementById('radar-metadata-site');

  if (!prodEl) return;

  const prodNames = {
    'N0Q': 'Reflectivity (Base)',
    'N0U': 'Velocity (Base)',
    'N0S': 'Rel. Velocity',
    'NET': 'Echo Tops'
  };

  const tilts = {
    'N0Q': '0.5°',
    'N0U': '0.5°',
    'N0S': '0.5°',
    'NET': 'N/A (Derived)'
  };

  const product = state.radarProduct || 'N0Q';
  prodEl.textContent = prodNames[product] || product;
  tiltEl.textContent = tilts[product] || '0.5°';
  
  // Site ID
  if (state.radarMode === 'single' && state.radarSite) {
    siteBadge.textContent = state.radarSite;
    siteBadge.classList.remove('hidden');
  } else {
    siteBadge.textContent = 'COMPOSITE';
    siteBadge.classList.remove('hidden');
  }

  // Provider
  const source = state.radarSource || 'iem';
  const providers = {
    'iem': 'NEXRAD via IEM',
    'rainviewer': 'RainViewer',
    'nowcoast': 'NOAA nowCOAST'
  };
  provEl.textContent = providers[source] || source;

  // Time
  if (state.targetTime) {
    const ts = getIEMTimestamp(state.targetTime);
    timeEl.textContent = ts ? `${ts.substring(8, 10)}:${ts.substring(10, 12)}Z` : 'Archive';
  } else {
    timeEl.textContent = 'LIVE (Real-time)';
  }
}
