// modules/instability.js — Open-Meteo atmospheric sounding data
import { state, addLogEntry } from './state.js';

const OM_BASE = 'https://api.open-meteo.com/v1/forecast';

// Thresholds for color coding
const THRESHOLDS = {
  cape:      [500, 1500, 3000, 5000],   // J/kg
  cin:       [-25, -100, -250, -500],   // J/kg (Negative, so closer to 0 is less capping)
  shear_06:  [20, 35, 50, 70],          // kt
  shear_01:  [10, 20, 30, 45],          // kt
  lcl:       [1500, 1000, 700, 400],    // m 
  dewpoint:  [55, 60, 65, 70],          // °F
  pwat:      [0.8, 1.2, 1.6, 2.0],      // in
};

export function initInstabilityPanel() {
  // Listener is delegated or re-bound on render since we render the button dynamically now
  document.getElementById('sounding-grid').addEventListener('click', (e) => {
    if (e.target && e.target.id === 'refresh-instability') {
      fetchInstability();
    }
  });
}

export async function fetchInstability(lat, lon) {
  const btn = document.getElementById('refresh-instability');
  btn && btn.classList.add('spinning');

  const targetLat = lat || state.userLat || 35.5;
  const targetLon = lon || state.userLon || -97.5;

  if (state.targetTime) {
    const grid = document.getElementById('sounding-grid');
    if (grid) grid.innerHTML = `
      <div class="archive-disabled-state">
        <span>🕒 Archive Mode Active</span>
        <p>Instability data (RAP/HRRR) is currently only available for Live mode.</p>
      </div>`;
    btn && btn.classList.remove('spinning');
    return null;
  }

  try {
    const params = new URLSearchParams({
      latitude: targetLat,
      longitude: targetLon,
      hourly: [
        'cape', 'lifted_index', 'convective_inhibition',
        'wind_speed_10m', 'wind_speed_80m', 'wind_speed_120m',
        'wind_direction_10m', 'wind_direction_80m', 'wind_direction_120m',
        'temperature_2m', 'dew_point_2m', 'relative_humidity_2m', 'vapour_pressure_deficit',
      ].join(','),
      wind_speed_unit: 'kn',
      temperature_unit: 'fahrenheit',
      forecast_days: 1,
      timezone: 'auto',
    });

    const res = await fetch(`${OM_BASE}?${params}`);
    if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
    const data = await res.json();

    // Get current hour index
    const now = new Date();
    const currentHour = now.getHours();
    const h = data.hourly;

    const idx = Math.min(currentHour, (h.time?.length || 1) - 1);

    const reading = {
      cape:       h.cape?.[idx] ?? null,
      li:         h.lifted_index?.[idx] ?? null,
      cin:        h.convective_inhibition?.[idx] ?? null,
      wind10:     h.wind_speed_10m?.[idx] ?? null,
      wind80:     h.wind_speed_80m?.[idx] ?? null,
      wind120:    h.wind_speed_120m?.[idx] ?? null,
      dir10:      h.wind_direction_10m?.[idx] ?? null,
      dir80:      h.wind_direction_80m?.[idx] ?? null,
      dir120:     h.wind_direction_120m?.[idx] ?? null,
      temperature: h.temperature_2m?.[idx] ?? null,
      dewpoint:   h.dew_point_2m?.[idx] ?? null,
      rh:         h.relative_humidity_2m?.[idx] ?? null,
      vpd:        h.vapour_pressure_deficit?.[idx] ?? null,
    };

    // 0-6km shear proxy: 10m vs 120m (available)
    reading.shear_06 = computeShear(reading.wind10, reading.dir10, reading.wind120, reading.dir120) * 1.8; // Extended proxy
    // 0-1km shear same proxy
    reading.shear_01 = computeShear(reading.wind10, reading.dir10, reading.wind80, reading.dir80) * 1.5;

    // Estimate LCL (Esposito's formula: LCL ≈ 125 * (T - Td))
    // We don't have surface T directly in the reading yet, but we have LI and CAPE which imply stability
    const temp = reading.dewpoint + (reading.li > 0 ? reading.li : 5); // Rough proxy for T
    reading.lcl = 125 * (temp - reading.dewpoint);

    state.instabilityData = reading;
    renderInstabilityPanel(reading, targetLat, targetLon);

    addLogEntry('system', `Instability data updated — CAPE: ${Math.round(reading.cape ?? 0)} J/kg, Shear: ${Math.round(reading.shear_06 ?? 0)} kt`);
    return reading;
  } catch (err) {
    console.error('Instability fetch failed:', err);
    document.getElementById('sounding-grid').innerHTML = `<div class="loading-state text-danger">Instability data unavailable: ${err.message}</div>`;
    return null;
  } finally {
    btn && btn.classList.remove('spinning');
  }
}

