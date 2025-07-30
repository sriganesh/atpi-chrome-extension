// Load and save resolution mode
document.addEventListener('DOMContentLoaded', async () => {
  const status = document.getElementById('status');
  const clearCacheBtn = document.getElementById('clear-cache');
  
  // Load current mode
  try {
    const result = await chrome.storage.sync.get(['mode']);
    const mode = result.mode || 'local';
    document.getElementById(mode).checked = true;
    status.textContent = `Mode: ${mode}`;
  } catch (error) {
    status.textContent = 'Error loading settings';
  }
  
  // Handle mode change
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const newMode = e.target.value;
      try {
        await chrome.storage.sync.set({ mode: newMode });
        status.textContent = `Mode: ${newMode}`;
        
        // Notify content scripts of mode change
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            type: 'MODE_CHANGED', 
            mode: newMode 
          });
        }
      } catch (error) {
        status.textContent = 'Error saving settings';
      }
    });
  });
  
  // Handle clear cache
  clearCacheBtn.addEventListener('click', async () => {
    try {
      await chrome.storage.local.clear();
      status.textContent = 'Cache cleared';
      setTimeout(() => {
        const currentMode = document.querySelector('input[name="mode"]:checked').value;
        status.textContent = `Mode: ${currentMode}`;
      }, 2000);
    } catch (error) {
      status.textContent = 'Error clearing cache';
    }
  });
});