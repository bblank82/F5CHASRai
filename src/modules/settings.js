import { state, setGeminiKey, setGeminiModel, addLogEntry } from './state.js';
import { setManualLocation, addRadarOverlay } from './map.js';
import { updateModelBadge } from './agent.js';

export function initSettings() {
  const btn = document.getElementById('settings-btn');
  const modal = document.getElementById('settings-modal');
  const closeBtn = document.getElementById('settings-close-btn');
  const backdrop = modal.querySelector('.modal-backdrop');

  btn.addEventListener('click', openSettings);
  closeBtn.addEventListener('click', closeSettings);
  backdrop.addEventListener('click', closeSettings);

  // Save Gemini key
  document.getElementById('save-key-btn').addEventListener('click', () => {
    const key = document.getElementById('gemini-key-input').value.trim();
    const status = document.getElementById('key-status');
    if (!key) {
      status.textContent = 'Please enter a key.';
      status.className = 'key-status err';
      return;
    }
    setGeminiKey(key);
    status.textContent = '✓ Key saved for this session.';
    status.className = 'key-status ok';
    addLogEntry('system', 'Gemini API key configured.');
  });

  // Save Gemini model
  document.getElementById('save-model-btn').addEventListener('click', () => {
    const model = document.getElementById('gemini-model-input').value.trim();
    const status = document.getElementById('model-status');
    if (!model) {
      status.textContent = 'Please enter a model ID.';
      status.className = 'key-status err';
      return;
    }
    setGeminiModel(model);
    updateModelBadge();
    status.textContent = '✓ Model updated.';
    status.className = 'key-status ok';
    addLogEntry('system', `Gemini model updated to: ${model}`);
  });

  // Manual location
  document.getElementById('set-manual-location-btn').addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('manual-lat').value);
    const lon = parseFloat(document.getElementById('manual-lon').value);
    if (isNaN(lat) || isNaN(lon)) {
      alert('Please enter valid latitude and longitude.');
      return;
    }
    setManualLocation(lat, lon);
    closeSettings();
  });


  // Prefill existing key indicator
  if (state.geminiKey) {
    document.getElementById('key-status').textContent = '✓ Key already configured for this session.';
    document.getElementById('key-status').className = 'key-status ok';
  }
  if (state.model) {
    document.getElementById('gemini-model-input').value = state.model;
  }
}

function openSettings() {
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}