function computeShear(spd1, dir1, spd2, dir2) {
  if (spd1 == null || spd2 == null) return null;
  const d1 = ((dir1 || 0) * Math.PI) / 180;
  const d2 = ((dir2 || 0) * Math.PI) / 180;
  const u1 = -spd1 * Math.sin(d1), v1 = -spd1 * Math.cos(d1);
  const u2 = -spd2 * Math.sin(d2), v2 = -spd2 * Math.cos(d2);
  return Math.sqrt((u2 - u1) ** 2 + (v2 - v1) ** 2);
}

function getBarClass(value, thresholds, inverted = false) {
  const v = inverted ? -value : value;
  const [t1, t2, t3, t4] = inverted ? thresholds.map(t => -t) : thresholds;
  if (v >= t4) return 'bar-extreme';
  if (v >= t3) return 'bar-high';
  if (v >= t2) return 'bar-moderate';
  if (v >= t1) return 'bar-low';
  return 'bar-low';
}

function getBarWidth(value, min, max) {
  if (value == null) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function fmt(v, unit = '', decimals = 0) {
  if (v == null || isNaN(v)) return '—';
  return `${Number(v).toFixed(decimals)}${unit}`;
}

function liColor(li) {
  if (li == null) return 'var(--text-muted)';
  if (li <= -6) return 'var(--danger)';
  if (li <= -3) return 'var(--warning)';
  if (li <= 0) return 'var(--accent)';
  return 'var(--success)';
}

function renderInstabilityPanel(r, lat, lon) {
  const grid = document.getElementById('sounding-grid');
  if (!grid) return;

  const categories = [
    {
      title: 'Thermodynamics',
      icon: '🔥',
      items: [
        { label: 'SBCAPE', value: r.cape, unit: ' J/kg', color: getValColor(r.cape, THRESHOLDS.cape), status: getCapeStatus(r.cape), tooltip: 'Surface-Based Convective Available Potential Energy. Measures buoyancy/instability; higher values mean stronger updrafts.' },
        { label: 'SBCIN', value: r.cin, unit: ' J/kg', color: getCinColor(r.cin), status: getCinStatus(r.cin), tooltip: 'Convective Inhibition. The "cap" that prevents air from rising. High CIN can prevent storm development even in high CAPE.' },
        { label: 'Temperature', value: r.temperature, unit: '°F', color: 'var(--text-primary)', status: r.temperature > 80 ? 'Warm' : 'Mild', tooltip: 'Current surface temperature. High surface temps contribute to steeper lapse rates and instability.' },
        { label: 'Lifted Index', value: r.li, unit: '', color: getLiColor(r.li), status: getLiStatus(r.li), tooltip: 'Measure of stability. Values below 0 indicate potential for thunderstorms; -6 or lower is extreme.' },
      ]
    },
    {
      title: 'Kinematics',
      icon: '🌪️',
      items: [
        { label: 'Bulk Shear', value: r.shear_06, unit: ' kt', color: getValColor(r.shear_06, THRESHOLDS.shear_06), status: getShearStatus(r.shear_06), tooltip: '0–6km Bulk Shear. Measures change in wind with height. >35kt is favorable for supercell organization.' },
        { label: '0–1km Shear', value: r.shear_01, unit: ' kt', color: getValColor(r.shear_01, THRESHOLDS.shear_01), status: r.shear_01 >= 20 ? 'High' : 'Low', tooltip: 'Low-level wind shear. Critical for tornado potential; higher values increase the likelihood of low-level rotation.' },
      ]
    },
    {
      title: 'Moisture',
      icon: '💧',
      items: [
        { label: 'Dewpoint', value: r.dewpoint, unit: '°F', color: getValColor(r.dewpoint, THRESHOLDS.dewpoint), status: r.dewpoint >= 65 ? 'Rich' : 'Marginal', tooltip: 'Surface dewpoint temperature. Measures absolute moisture; 60°F+ is generally needed for severe convection.' },
        { label: 'Rel. Humidity', value: r.rh, unit: '%', color: 'var(--text-secondary)', status: r.rh >= 70 ? 'High' : 'Low', tooltip: 'Relative Humidity at the surface. High RH prevents evaporative cooling and helps maintain updraft strength.' },
      ]
    },
    {
      title: 'Lift / Forcing',
      icon: '🚀',
      items: [
        { label: 'Est. LCL', value: r.lcl, unit: ' m', color: getValColorInv(r.lcl, THRESHOLDS.lcl), status: r.lcl <= 1000 ? 'Favorable' : 'High', tooltip: 'Lifting Condensation Level. Estimated height of cloud bases. Low LCLs (<1000m) are favorable for tornado production.' },
        { label: 'VPD', value: r.vpd, unit: ' kPa', color: 'var(--text-secondary)', status: r.vpd < 1.0 ? 'Moist' : 'Dry', tooltip: 'Vapor Pressure Deficit. Measures how "thirsty" the air is. High VPD can lead to cold, outflow-dominant storm behavior.' },
      ]
    }
  ];

  grid.innerHTML = `
    <div class="conditions-grid">
      ${categories.map(cat => `
        <div class="condition-category">
          <div class="category-title">${cat.icon} ${cat.title}</div>
          <div class="condition-items-container">
            ${cat.items.map(item => `
              <div class="condition-item" title="${item.tooltip}">
                <div class="condition-label">${item.label}</div>
                <div class="condition-value-row">
                  <div class="condition-value" style="color:${item.color}">${fmt(item.value, '', item.label === 'Lifted Index' || item.label === 'VPD' ? 1 : 0)}</div>
                  <div class="condition-unit">${item.unit}</div>
                </div>
                <div class="condition-status" style="color:${item.color}; border-color:${item.color}44">${item.status}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-top:8px; width:100%; border-top:1px solid var(--border); padding-top:8px;">
        <span style="font-size: 10px; color: var(--text-muted);">
          Data as of: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button class="refresh-btn" id="refresh-instability" title="Refresh">↻</button>
      </div>
    </div>
  `;
}

function getCapeStatus(v) {
  if (v >= 3500) return 'Extreme';
  if (v >= 2000) return 'Very High';
  if (v >= 1000) return 'Moderate';
  if (v >= 500) return 'Low';
  return 'Stable';
}

function getCinStatus(v) {
  const abs = Math.abs(v || 0);
  if (abs === 0) return 'Open';
  if (abs < 25) return 'Weak';
  if (abs < 100) return 'Moderate';
  return 'Strong Cap';
}

function getCinColor(v) {
  const abs = Math.abs(v || 0);
  if (abs < 25) return 'var(--success)';
  if (abs < 100) return 'var(--accent)';
  if (abs < 250) return 'var(--warning)';
  return 'var(--danger)';
}

function getLiStatus(v) {
  if (v <= -8) return 'Extreme';
  if (v <= -4) return 'High';
  if (v <= 0) return 'Marginal';
  return 'Stable';
}

function getLiColor(v) {
  if (v <= -6) return 'var(--danger)';
  if (v <= -2) return 'var(--warning)';
  if (v <= 0) return 'var(--accent)';
  return 'var(--success)';
}

function getShearStatus(v) {
  if (v >= 50) return 'Supercell';
  if (v >= 35) return 'Organized';
  if (v >= 20) return 'Marginal';
  return 'Weak';
}

function getValColorInv(val, t) {
  if (val == null) return 'var(--text-muted)';
  if (val <= t[3]) return 'var(--danger)';
  if (val <= t[2]) return 'var(--warning)';
  if (val <= t[1]) return 'var(--accent)';
  return 'var(--success)';
}

function getValColor(val, t) {
  if (val == null) return 'var(--text-muted)';
  if (val >= t[3]) return 'var(--danger)';
  if (val >= t[2]) return 'var(--warning)';
  if (val >= t[1]) return 'var(--accent)';
  return 'var(--success)';
}

export function getInstabilityContext() {
  const r = state.instabilityData;
  if (!r) return 'No instability data available.';
  return `Current atmospheric profile:
- CAPE: ${fmt(r.cape, ' J/kg')} (${r.cape >= 3000 ? 'Extreme' : r.cape >= 1500 ? 'High' : r.cape >= 500 ? 'Moderate' : 'Low'})
- 0-6km Bulk Shear: ${fmt(r.shear_06, ' kt')} (${r.shear_06 >= 50 ? 'Supercell favorable' : r.shear_06 >= 35 ? 'Organized convection' : 'Weak'})
- 0-1km Shear: ${fmt(r.shear_01, ' kt')}
- Lifted Index: ${fmt(r.li, '', 1)}
- Surface Dewpoint: ${fmt(r.dewpoint, '°F')}
- Surface Wind: ${fmt(r.wind10, ' kt')} from ${fmt(r.dir10, '°')}`;
}
