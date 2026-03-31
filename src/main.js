// main.js — Storm Chaser App Entry Point
import './style.css';
import { initMap, centerOnUser, toggleLocationPicker, toggleStormPicker, isPicking, renderStormTrack, getBailoutLink, addRadarOverlay } from './modules/map.js';
import { fetchAlerts } from './modules/alerts.js';
import { initSPC, fetchSPCOutlook } from './modules/spc.js';
import { fetchInstability } from './modules/instability.js';
import { fetchNearbyRoads } from './modules/roads.js';
import { computeThreatScore } from './modules/threat.js';
import { initAgent, updateModelBadge } from './modules/agent.js';
import { initSettings } from './modules/settings.js';
import { initLog, addLogEntry } from './modules/log.js';
import { initTimeMachine } from './modules/time_machine.js';
import { showCustomAlert } from './modules/ui.js';
import { state, uiState, saveUIState } from './modules/state.js';

// ===== BOOT =====
async function init() {
  console.log('⚡ Storm Chaser Agent initializing…');

  // Init map first (needs DOM)
  initMap();

  // Init UI modules
  const initSteps = [
    { name: 'Settings', fn: initSettings },
    { name: 'Log', fn: initLog },
    { name: 'SPC', fn: initSPC },
    { name: 'StormTrack', fn: initStormTrackPanel },
    { name: 'Bailout', fn: initBailoutButton },
    { name: 'CenterButton', fn: initCenterButton },
    { name: 'LocationPicker', fn: initLocationPicker },
    { name: 'StormPicker', fn: initStormPicker },
    { name: 'RadarLegend', fn: initRadarLegend },
    { name: 'TimeMachine', fn: () => initTimeMachine(refreshAllData) },
    { name: 'RefreshButton', fn: initRefreshButton },
    { name: 'Accordion', fn: initAccordion },
    { name: 'ResetGps', fn: initResetGpsButton }
  ];

  for (const step of initSteps) {
    try {
      step.fn();
    } catch (err) {
      console.error(`❌ Failed to initialize ${step.name}:`, err);
    }
  }

  // Fetch live data
  await fetchAlerts();
  computeThreatScore();

  // Fetch instability once location is available (or default)
  waitForLocationThenFetchInstability();

  // Init AI agent last (after data is loaded so context is rich)
  setTimeout(() => initAgent(), 500);

  // Set up refresh intervals (every 5 minutes)
  setInterval(async () => {
    await fetchAlerts();
    if (state.userLat && state.userLon) {
      fetchInstability(state.userLat, state.userLon);
    }
    computeThreatScore();
  }, 5 * 60 * 1000);

  setInterval(() => {
    if (state.userLat) fetchInstability(state.userLat, state.userLon);
  }, 10 * 60 * 1000); // Every 10 minutes

  // Refresh instability button
  document.getElementById('refresh-instability').addEventListener('click', () => {
    fetchInstability(state.userLat, state.userLon);
  });
  document.getElementById('refresh-alerts').addEventListener('click', async () => {
    await fetchAlerts();
    computeThreatScore();
  });

  addLogEntry('system', '⚡ Storm Chaser Agent initialized. All systems online.');
  console.log('✅ Storm Chaser Agent ready');
}

async function refreshAllData() {
  console.log('🔄 Refreshing all data (Archive/Live match)...');
  await fetchAlerts();
  await fetchSPCOutlook();
  if (!state.targetTime && state.userLat) {
    await fetchInstability(state.userLat, state.userLon);
    await fetchNearbyRoads(state.userLat, state.userLon);
  } else if (state.targetTime) {
    // Instability is disabled in archive mode
  }
  addRadarOverlay(); // Refresh radar with new time
  computeThreatScore();
  updateModelBadge();
}

function initRefreshButton() {
  const btn = document.getElementById('refresh-all-btn');
  if (btn) btn.addEventListener('click', refreshAllData);
}

function initAccordion() {
  const items = document.querySelectorAll('.accordion-item');
  
  items.forEach(item => {
    if (item.id === uiState.accordion) {
      item.classList.add('expanded');
    } else {
      item.classList.remove('expanded');
    }

    const header = item.querySelector('.accordion-header');
    header.addEventListener('click', (e) => {
      // Don't toggle if clicking a button inside the header
      if (e.target.closest('button')) return;

      const isExpanded = item.classList.contains('expanded');
      
      // Close all
      items.forEach(i => i.classList.remove('expanded'));
      
      // If it wasn't expanded, expand it
      if (!isExpanded) {
        item.classList.add('expanded');
        uiState.accordion = item.id;
        saveUIState();
      } else {
        uiState.accordion = null;
        saveUIState();
      }
    });
  });
}

function waitForLocationThenFetchInstability() {
  if (state.userLat && state.userLon) {
    fetchInstability(state.userLat, state.userLon);
    fetchNearbyRoads(state.userLat, state.userLon);
    return;
  }
  // Poll until GPS locks or user sets manual location
  const interval = setInterval(() => {
    if (state.userLat && state.userLon) {
      fetchInstability(state.userLat, state.userLon);
      fetchNearbyRoads(state.userLat, state.userLon);
      clearInterval(interval);
    }
  }, 2000);

  // Fallback: use central Oklahoma after 8s if no GPS
  setTimeout(() => {
    if (!state.userLat) {
      fetchInstability(35.46, -97.52); // OKC area
      fetchNearbyRoads(35.46, -97.52);
    }
    clearInterval(interval);
  }, 8000);
}

