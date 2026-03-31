// modules/log.js — Chase Log
import { state, addLogEntry } from './state.js';
import { showCustomConfirm } from './ui.js';

export function initLog() {
  document.getElementById('log-btn').addEventListener('click', openLog);
  document.getElementById('log-close-btn').addEventListener('click', closeLog);
  document.getElementById('log-modal').querySelector('.modal-backdrop').addEventListener('click', closeLog);
  document.getElementById('export-log-btn').addEventListener('click', exportLog);
  document.getElementById('clear-log-btn').addEventListener('click', (e) => clearLog(e));
}

export function openLog() {
  renderLogEntries();
  document.getElementById('log-modal').classList.remove('hidden');
}

function closeLog() {
  document.getElementById('log-modal').classList.add('hidden');
}

function renderLogEntries() {
  const container = document.getElementById('log-entries');
  if (!container) return;

  if (state.chaseLog.length === 0) {
    container.innerHTML = '<div class="loading-state">No log entries yet. Activity will be recorded here during your chase.</div>';
    return;
  }

  container.innerHTML = state.chaseLog.map(entry => {
    const t = new Date(entry.time);
    const timeStr = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `<div class="log-entry log-${entry.type}">
      <span class="log-time">${timeStr}</span>
      <span class="log-type-badge">${entry.type}</span>
      <span class="log-text">${entry.text}</span>
    </div>`;
  }).join('');
}

function exportLog() {
  const json = JSON.stringify(state.chaseLog, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chase-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function clearLog(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  const confirmed = await showCustomConfirm(
    'Are you sure you want to clear all entries in the chase log?',
    { title: 'Clear History', confirmText: 'Clear Log', type: 'danger' }
  );
  
  if (!confirmed) return;
  
  state.chaseLog.length = 0;
  localStorage.removeItem('chase_log');
  renderLogEntries();
}

export { addLogEntry };
