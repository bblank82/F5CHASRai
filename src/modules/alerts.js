// modules/alerts.js — NWS Active Alerts
import { state, addLogEntry } from './state.js';
import { renderAlertPolygons } from './map.js';
import { getStateCode } from './geocoding.js';

const NWS_BASE = 'https://api.weather.gov';

export async function fetchAlerts() {
  const btn = document.getElementById('refresh-alerts');
  btn && btn.classList.add('spinning');

  try {
    let features = [];
    
    if (state.targetTime) {
      features = await fetchHistoricalAlerts(state.targetTime);
    } else {
      let url = `${NWS_BASE}/alerts/active?status=actual&message_type=alert&urgency=Immediate,Expected&severity=Extreme,Severe`;

      // Derive area from current coordinates (GPS or manual override)
      if (state.userLat && state.userLon) {
        const stateCode = await getStateCode(state.userLat, state.userLon);
        if (stateCode) url += `&area=${stateCode}`;
      }

      const res = await fetch(url, {
        headers: { 'User-Agent': 'StormChaserAgent/1.0 (field-use; contact@example.com)', 'Accept': 'application/geo+json' }
      });

      if (!res.ok) throw new Error(`NWS API error: ${res.status}`);
      const data = await res.json();
      features = data.features || [];
    }

    state.activeAlerts = features;
    renderAlertsList(features);
    renderAlertPolygons(features);
    updateAlertBadge(features.length);

    // Log significant alerts
    const torWarnings = features.filter(f => /tornado warning/i.test(f.properties.event));
    if (torWarnings.length > 0) {
      addLogEntry('alert', `⚠️ ${torWarnings.length} TORNADO WARNING(S) active — ${torWarnings.map(f => f.properties.areaDesc).join('; ')}`);
    }

    return features;
  } catch (err) {
    console.error('Alert fetch failed:', err);
    document.getElementById('alerts-body').innerHTML = `<div class="loading-state text-danger">Failed to load alerts: ${err.message}</div>`;
    return [];
  } finally {
    btn && btn.classList.remove('spinning');
  }
}

function updateAlertBadge(count) {
  const badge = document.getElementById('alerts-count-badge');
  const headerBadge = document.getElementById('alert-count-badge');
  const headerNum = document.getElementById('alert-count-num');

  if (badge) badge.textContent = count;
  if (headerNum) headerNum.textContent = count;
  if (headerBadge) headerBadge.classList.toggle('hidden', count === 0);
}

async function fetchHistoricalAlerts(time) {
  const ts = time.toISOString().split('.')[0] + 'Z';
  const url = `https://mesonet.agron.iastate.edu/json/vtec_events.py?time=${ts}`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IEM Archive error: ${res.status}`);
  const data = await res.json();
  
  // IEM returns a slightly different format, map it to NWS-like GeoJSON
  return (data.features || []).map(f => ({
    type: 'Feature',
    properties: {
      id: f.properties.vtec_id,
      event: f.properties.event_type || f.properties.phenomena_name,
      headline: f.properties.event_type || f.properties.phenomena_name,
      description: `WFO ${f.properties.wfo} - ${f.properties.phenomena_name} ${f.properties.significance_name}`,
      areaDesc: f.properties.locations || '',
      expires: f.properties.expire_time
    },
    geometry: f.geometry
  }));
}

function getAlertClass(event) {
  const e = (event || '').toLowerCase();
  if (e.includes('tornado warning')) return 'tor-warning';
  if (e.includes('severe thunderstorm warning')) return 'svr-warning';
  if (e.includes('tornado watch')) return 'tor-watch';
  if (e.includes('severe thunderstorm watch')) return 'svr-watch';
  if (e.includes('flash flood')) return 'flash-flood';
  return '';
}

function getAlertColor(event) {
  const e = (event || '').toLowerCase();
  if (e.includes('tornado warning')) return '#ff4444';
  if (e.includes('severe thunderstorm warning')) return '#ff8c00';
  if (e.includes('tornado watch')) return '#f5f500';
  if (e.includes('severe thunderstorm watch')) return '#00bfff';
  if (e.includes('flash flood')) return '#00ff00';
  return '#94a3b8';
}

function isPDS(props) {
  const headline = (props.headline || '') + (props.description || '');
  return /particularly dangerous situation/i.test(headline);
}

function renderAlertsList(features) {
  const body = document.getElementById('alerts-body');
  if (!body) return;

  if (features.length === 0) {
    body.innerHTML = `<div class="no-alerts-state"><span style="font-size:24px">✅</span><span>No active severe weather alerts</span></div>`;
    return;
  }

  // Sort: tornado warnings first, then by severity
  const sorted = [...features].sort((a, b) => {
    const rank = e => {
      const ev = (e.properties.event || '').toLowerCase();
      if (ev.includes('tornado warning')) return 0;
      if (ev.includes('severe thunderstorm warning')) return 1;
      if (ev.includes('tornado watch')) return 2;
      if (ev.includes('severe thunderstorm watch')) return 3;
      return 4;
    };
    return rank(a) - rank(b);
  });

  body.innerHTML = sorted.map(f => {
    const p = f.properties;
    const cls = getAlertClass(p.event);
    const color = getAlertColor(p.event);
    const pds = isPDS(p);
    const expires = p.expires ? new Date(p.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

    return `<div class="alert-item ${cls} ${pds ? 'pds' : ''}" data-id="${p.id || ''}">
      <div class="alert-type-badge" style="color:${color}">${pds ? '🚨 PDS — ' : ''}${p.event || 'Alert'}</div>
      <div class="alert-headline">${p.headline || p.description?.slice(0, 120) || ''}</div>
      <div class="alert-area">${p.areaDesc || ''}</div>
      <div class="alert-expires">Expires: ${expires}</div>
    </div>`;
  }).join('');
}
