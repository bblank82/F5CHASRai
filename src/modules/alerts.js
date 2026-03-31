// modules/alerts.js — NWS Active Alerts
import { state, addLogEntry, setAlertFilters } from './state.js';
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

      // Fetch nationwide severe weather alerts (no area= filter)

      const res = await fetch(url, {
        headers: { 'User-Agent': 'StormChaserAgent/1.0 (field-use; contact@example.com)', 'Accept': 'application/geo+json' }
      });

      if (!res.ok) throw new Error(`NWS API error: ${res.status}`);
      const data = await res.json();
      features = data.features || [];
    }

    state.activeAlerts = features;
    renderAlertsList(features);
    renderAlertFilterMenu(features);

    // Initial setup of controls if not already done
    setupAlertControls();

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

function updateAlertBadge(filteredCount, totalCount) {
  const badge = document.getElementById('alerts-count-badge');
  const headerBadge = document.getElementById('alert-count-badge');
  const headerNum = document.getElementById('alert-count-num');

  const text = (totalCount !== undefined && totalCount !== filteredCount) 
    ? `${filteredCount} (${totalCount})` 
    : filteredCount;

  if (badge) badge.textContent = text;
  if (headerNum) headerNum.textContent = filteredCount; // Header always filtered only
  if (headerBadge) headerBadge.classList.toggle('hidden', filteredCount === 0);
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

function matchesFilters(event) {
  if (!state.alertFilters || state.alertFilters.length === 0) return true;
  const e = (event || '').toLowerCase();
  
  // High-level grouping
  if (state.alertFilters.includes('Tornado Warning') && e.includes('tornado warning')) return true;
  if (state.alertFilters.includes('Severe Thunderstorm Warning') && e.includes('severe thunderstorm warning')) return true;
  if (state.alertFilters.includes('Tornado Watch') && e.includes('tornado watch')) return true;
  if (state.alertFilters.includes('Severe Thunderstorm Watch') && e.includes('severe thunderstorm watch')) return true;
  if (state.alertFilters.includes('Flash Flood Warning') && e.includes('flash flood')) return true;
  if (state.alertFilters.includes('Other') && 
      !e.includes('tornado') && !e.includes('severe thunderstorm') && !e.includes('flash flood')) return true;

  return false;
}

function renderAlertsList(features) {
  const body = document.getElementById('alerts-body');
  if (!body) return;

  if (features.length === 0) {
    body.innerHTML = `<div class="no-alerts-state"><span style="font-size:24px">✅</span><span>No active severe weather alerts</span></div>`;
    return;
  }

  const filtered = features.filter(f => matchesFilters(f.properties.event));

  if (filtered.length === 0) {
    body.innerHTML = `<div class="no-alerts-state"><span>Filter active: No alerts match your selection</span></div>`;
    updateAlertBadge(0, features.length);
    renderAlertPolygons([]);
    return;
  }

  // Update map and badge with filtered subset
  updateAlertBadge(filtered.length, features.length);
  renderAlertPolygons(filtered);

  // Sort: tornado warnings first
  const sorted = [...filtered].sort((a, b) => {
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

  // Add click listeners for modal
  body.querySelectorAll('.alert-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const alert = features.find(f => f.properties.id === id);
      if (alert) showAlertModal(alert.properties);
    });
  });
}

/**
 * Clean NWS text by removing hard-coded line breaks (approx 65 chars)
 * while preserving paragraph breaks and bulleted lists.
 */
function cleanNwsText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    // Replace single \n with space if NOT followed by a bullet, double newline, 
    // or a section header pattern (e.g. "HAZARD...", "IMPACT:")
    .replace(/\n(?!\s*[*-])(?!\s*[A-Z]{3,}[\.\:])(?!\n)/g, ' ')
    .replace(/[ ]{2,}/g, ' ') // Collapse multiple spaces but not across lines
    .trim();
}

function showAlertModal(p) {
  const modal = document.getElementById('alert-modal');
  const title = document.getElementById('alert-modal-title');
  const content = document.getElementById('alert-modal-content');
  const expires = p.expires ? new Date(p.expires).toLocaleString() : '—';

  title.textContent = p.event || 'Alert Details';
  content.innerHTML = `
    <div class="alert-detail-header">${p.headline || p.event}</div>
    <div class="alert-detail-meta">
      <span class="alert-meta-label">ID</span><span class="alert-meta-val">${p.id}</span>
      <span class="alert-meta-label">AREA</span><span class="alert-meta-val">${p.areaDesc}</span>
      <span class="alert-meta-label">EXPIRES</span><span class="alert-meta-val">${expires}</span>
    </div>
    <div class="alert-detail-text">${cleanNwsText(p.description || 'No description available.')}</div>
    ${p.instruction ? `<div class="alert-instruction-box">
      <div class="alert-instruction-title">INSTRUCTIONS</div>
      <div class="alert-instruction-text">${cleanNwsText(p.instruction)}</div>
    </div>` : ''}
  `;
  modal.classList.remove('hidden');
}

let controlsSetup = false;
function setupAlertControls() {
  if (controlsSetup) return;
  const filterBtn = document.getElementById('filter-alerts-btn');
  const filterMenu = document.getElementById('alert-filter-menu');
  const modal = document.getElementById('alert-modal');
  const modalClose = document.getElementById('alert-modal-close');

  if (filterBtn && filterMenu) {
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      filterMenu.classList.toggle('hidden');
    });
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!filterMenu.contains(e.target) && e.target !== filterBtn) {
        filterMenu.classList.add('hidden');
      }
    });
  }

  if (modal && modalClose) {
    modalClose.addEventListener('click', () => modal.classList.add('hidden'));
    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.add('hidden'));
  }

  controlsSetup = true;
}

function renderAlertFilterMenu() {
  const menu = document.getElementById('alert-filter-menu');
  if (!menu) return;

  const categories = [
    'Tornado Warning',
    'Severe Thunderstorm Warning',
    'Tornado Watch',
    'Severe Thunderstorm Watch',
    'Flash Flood Warning',
    'Other'
  ];

  menu.innerHTML = categories.map(cat => {
    const active = state.alertFilters.includes(cat);
    return `
      <div class="filter-option" data-cat="${cat}">
        <input type="checkbox" ${active ? 'checked' : ''} />
        <span>${cat}</span>
      </div>
    `;
  }).join('');

  menu.querySelectorAll('.filter-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const cat = opt.dataset.cat;
      const checkbox = opt.querySelector('input');
      
      // If clicking the label/div, toggle the checkbox manually
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      
      const newFilters = checkbox.checked 
        ? [...state.alertFilters, cat]
        : state.alertFilters.filter(f => f !== cat);
      
      setAlertFilters([...new Set(newFilters)]);
      renderAlertFilterMenu(); // Refresh menu UI
      renderAlertsList(state.activeAlerts); // Refresh list/map
    });
  });
}
