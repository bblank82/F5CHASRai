import { state, setGeminiKey, setGeminiModel, addLogEntry } from './state.js';
import { setManualLocation, addRadarOverlay } from './map.js';
import { updateModelBadge } from './agent.js';

export function initSettings() {
  const btn = document.getElementById('settings-btn');
  const modal = document.getElementById('settings-modal');
  const closeBtn = document.getElementById('settings-close-btn');
  const backdrop = modal.querySelector('.modal-backdrop');

  if (btn) btn.addEventListener('click', openSettings);
  if (closeBtn) closeBtn.addEventListener('click', closeSettings);
  if (backdrop) backdrop.addEventListener('click', closeSettings);

  // Save Gemini key
  const saveKeyBtn = document.getElementById('save-key-btn');
  if (saveKeyBtn) {
    saveKeyBtn.addEventListener('click', () => {
      const key = document.getElementById('gemini-key-input')?.value.trim();
      const status = document.getElementById('key-status');
      if (!key) {
        if (status) {
          status.textContent = 'Please enter a key.';
          status.className = 'key-status err';
        }
        return;
      }
      setGeminiKey(key);
      if (status) {
        status.textContent = '✓ Key saved for this session.';
        status.className = 'key-status ok';
      }
      addLogEntry('system', 'Gemini API key configured.');
    });
  }

  // Save Gemini model
  const saveModelBtn = document.getElementById('save-model-btn');
  if (saveModelBtn) {
    saveModelBtn.addEventListener('click', () => {
      const model = document.getElementById('gemini-model-input')?.value.trim();
      const status = document.getElementById('model-status');
      if (!model) {
        if (status) {
          status.textContent = 'Please enter a model ID.';
          status.className = 'key-status err';
        }
        return;
      }
      setGeminiModel(model);
      updateModelBadge();
      if (status) {
        status.textContent = '✓ Model updated.';
        status.className = 'key-status ok';
      }
      addLogEntry('system', `Gemini model updated to: ${model}`);
    });
  }

  // Manual location
  const setManualBtn = document.getElementById('set-manual-location-btn');
  if (setManualBtn) {
    setManualBtn.addEventListener('click', () => {
      const latInput = document.getElementById('manual-lat');
      const lonInput = document.getElementById('manual-lon');
      const lat = parseFloat(latInput?.value);
      const lon = parseFloat(lonInput?.value);
      if (isNaN(lat) || isNaN(lon)) {
        alert('Please enter valid latitude and longitude.');
        return;
      }
      setManualLocation(lat, lon);
      closeSettings();
    });
  }


  // Reset all settings
  const resetSettingsBtn = document.getElementById('reset-settings-btn');
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all settings? This will clear your local preferences and history, but keep your API key.')) {
        localStorage.clear();
        // sessionStorage is not cleared, preserving the Gemini API key
        window.location.reload();
      }
    });
  }


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
