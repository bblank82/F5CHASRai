// modules/threat.js — Composite Chase Threat Score
import { state } from './state.js';

/**
 * Compute a 1–10 composite threat score based on:
 * - Active tornado/severe warnings near user
 * - CAPE / shear composite
 * - Storm proximity
 */
export function computeThreatScore() {
  let score = 0;

  // 1. Active alerts component (0–4 pts)
  const alerts = state.activeAlerts || [];
  const hasTorWarning = alerts.some(f => /tornado warning/i.test(f.properties.event));
  const hasSvrWarning = alerts.some(f => /severe thunderstorm warning/i.test(f.properties.event));
  const hasTorWatch = alerts.some(f => /tornado watch/i.test(f.properties.event));
  const hasSvrWatch = alerts.some(f => /severe thunderstorm watch/i.test(f.properties.event));
  const hasPDS = alerts.some(f => /particularly dangerous situation/i.test((f.properties.headline || '') + (f.properties.description || '')));

  if (hasTorWarning) score += hasPDS ? 5 : 4;
  else if (hasSvrWarning) score += 3;
  else if (hasTorWatch) score += 2;
  else if (hasSvrWatch) score += 1;

  // 2. CAPE component (0–2 pts)
  const inst = state.conditionsData;
  if (inst) {
    const cape = inst.cape || 0;
    if (cape >= 3000) score += 2;
    else if (cape >= 1500) score += 1.5;
    else if (cape >= 500) score += 0.5;

    // 3. Shear component (0–2 pts)
    const shear = inst.shear_06 || 0;
    if (shear >= 50) score += 2;
    else if (shear >= 35) score += 1.5;
    else if (shear >= 20) score += 0.5;

    // 4. Low-level shear (0–1 pt)
    const shear01 = inst.shear_01 || 0;
    if (shear01 >= 30) score += 1;
    else if (shear01 >= 20) score += 0.5;
  }

  // Cap at 10
  score = Math.min(10, Math.round(score));

  state.threatScore = score;
  renderThreatBadge(score);
  return score;
}

function renderThreatBadge(score) {
  const badge = document.getElementById('threat-badge');
  const scoreEl = document.getElementById('threat-score');
  const levelEl = document.getElementById('threat-level-text');
  if (!badge || !scoreEl || !levelEl) return;

  scoreEl.textContent = score;

  // Remove all classes
  badge.classList.remove('threat-low', 'threat-moderate', 'threat-high', 'threat-extreme');

  let level, cls;
  if (score <= 2) { level = 'LOW'; cls = 'threat-low'; }
  else if (score <= 4) { level = 'MODERATE'; cls = 'threat-moderate'; }
  else if (score <= 7) { level = 'HIGH'; cls = 'threat-high'; }
  else { level = 'EXTREME'; cls = 'threat-extreme'; }

  levelEl.textContent = level;
  badge.classList.add(cls);
}

export function getThreatContext() {
  const score = state.threatScore;
  const alerts = state.activeAlerts || [];
  const torWarnings = alerts.filter(f => /tornado warning/i.test(f.properties.event));
  const svrWarnings = alerts.filter(f => /severe thunderstorm warning/i.test(f.properties.event));

  return `Current threat assessment:
- Composite threat score: ${score}/10 (${score <= 2 ? 'LOW' : score <= 4 ? 'MODERATE' : score <= 7 ? 'HIGH' : 'EXTREME'})
- Active tornado warnings: ${torWarnings.length}
- Active severe thunderstorm warnings: ${svrWarnings.length}
- Total severe alerts: ${alerts.length}`;
}
