// modules/spc.js — Storm Prediction Center Outlook
import { renderSPCPolygons } from './map.js';
import { state } from './state.js';

const SPC_URLS = {
  1: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson',
  2: 'https://www.spc.noaa.gov/products/outlook/day2otlk_cat.nolyr.geojson',
  3: 'https://www.spc.noaa.gov/products/outlook/day3otlk_cat.nolyr.geojson',
};

const RISK_LEVELS = [
  { label: 'TSTM', name: 'General Thunder', color: '#c8c8c8', pct: '< 10%' },
  { label: 'MRGL', name: 'Marginal',        color: '#6aab47', pct: '10–15%' },
  { label: 'SLGT', name: 'Slight',          color: '#f5f500', pct: '15–30%' },
  { label: 'ENH',  name: 'Enhanced',        color: '#ff8c00', pct: '30–45%' },
  { label: 'MDT',  name: 'Moderate',        color: '#ff0000', pct: '45–60%' },
  { label: 'HIGH', name: 'High',            color: '#ff00ff', pct: '> 60%' },
];

let currentDay = 1;

export function initSPC() {
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDay = parseInt(btn.dataset.day);
      document.getElementById('spc-day-badge').textContent = `Day ${currentDay}`;
      fetchSPCOutlook(currentDay);
    });
  });

  fetchSPCOutlook(1);
}

export async function fetchSPCOutlook(day = currentDay) {
  const body = document.getElementById('spc-body');
  if (body) body.innerHTML = '<div class="loading-state">Loading SPC outlook…</div>';

  try {
    let features = [];
    if (state.targetTime) {
      features = await fetchHistoricalSPCOutlook(state.targetTime, day);
    } else {
      const url = SPC_URLS[day];
      const res = await fetch(url);
      if (!res.ok) throw new Error(`SPC server returned ${res.status}`);
      
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
        // Sometimes GeoJSON is served as text/plain, but if it's text/html, it's an error page
        if (contentType.includes('text/html')) {
          throw new Error('SPC server returned HTML instead of data (likely maintenance).');
        }
      }

      const data = await res.json();
      features = data.features || [];
    }

    renderSPCPolygons(features);
    renderSPCPanel(features, day);
    return features;
  } catch (err) {
    console.error('SPC fetch failed:', err);
    if (body) body.innerHTML = `<div class="loading-state text-danger">SPC data unavailable: ${err.message}</div>`;
    return [];
  }
}

async function fetchHistoricalSPCOutlook(date, day) {
  const ts = date.toISOString().split('.')[0] + 'Z';
  const url = `https://mesonet.agron.iastate.edu/json/spcoutlook.py?time=${ts}&day=${day}`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Archive server returned ${res.status}`);
  
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('Archive server returned HTML (likely data unavailable).');
  }

  const data = await res.json();
  
  // IEM returns features with slightly different property names (LABEL vs DN)
  // Our renderer expects LABEL
  return (data.features || []).map(f => ({
    ...f,
    properties: {
      ...f.properties,
      LABEL: f.properties.LABEL || f.properties.DN || ''
    }
  }));
}

function renderSPCPanel(features, day) {
  const body = document.getElementById('spc-body');
  if (!body) return;

  // Determine which risk levels are present
  const presentLabels = new Set(
    features.map(f => (f.properties.LABEL || f.properties.DN || '').toString().toUpperCase())
  );

  const maxRisk = RISK_LEVELS.slice().reverse().find(r => presentLabels.has(r.label));
  const riskItems = RISK_LEVELS.filter(r => presentLabels.has(r.label)).reverse();

  if (riskItems.length === 0) {
    body.innerHTML = `<div class="no-alerts-state"><span style="font-size:20px">🌤️</span><span>No significant severe weather outlook for Day ${day}</span></div>`;
    return;
  }

  body.innerHTML = `
    <div class="spc-risk-list">
      ${riskItems.map(r => `
        <div class="spc-risk-item">
          <div class="spc-risk-dot" style="background:${r.color};box-shadow:0 0 6px ${r.color}44"></div>
          <span class="spc-risk-name">${r.name}</span>
          <span class="spc-risk-pct">${r.pct}</span>
        </div>
      `).join('')}
    </div>
    <div class="spc-summary-text">
      ${maxRisk
        ? `Day ${day} outlook shows up to <strong style="color:${maxRisk.color}">${maxRisk.name.toUpperCase()}</strong> risk for severe thunderstorms. Check the map for exact polygon coverage.`
        : `General thunder possible on Day ${day}.`
      }
    </div>
  `;
}

export function getMaxSPCRisk(features) {
  const presentLabels = new Set(
    features.map(f => (f.properties.LABEL || f.properties.DN || '').toString().toUpperCase())
  );
  const idx = RISK_LEVELS.slice().reverse().findIndex(r => presentLabels.has(r.label));
  return idx >= 0 ? RISK_LEVELS.length - 1 - idx : -1; // 0=TSTM … 5=HIGH
}
