const defaultUIState = {
  layers: { spc: true, alerts: true, track: true, radar: false, counties: true },
  mapBounds: { center: [37.5, -98.5], zoom: 6 },
  panels: { trackCollapsed: false, chatCollapsed: false },
  archive: { mode: 'live', date: '', time: '' },
  accordion: 'acc-instability',
  position: { userLat: null, userLon: null },
  radarOpacity: 0.9
};

export const uiState = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem('ui_state'));
    if (saved) {
      return { 
        ...defaultUIState, ...saved, 
        panels: { ...defaultUIState.panels, ...(saved.panels || {}) },
        archive: { ...defaultUIState.archive, ...(saved.archive || {}) },
        position: { ...defaultUIState.position, ...(saved.position || {}) },
        layers: { ...defaultUIState.layers, ...(saved.layers || {}) },
        mapBounds: { ...defaultUIState.mapBounds, ...(saved.mapBounds || {}) }
      };
    }
  } catch (e) {}
  return defaultUIState;
})();

export function saveUIState() {
  localStorage.setItem('ui_state', JSON.stringify(uiState));
}

// modules/state.js — Shared application state
export const state = {
  userLat: uiState.position.userLat,
  userLon: uiState.position.userLon,
  geminiKey: sessionStorage.getItem('gemini_key') || '',
  nearbyRoads: [],
  model: enforceModernModel(localStorage.getItem('gemini_model')),
  alertState: localStorage.getItem('alert_state') || '',
  activeAlerts: [],
  spcFeatures: [],
  instabilityData: null,
  threatScore: 0,
  radarMode: 'composite',
  radarSite: null,
  radarProduct: 'N0Q',
  radarSource: localStorage.getItem('radar_source') || 'iem',
  radarOpacity: uiState.radarOpacity,
  lastRainViewerHash: null,
  targetTime: null, // null = Live Mode
  stormTrack: null,
  chatHistory: [],
  chaseLog: JSON.parse(localStorage.getItem('chase_log') || '[]'),
};

export function setRadarOpacity(val) {
  state.radarOpacity = val;
  uiState.radarOpacity = val;
  saveUIState();
}

export function setRadarSource(s) {
  state.radarSource = s;
  localStorage.setItem('radar_source', s);
}

export function setLocation(lat, lon) {
  state.userLat = lat;
  state.userLon = lon;
  uiState.position = { userLat: lat, userLon: lon };
  saveUIState();
}

export function setGeminiKey(key) {
  state.geminiKey = key;
  sessionStorage.setItem('gemini_key', key);
}

export function setGeminiModel(m) {
  state.model = m;
  localStorage.setItem('gemini_model', m);
}

export function setNearbyRoads(roads) {
  state.nearbyRoads = roads;
}

export function setTargetTime(time) {
  state.targetTime = time;
}

export function setAlertState(s) {
  state.alertState = s.toUpperCase();
  localStorage.setItem('alert_state', state.alertState);
}

export function addLogEntry(type, text) {
  const entry = {
    time: new Date().toISOString(),
    type,
    text,
  };
  state.chaseLog.unshift(entry);
  if (state.chaseLog.length > 200) state.chaseLog.pop();
  localStorage.setItem('chase_log', JSON.stringify(state.chaseLog));
  return entry;
}

function enforceModernModel(m) {
  const preferred = 'gemini-3-flash-preview';
  // If no model or an old one is set, use the preferred one
  if (!m || m.includes('2.0-flash') || m.includes('1.5-flash')) {
    localStorage.setItem('gemini_model', preferred);
    return preferred;
  }
  return m;
}