// ===== STORM TRACK PANEL =====
function initStormTrackPanel() {
  const header = document.getElementById('track-panel-header');
  const toggleBtn = document.getElementById('track-panel-toggle');
  const panel = document.getElementById('track-panel');

  if (uiState.panels.trackCollapsed) {
    panel.classList.add('collapsed');
  }

  header.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    uiState.panels.trackCollapsed = panel.classList.contains('collapsed');
    saveUIState();
  });

  document.getElementById('plot-track-btn').addEventListener('click', plotTrack);
}

async function plotTrack() {
  const lat = parseFloat(document.getElementById('storm-lat').value);
  const lon = parseFloat(document.getElementById('storm-lon').value);
  const dir = parseFloat(document.getElementById('storm-dir').value);
  const speed = parseFloat(document.getElementById('storm-speed').value);

  if (isNaN(lat) || isNaN(lon) || isNaN(dir) || isNaN(speed)) {
    showCustomAlert('Please fill in all storm track fields.', { title: 'Missing Data' });
    return;
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    showCustomAlert('Invalid lat/lon values.', { title: 'Invalid Data' });
    return;
  }

  state.stormTrack = { lat, lon, dir, speed };

  const suggestions = renderStormTrack(lat, lon, dir, speed);
  renderInterceptSuggestions(suggestions, dir);

  addLogEntry('track', `Storm track plotted: ${lat.toFixed(3)}, ${lon.toFixed(3)} → ${dir}° at ${speed} kt`);
  computeThreatScore();
}

function renderInterceptSuggestions(suggestions, stormDir) {
  const container = document.getElementById('intercept-suggestions');
  if (!container) return;

  if (!suggestions.length) {
    container.innerHTML = '';
    return;
  }

  const bailoutDir = (stormDir + 180) % 360;
  const dirLabel = getDirLabel(bailoutDir);

  container.innerHTML =
    suggestions.map(s =>
      `<div class="intercept-chip" title="Click to open in Google Maps" onclick="window.open('https://www.google.com/maps?q=${s.lat},${s.lon}','_blank')">
        🎯 ${s.label}
      </div>`
    ).join('') +
    `<div class="intercept-chip" style="border-color:rgba(251,191,36,0.4);color:#fbbf24;background:rgba(251,191,36,0.08)">
      🧭 Bail out: head ${dirLabel}
    </div>`;
}

function getDirLabel(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ===== BAIL OUT BUTTON =====
function initBailoutButton() {
  document.getElementById('bailout-btn').addEventListener('click', () => {
    const dir = state.stormTrack?.dir ?? 225; // Default assume SW-moving storm, bail SE
    const url = getBailoutLink(dir);
    if (url) {
      window.open(url, '_blank');
      addLogEntry('alert', `🚨 BAIL OUT initiated — routing away from storm motion.`);
    } else {
      showCustomAlert('Set your location first (GPS or Settings) to use Bail Out routing.', { title: 'Location Required' });
    }
  });
}

// ===== CENTER ON USER =====
function initCenterButton() {
  document.getElementById('center-location-btn').addEventListener('click', centerOnUser);
}

function initResetGpsButton() {
  const btn = document.getElementById('reset-gps-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      // Clear manual override
      uiState.position = { userLat: null, userLon: null };
      saveUIState();
      
      addLogEntry('system', 'Location reset: Re-acquiring browser GPS...');
      centerOnUser(true); // Forces fresh GPS read and center
      
      // Refresh context-sensitive data after a short delay (enough for lock)
      setTimeout(() => {
        if (state.userLat) {
          fetchInstability(state.userLat, state.userLon);
        }
        fetchAlerts();
      }, 1500);
    });
  }
}

// ===== LOCATION PICKER =====
function initLocationPicker() {
  const btn = document.getElementById('set-pos-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      toggleLocationPicker(!isPicking());
    });
  }
}

// ===== RADAR LEGEND =====
function initRadarLegend() {
  const legend = document.getElementById('radar-legend');
  if (!legend) return;
  legend.innerHTML = `
    <div class="radar-legend-title">NEXRAD Reflectivity</div>
    <div class="radar-legend-bar">
      <div style="flex:1;background:#00e4ff"></div>
      <div style="flex:1;background:#0096ff"></div>
      <div style="flex:1;background:#00c800"></div>
      <div style="flex:1;background:#00a000"></div>
      <div style="flex:1;background:#f0f000"></div>
      <div style="flex:1;background:#e87000"></div>
      <div style="flex:1;background:#ff0000"></div>
      <div style="flex:1;background:#c80000"></div>
      <div style="flex:1;background:#ff00ff"></div>
    </div>
    <div class="radar-legend-labels">
      <span>Light</span><span>Moderate</span><span>Heavy</span>
    </div>`;
}

// ===== START =====
document.addEventListener('DOMContentLoaded', init);

// ===== STORM PICKER =====
function initStormPicker() {
  const btn = document.getElementById('storm-pick-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      toggleStormPicker(!isPicking());
    });
  }
}
