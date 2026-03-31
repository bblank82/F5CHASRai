/**
 * StormTracker UI Utilities
 * Custom, non-blocking replacements for native confirm() and alert()
 */

export function showCustomConfirm(message, options = {}) {
  const { title = 'Confirm Action', confirmText = 'Confirm', cancelText = 'Cancel', type = 'info' } = options;
  
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';
    
    // Type-specific colors/icons
    const accentColor = type === 'danger' ? 'var(--danger)' : 'var(--accent)';
    
    overlay.innerHTML = `
      <div class="custom-confirm-card">
        <div class="custom-confirm-header" style="border-bottom-color: ${accentColor}">
          <span>${title}</span>
        </div>
        <div class="custom-confirm-body">
          <p>${message}</p>
        </div>
        <div class="custom-confirm-footer">
          <button class="custom-confirm-btn cancel" id="confirm-cancel-btn">${cancelText}</button>
          <button class="custom-confirm-btn confirm" id="confirm-ok-btn" style="background: ${accentColor}">${confirmText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    const cleanup = (val) => {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        if (overlay.parentNode) document.body.removeChild(overlay);
        resolve(val);
      }, 200);
    };

    document.getElementById('confirm-ok-btn').onclick = (e) => {
        e.stopPropagation();
        cleanup(true);
    };
    document.getElementById('confirm-cancel-btn').onclick = (e) => {
        e.stopPropagation();
        cleanup(false);
    };
    
    // Close on overlay click (if backdrop is enabled)
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };

    // Keyboard support
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', handleKey);
        cleanup(false);
      } else if (e.key === 'Enter') {
        window.removeEventListener('keydown', handleKey);
        cleanup(true);
      }
    };
    window.addEventListener('keydown', handleKey);
  });
}

export function showCustomAlert(message, options = {}) {
  const { title = 'Notification', buttonText = 'OK', type = 'info' } = options;
  
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';
    
    const accentColor = type === 'danger' ? 'var(--danger)' : 
                        type === 'warning' ? 'var(--warning)' : 'var(--accent)';
    
    overlay.innerHTML = `
      <div class="custom-confirm-card">
        <div class="custom-confirm-header" style="border-bottom-color: ${accentColor}">
          <span>${title}</span>
        </div>
        <div class="custom-confirm-body">
          <p>${message}</p>
        </div>
        <div class="custom-confirm-footer">
          <button class="custom-confirm-btn confirm" id="alert-ok-btn" style="background: ${accentColor}; flex: 1;">${buttonText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    const cleanup = () => {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        if (overlay.parentNode) document.body.removeChild(overlay);
        resolve();
      }, 200);
    };

    document.getElementById('alert-ok-btn').onclick = (e) => {
        e.stopPropagation();
        cleanup();
    };
    
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup();
    };

    const handleKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        window.removeEventListener('keydown', handleKey);
        cleanup();
      }
    };
    window.addEventListener('keydown', handleKey);
  });
}
