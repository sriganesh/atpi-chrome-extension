// Debug logging with timestamps
let DEBUG = false; // Will be loaded from storage
const log = (...args) => {
  if (DEBUG) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${timestamp}] [ATPI Popup]`, ...args);
  }
};

// Start loading immediately without waiting for DOMContentLoaded
const initStartTime = Date.now();

// Load and save resolution mode
async function initializePopup() {
  log('Popup initialization started');
  
  const status = document.getElementById('status');
  const clearCacheBtn = document.getElementById('clear-cache');
  
  // Check if elements exist
  if (!status || !clearCacheBtn) {
    console.error('[ATPI Popup] Required elements not found');
    return;
  }
  
  // Load current mode and debug setting
  try {
    const result = await chrome.storage.sync.get(['mode', 'debugMode']);
    
    // Set debug mode
    DEBUG = result.debugMode || false;
    const debugCheckbox = document.getElementById('debug-mode');
    if (debugCheckbox) {
      debugCheckbox.checked = DEBUG;
    }
    
    log('Storage result:', result);
    
    const mode = result.mode || 'remote';
    const modeRadio = document.getElementById(mode);
    
    if (modeRadio) {
      modeRadio.checked = true;
      status.textContent = `Mode: ${mode}`;
    } else {
      console.error(`[ATPI Popup] Radio button for mode '${mode}' not found`);
      status.textContent = 'Error: UI elements missing';
    }
  } catch (error) {
    console.error('[ATPI Popup] Error loading settings:', error);
    status.textContent = 'Error loading settings';
  }
  
  // Handle mode change
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const newMode = e.target.value;
      log('Mode changed to:', newMode);
      
      try {
        await chrome.storage.sync.set({ mode: newMode });
        status.textContent = `Mode: ${newMode}`;
        
        // Notify content scripts of mode change
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            type: 'MODE_CHANGED', 
            mode: newMode 
          }).catch(err => {
            // Content script may not be loaded on this page
            log('Could not notify content script:', err.message);
          });
        }
      } catch (error) {
        console.error('[ATPI Popup] Error saving settings:', error);
        status.textContent = 'Error saving settings';
      }
    });
  });
  
  // Handle clear cache
  clearCacheBtn.addEventListener('click', async () => {
    log('Clear cache clicked');
    
    try {
      // Clear chrome storage
      await chrome.storage.local.clear();
      log('Chrome storage cleared');
      
      // Notify content scripts to clear their caches
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'CLEAR_CACHE' 
        }).then(() => {
          log('Content script cache cleared');
        }).catch(err => {
          log('Could not clear content script cache:', err.message);
        });
      }
      
      status.textContent = 'Cache cleared';
      
      setTimeout(() => {
        const checkedRadio = document.querySelector('input[name="mode"]:checked');
        if (checkedRadio) {
          const currentMode = checkedRadio.value;
          status.textContent = `Mode: ${currentMode}`;
        }
      }, 2000);
    } catch (error) {
      console.error('[ATPI Popup] Error clearing cache:', error);
      status.textContent = 'Error clearing cache';
    }
  });
  
  // Handle debug mode toggle
  const debugCheckbox = document.getElementById('debug-mode');
  if (debugCheckbox) {
    debugCheckbox.addEventListener('change', async (e) => {
      DEBUG = e.target.checked;
      
      try {
        await chrome.storage.sync.set({ debugMode: DEBUG });
        
        // Notify all tabs to update debug mode
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            type: 'DEBUG_MODE_CHANGED', 
            debugMode: DEBUG 
          }).catch(() => {
            // Ignore errors for tabs without content scripts
          });
        });
        
        log('Debug mode changed to:', DEBUG);
      } catch (error) {
        console.error('[ATPI Popup] Error saving debug mode:', error);
      }
    });
  }
  
  const initDuration = Date.now() - initStartTime;
  log(`Popup fully initialized in ${initDuration}ms`);
}

// Initialize as soon as possible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  // DOM already loaded
  initializePopup();
}

// Add error handler for runtime errors
window.addEventListener('error', (event) => {
  console.error('[ATPI Popup] Uncaught error:', event.error);
});