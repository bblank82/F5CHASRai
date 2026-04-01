import { state, uiState, saveUIState, setGeminiKey, setGeminiModel, addLogEntry } from './state.js';
import { setManualLocation, addRadarOverlay, renderUserPoints } from './map.js';
import { updateModelBadge } from './agent.js';
import { showCustomConfirm, showCustomAlert } from './ui.js';

let currentEditingGroupId = null;

export function initSettings() {
  const btn = document.getElementById('settings-btn');
  const modal = document.getElementById('settings-modal');
  const closeBtn = document.getElementById('settings-close-btn');
  const backdrop = modal.querySelector('.modal-backdrop');

  if (btn) btn.addEventListener('click', openSettings);
  if (closeBtn) closeBtn.addEventListener('click', closeSettings);
  if (backdrop) backdrop.addEventListener('click', closeSettings);

  // Points Refactored
  initPointsAccordion();
  setupPointsModal();

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
        showCustomAlert('Please enter valid latitude and longitude.', { title: 'Invalid Coordinates', type: 'warning' });
        return;
      }
      setManualLocation(lat, lon);
      closeSettings();
    });
  }


  // Reset all settings
  const resetSettingsBtn = document.getElementById('reset-settings-btn');
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const confirmed = await showCustomConfirm(
        'Are you sure you want to reset all settings? This will clear your local preferences and history, but keep your API key.',
        { title: 'Safe Reset', confirmText: 'Reset Everything', type: 'danger' }
      );
      
      if (confirmed) {
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

// --- Points Management Refactored ---

function initPointsAccordion() {
  const list = document.getElementById('points-accordion-list');
  const addBtn = document.getElementById('add-point-group-btn');

  if (addBtn) addBtn.onclick = () => openPointsModal(null);

  if (!list) return;

  list.innerHTML = '';
  if (uiState.userPointGroups.length === 0) {
    list.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:10px;">No custom point groups added.</div>';
  }

  uiState.userPointGroups.forEach(group => {
    const row = document.createElement('div');
    row.className = 'point-list-row';
    row.innerHTML = `
      <div class="point-list-info" title="Edit Group">
        <div class="point-list-color-dot" style="background: ${group.color}"></div>
        <span class="point-list-name">${group.name}</span>
      </div>
      <div class="point-list-actions">
        <button class="point-list-btn vis-btn ${group.visible ? 'active' : ''}" title="Toggle Visibility">
          ${group.visible ? '👁️' : '👁️‍🗨️'}
        </button>
        <button class="point-list-btn edit-btn" title="Edit Settings">✏️</button>
      </div>
    `;

    row.querySelector('.point-list-info').onclick = () => openPointsModal(group.id);
    row.querySelector('.edit-btn').onclick = () => openPointsModal(group.id);
    
    row.querySelector('.vis-btn').onclick = (e) => {
      e.stopPropagation();
      group.visible = !group.visible;
      saveUIState();
      initPointsAccordion();
      renderUserPoints();
    };

    list.appendChild(row);
  });
}

function setupPointsModal() {
  const modal = document.getElementById('points-modal');
  const closeBtn = document.getElementById('points-modal-close');
  const saveBtn = document.getElementById('points-save-btn');
  const deleteBtn = document.getElementById('points-delete-btn');
  const backdrop = modal.querySelector('.modal-backdrop');

  if (closeBtn) closeBtn.onclick = closePointsModal;
  if (backdrop) backdrop.onclick = closePointsModal;

  if (saveBtn) {
    saveBtn.onclick = () => {
      const name = document.getElementById('points-group-name-input').value.trim();
      const color = document.getElementById('points-group-color-input').value;
      const raw = document.getElementById('points-group-raw-input').value.trim();

      if (!name) {
        showCustomAlert('Please enter a group name.', { title: 'Missing Info', type: 'warning' });
        return;
      }

      if (currentEditingGroupId) {
        const group = uiState.userPointGroups.find(g => g.id === currentEditingGroupId);
        if (group) {
          group.name = name;
          group.color = color;
          group.raw = raw;
        }
      } else {
        uiState.userPointGroups.push({
          id: 'group_' + Date.now(),
          name,
          color,
          raw,
          visible: true
        });
      }

      saveUIState();
      closePointsModal();
      initPointsAccordion();
      renderUserPoints();
      addLogEntry('system', `Custom points list "${name}" updated.`);
    };
  }

  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (!currentEditingGroupId) return;
      const group = uiState.userPointGroups.find(g => g.id === currentEditingGroupId);
      if (!group) return;

      const confirmed = await showCustomConfirm(`Delete group "${group.name}"? This cannot be undone.`, { 
        title: 'Delete Group', 
        confirmText: 'Delete', 
        type: 'danger' 
      });

      if (confirmed) {
        uiState.userPointGroups = uiState.userPointGroups.filter(g => g.id !== currentEditingGroupId);
        saveUIState();
        closePointsModal();
        initPointsAccordion();
        renderUserPoints();
        addLogEntry('system', `Custom points list "${group.name}" deleted.`);
      }
    };
  }
}

function openPointsModal(groupId) {
  currentEditingGroupId = groupId;
  const modal = document.getElementById('points-modal');
  const group = uiState.userPointGroups.find(g => g.id === groupId);

  if (group) {
    document.getElementById('points-modal-title').textContent = '✏️ Edit Point Group';
    document.getElementById('points-group-name-input').value = group.name;
    document.getElementById('points-group-color-input').value = group.color || '#f59e0b';
    document.getElementById('points-group-raw-input').value = group.raw;
    document.getElementById('points-delete-btn').style.display = 'block';
  } else {
    document.getElementById('points-modal-title').textContent = '📍 Add New Point Group';
    document.getElementById('points-group-name-input').value = '';
    document.getElementById('points-group-color-input').value = '#f59e0b';
    document.getElementById('points-group-raw-input').value = '';
    document.getElementById('points-delete-btn').style.display = 'none';
  }

  modal.classList.remove('hidden');
}

function closePointsModal() {
  document.getElementById('points-modal').classList.add('hidden');
}

function openSettings() {
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}
