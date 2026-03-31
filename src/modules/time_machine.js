import { state, setTargetTime, addLogEntry, uiState, saveUIState } from './state.js';
import { showCustomAlert } from './ui.js';

export function initTimeMachine(onTimeChange) {
  const container = document.getElementById('time-machine-bar');
  const liveBtn = document.getElementById('tm-live-btn');
  const archiveBtn = document.getElementById('tm-archive-btn');
  const dateInput = document.getElementById('archive-date');
  const timeInput = document.getElementById('archive-time');
  const applyBtn = document.getElementById('archive-apply-btn');
  const controls = document.getElementById('tm-controls');

  if (!container || !liveBtn || !archiveBtn) return;

  // Layers unavailable in archive mode
  const ARCHIVE_DISABLED_LAYERS = ['spc', 'alerts', 'track'];

  // Lazily import to avoid circular dep — map.js imports state.js too
  async function getMapFns() {
    const { setLayerVisibility, clearRadarOverlay, addRadarOverlay } = await import('./map.js');
    return { setLayerVisibility, clearRadarOverlay, addRadarOverlay };
  }

  function setButtonsDisabled(isDisabled) {
    ARCHIVE_DISABLED_LAYERS.forEach(layer => {
      const btn = document.querySelector(`.layer-toggle[data-layer="${layer}"]`);
      if (!btn) return;
      if (isDisabled) {
        btn.setAttribute('disabled', 'true');
        btn.classList.remove('active');
        btn.title = 'Unavailable in Archive Mode';
      } else {
        btn.removeAttribute('disabled');
        btn.title = '';
      }
    });
  }

  function setApplyLoading(isLoading) {
    if (isLoading) {
      applyBtn.disabled = true;
      applyBtn.textContent = '⏳';
      applyBtn.title = 'Loading radar data…';
    } else {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Go';
      applyBtn.title = '';
    }
  }

  function setMode(mode, isInit = false) {
    const isArchive = mode === 'archive';
    state.archiveMode = isArchive;
    uiState.archive.mode = mode;
    if (!isInit) saveUIState();
    
    container.classList.toggle('archive-mode', isArchive);
    document.body.classList.toggle('archive-mode', isArchive);
    
    liveBtn.classList.toggle('active', !isArchive);
    archiveBtn.classList.toggle('active', isArchive);
    
    if (controls) controls.classList.toggle('hidden', !isArchive);

    getMapFns().then(({ setLayerVisibility, clearRadarOverlay }) => {
      if (isArchive) {
        // Clear live radar immediately — user must press Go for archive-time data
        clearRadarOverlay();

        // Hide live-only layers; remember their previous state to restore later
        uiState._prearchiveLayers = {};
        ARCHIVE_DISABLED_LAYERS.forEach(layer => {
          uiState._prearchiveLayers[layer] = uiState.layers?.[layer] ?? true;
          setLayerVisibility(layer, false);
        });
        setButtonsDisabled(true);
      } else {
        // Clear archive radar immediately before live tiles stream in
        clearRadarOverlay();

        // Restore saved layer state
        setButtonsDisabled(false);
        const prev = uiState._prearchiveLayers || {};
        ARCHIVE_DISABLED_LAYERS.forEach(layer => {
          setLayerVisibility(layer, prev[layer] ?? true);
        });
        uiState._prearchiveLayers = null;
      }
    });

    if (!isArchive) {
      setTargetTime(null);
      if (!isInit) {
        addLogEntry('system', 'Returning to Live Mode.');
        onTimeChange();
      }
    }
  }

  liveBtn.addEventListener('click', () => setMode('live'));
  archiveBtn.addEventListener('click', () => setMode('archive'));

  applyBtn.addEventListener('click', async () => {
    if (!state.archiveMode) return;

    const dateStr = dateInput.value;
    const timeStr = timeInput.value;
    
    if (!dateStr || !timeStr) {
      showCustomAlert('Please select both date and time for Archive Mode.', { title: 'Time Machine Error', type: 'warning' });
      return;
    }

    // Combine into UTC Date
    const targetDate = new Date(`${dateStr}T${timeStr}:00Z`); 
    if (isNaN(targetDate.getTime())) {
      showCustomAlert('Invalid date/time format.', { title: 'Format Error', type: 'danger' });
      return;
    }

    uiState.archive.date = dateStr;
    uiState.archive.time = timeStr;
    saveUIState();

    setTargetTime(targetDate);
    addLogEntry('system', `Archive Mode Active: ${targetDate.toUTCString()}`);

    // Show loading, load radar, then clear loading
    const { addRadarOverlay } = await getMapFns();
    if (uiState.layers?.radar !== false) {
      setApplyLoading(true);
      try {
        await addRadarOverlay();
      } finally {
        setApplyLoading(false);
      }
    }

    onTimeChange();
  });

  // Set default to current time or saved time
  const now = new Date();
  dateInput.value = uiState.archive.date || now.toISOString().split('T')[0];
  timeInput.value = uiState.archive.time || now.toISOString().split('T')[1].slice(0, 5);

  if (uiState.archive.mode === 'archive') {
    const dateStr = dateInput.value;
    const timeStr = timeInput.value;
    if (dateStr && timeStr) {
      const targetDate = new Date(`${dateStr}T${timeStr}:00Z`);
      if (!isNaN(targetDate.getTime())) {
        setTargetTime(targetDate);
        setMode('archive', true);
      }
    }
  }
}
