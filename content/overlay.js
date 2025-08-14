// Debug logging with timestamps
let DEBUG_OVERLAY = false; // Will be loaded from storage
const logOverlay = (...args) => {
  if (DEBUG_OVERLAY) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${timestamp}] [ATPI Overlay]`, ...args);
  }
};

// Load debug mode setting
chrome.storage.sync.get(['debugMode'], (result) => {
  DEBUG_OVERLAY = result.debugMode || false;
});

// Overlay management
let currentOverlay = null;
let hoverTimeout = null;
let currentMode = 'local';
let isPinned = false;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// Cache for resolved URLs (5 minute TTL) - separate for each mode
const urlCache = {
  local: new Map(),
  remote: new Map()
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Load current mode on startup
chrome.storage.sync.get(['mode'], (result) => {
  currentMode = result.mode || 'remote';
  logOverlay('Initial mode:', currentMode);
});

// Listen for mode changes
window.addEventListener('atpi-mode-changed', (event) => {
  currentMode = event.detail.mode;
  logOverlay('Mode changed to:', currentMode);
});

// Listen for debug mode changes
window.addEventListener('atpi-debug-mode-changed', (event) => {
  DEBUG_OVERLAY = event.detail.debugMode;
});

// Create overlay element
function createOverlay(x, y) {
  const overlay = document.createElement('div');
  overlay.className = 'atpi-overlay';
  overlay.style.position = 'fixed'; // Use fixed positioning
  
  // Initial positioning
  overlay.style.left = `${x}px`;
  overlay.style.top = `${y}px`;
  
  // Position adjustment to keep overlay on screen
  const adjustPosition = () => {
    const rect = overlay.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let newX = x;
    let newY = y;
    
    // Adjust horizontal position
    if (rect.right > viewportWidth) {
      newX = Math.max(10, viewportWidth - rect.width - 10);
    }
    if (newX < 10) {
      newX = 10;
    }
    
    // Adjust vertical position - prioritize keeping the header visible
    if (rect.bottom > viewportHeight) {
      // Position above the cursor if it would go below viewport
      newY = Math.max(10, y - rect.height - 20);
    }
    if (newY < 10) {
      // Ensure top is always visible
      newY = 10;
    }
    
    overlay.style.left = `${newX}px`;
    overlay.style.top = `${newY}px`;
  };
  
  setTimeout(adjustPosition, 0);
  
  return overlay;
}

// Format JSON for display
function formatJson(data) {
  try {
    return JSON.stringify(data, null, 2);
  } catch (error) {
    return 'Unable to format data';
  }
}

// Show loading state
function showLoading(overlay) {
  overlay.innerHTML = `
    <div class="atpi-overlay-loading">
      <span class="atpi-spinner"></span>
      Loading...
    </div>
  `;
}

// Show error state
function showError(overlay, error) {
  overlay.innerHTML = `
    <div class="atpi-overlay-header">
      <div class="atpi-overlay-title">❌ Error</div>
    </div>
    <div class="atpi-overlay-error">${error}</div>
  `;
}

// Show resolved data
function showData(overlay, url, data, mode) {
  const urlWithoutPrefix = url.replace(/^at:\/\//, '');
  
  overlay.innerHTML = `
    <div class="atpi-overlay-header" data-draggable="true">
      <div class="atpi-overlay-title">
        ✅ ATPI
        <span class="atpi-overlay-mode">${mode} mode</span>
      </div>
      <div class="atpi-overlay-controls">
        <button class="atpi-overlay-copy" title="Copy JSON">📋</button>
        <button class="atpi-overlay-pin ${isPinned ? 'pinned' : ''}" title="${isPinned ? 'Unpin' : 'Pin'} overlay">
          ${isPinned ? '📌' : '📍'}
        </button>
        <button class="atpi-overlay-close" title="Close overlay">✕</button>
      </div>
    </div>
    <div class="atpi-overlay-content">${formatJson(data)}</div>
    <div class="atpi-overlay-actions">
      <a href="https://atproto.at://${urlWithoutPrefix}" target="_blank" class="atpi-overlay-action">
        Open in atproto.at
      </a>
      <a href="https://atpi.at//${urlWithoutPrefix}" target="_blank" class="atpi-overlay-action secondary">
        Open in atpi.at
      </a>
    </div>
    <div class="atpi-overlay-resize-handle"></div>
  `;
  
  // Add event listeners for controls
  setupOverlayControls(overlay, data);
}

// Setup overlay controls (pin, close, drag, resize)
function setupOverlayControls(overlay, jsonData) {
  // Copy button
  const copyBtn = overlay.querySelector('.atpi-overlay-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const jsonString = JSON.stringify(jsonData, null, 2);
        await navigator.clipboard.writeText(jsonString);
        
        // Show feedback
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✅';
        copyBtn.title = 'Copied!';
        
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.title = 'Copy JSON';
        }, 2000);
      } catch (error) {
        console.error('Failed to copy:', error);
        copyBtn.textContent = '❌';
        setTimeout(() => {
          copyBtn.textContent = '📋';
        }, 2000);
      }
    });
  }
  
  // Pin button
  const pinBtn = overlay.querySelector('.atpi-overlay-pin');
  if (pinBtn) {
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isPinned = !isPinned;
      pinBtn.classList.toggle('pinned');
      pinBtn.textContent = isPinned ? '📌' : '📍';
      pinBtn.title = isPinned ? 'Unpin overlay' : 'Pin overlay';
    });
  }
  
  // Close button
  const closeBtn = overlay.querySelector('.atpi-overlay-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isPinned = false;
      overlay.remove();
      currentOverlay = null;
    });
  }
  
  // Draggable header
  const header = overlay.querySelector('.atpi-overlay-header');
  if (header) {
    header.addEventListener('mousedown', startDragging);
  }
  
  // Resize handle
  const resizeHandle = overlay.querySelector('.atpi-overlay-resize-handle');
  if (resizeHandle) {
    resizeHandle.addEventListener('mousedown', startResizing);
  }
}

// Dragging functionality
function startDragging(e) {
  if (e.target.closest('button')) return; // Don't drag when clicking buttons
  
  isDragging = true;
  const overlay = e.target.closest('.atpi-overlay');
  const rect = overlay.getBoundingClientRect();
  
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  
  overlay.style.cursor = 'grabbing';
  
  function handleMouseMove(e) {
    if (!isDragging) return;
    
    // For fixed positioning, use client coordinates
    let x = e.clientX - dragOffset.x;
    let y = e.clientY - dragOffset.y;
    
    // Keep overlay within viewport bounds
    const rect = overlay.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;
    
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));
    
    overlay.style.left = `${x}px`;
    overlay.style.top = `${y}px`;
  }
  
  function handleMouseUp() {
    isDragging = false;
    overlay.style.cursor = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  
  e.preventDefault();
}

// Resizing functionality
function startResizing(e) {
  const overlay = e.target.closest('.atpi-overlay');
  const startX = e.clientX;
  const startY = e.clientY;
  const startWidth = overlay.offsetWidth;
  const startHeight = overlay.offsetHeight;
  
  function handleMouseMove(e) {
    const newWidth = startWidth + (e.clientX - startX);
    const newHeight = startHeight + (e.clientY - startY);
    
    overlay.style.width = `${Math.max(400, newWidth)}px`;
    overlay.style.height = `${Math.max(300, newHeight)}px`;
  }
  
  function handleMouseUp() {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  
  e.preventDefault();
}

// Resolve URL via background script
async function resolveUrl(url) {
  const startTime = Date.now();
  
  // Check cache first (mode-specific)
  const modeCache = urlCache[currentMode];
  const cached = modeCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logOverlay(`Cache hit for ${url} in ${currentMode} mode (age: ${Date.now() - cached.timestamp}ms)`);
    return { data: cached.data, mode: currentMode, cached: true };
  }
  
  logOverlay(`Starting resolution for ${url} in ${currentMode} mode`);
  
  try {
    // Add timeout for the message
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout - please try again')), 10000);
    });
    
    logOverlay(`Sending message to background script...`);
    const messageSentTime = Date.now();
    
    const messagePromise = chrome.runtime.sendMessage({
      type: 'RESOLVE_URL',
      url: url,
      mode: currentMode
    });
    
    const response = await Promise.race([messagePromise, timeoutPromise]);
    
    const messageTime = Date.now() - messageSentTime;
    logOverlay(`Background script responded in ${messageTime}ms`);
    
    if (!response) {
      throw new Error('No response from extension - please reload the page');
    }
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    const duration = Date.now() - startTime;
    logOverlay(`Resolution completed in ${duration}ms for ${currentMode} mode`);
    
    // Cache the result in mode-specific cache
    modeCache.set(url, {
      data: response.data,
      mode: currentMode,
      timestamp: Date.now()
    });
    
    return { data: response.data, mode: currentMode, cached: false };
  } catch (error) {
    const duration = Date.now() - startTime;
    logOverlay(`Resolution failed after ${duration}ms:`, error.message);
    throw error;
  }
}

// Handle hover on AT URLs
async function handleHover(element, x, y) {
  const url = element.dataset.atUrl;
  if (!url) return;
  
  // If there's a pinned overlay, don't create a new one
  if (currentOverlay && isPinned) {
    return;
  }
  
  // Remove any existing overlay
  if (currentOverlay) {
    currentOverlay.remove();
  }
  
  // Reset pin state for new overlay
  isPinned = false;
  
  // Create new overlay
  currentOverlay = createOverlay(x + 10, y + 10);
  document.body.appendChild(currentOverlay);
  
  // Show loading state
  showLoading(currentOverlay);
  
  try {
    const result = await resolveUrl(url);
    // Check if overlay still exists (might have been removed while loading)
    if (currentOverlay && currentOverlay.isConnected) {
      showData(currentOverlay, url, result.data, result.mode);
    }
  } catch (error) {
    // Check if overlay still exists
    if (currentOverlay && currentOverlay.isConnected) {
      showError(currentOverlay, error.message);
    }
  }
}

// Setup hover listeners
function setupHoverListeners() {
  document.addEventListener('mouseover', (event) => {
    if (!event.target || !event.target.closest) return;
    
    // Check for our wrapped URLs
    const wrapper = event.target.closest('.atpi-url-wrapper');
    if (wrapper) {
      logOverlay('Hover over AT URL:', wrapper.dataset.atUrl);
      
      // Clear any existing timeout
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }
      
      // Delay before showing overlay (to avoid accidental hovers)
      hoverTimeout = setTimeout(() => {
        handleHover(wrapper, event.clientX, event.clientY);
      }, 300);
      return;
    }
    
    // Also check for existing links with AT URLs
    const link = event.target.closest('a');
    if (link && link.href) {
      // Check if the href or text content contains an AT URL
      const atUrlMatch = link.href.match(/at:\/\/[a-zA-Z0-9._:%-]+(?:\/[a-zA-Z0-9._-]+)*(?:\/[a-zA-Z0-9._~:@!$&'()*+,;=-]+)?/) ||
                         link.textContent.match(/at:\/\/[a-zA-Z0-9._:%-]+(?:\/[a-zA-Z0-9._-]+)*(?:\/[a-zA-Z0-9._~:@!$&'()*+,;=-]+)?/);
      
      if (atUrlMatch) {
        // Clear any existing timeout
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
        }
        
        // Create a temporary wrapper-like object for the existing link
        const tempWrapper = {
          dataset: { atUrl: atUrlMatch[0] }
        };
        
        // Delay before showing overlay
        hoverTimeout = setTimeout(() => {
          handleHover(tempWrapper, event.clientX, event.clientY);
        }, 300);
      }
    }
  });
  
  document.addEventListener('mouseout', (event) => {
    if (!event.target || !event.target.closest) return;
    
    // Check for our wrapped URLs or existing AT URL links
    const wrapper = event.target.closest('.atpi-url-wrapper');
    const link = event.target.closest('a');
    
    // If neither wrapper nor AT URL link, return
    if (!wrapper && !link) return;
    
    // For links, check if it contains an AT URL
    if (link && !wrapper) {
      const hasAtUrl = link.href.includes('at://') || link.textContent.includes('at://');
      if (!hasAtUrl) return;
    }
    
    // Clear hover timeout
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    
    // Check if mouse is moving to the overlay itself
    const relatedTarget = event.relatedTarget;
    if (relatedTarget && (
      relatedTarget.closest('.atpi-url-wrapper') ||
      relatedTarget.closest('.atpi-overlay') ||
      (relatedTarget.closest('a') && (relatedTarget.closest('a').href.includes('at://') || relatedTarget.closest('a').textContent.includes('at://')))
    )) {
      return;
    }
    
    // Add delay before removing overlay (2 seconds)
    if (currentOverlay && !isPinned) {
      setTimeout(() => {
        // Check if mouse is not over overlay or wrapper and not pinned
        const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
        if (!isPinned && (!hoveredElement || 
            (!hoveredElement.closest('.atpi-overlay') && 
             !hoveredElement.closest('.atpi-url-wrapper') &&
             !(hoveredElement.closest('a') && (hoveredElement.closest('a').href.includes('at://') || hoveredElement.closest('a').textContent.includes('at://')))))) {
          if (currentOverlay) {
            currentOverlay.remove();
            currentOverlay = null;
          }
        }
      }, 4000);
    }
  });
  
  // Handle mouseout from overlay itself
  document.addEventListener('mouseleave', (event) => {
    if (!event.target || !event.target.closest) return;
    if (!event.target.closest('.atpi-overlay')) return;
    
    // Delay to allow moving back to link (2 seconds)
    setTimeout(() => {
      if (isPinned) return; // Don't remove if pinned
      const hoveredElement = document.querySelector(':hover');
      if (!hoveredElement || (!hoveredElement.closest('.atpi-overlay') && !hoveredElement.closest('.atpi-url-wrapper'))) {
        if (currentOverlay) {
          currentOverlay.remove();
          currentOverlay = null;
        }
      }
    }, 2000);
  });
  
  // Also remove overlay when clicking anywhere
  document.addEventListener('click', (event) => {
    if (!event.target || !event.target.closest) return;
    if (currentOverlay && !event.target.closest('.atpi-overlay')) {
      currentOverlay.remove();
      currentOverlay = null;
    }
  });
}

// Clear cache function
function clearCache(mode = null) {
  if (mode) {
    const cleared = urlCache[mode].size;
    urlCache[mode].clear();
    logOverlay(`Cleared ${cleared} entries from ${mode} cache`);
  } else {
    const localCleared = urlCache.local.size;
    const remoteCleared = urlCache.remote.size;
    urlCache.local.clear();
    urlCache.remote.clear();
    logOverlay(`Cleared ${localCleared} entries from local cache and ${remoteCleared} entries from remote cache`);
  }
}

// Listen for cache clear messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CLEAR_CACHE') {
    clearCache();
    sendResponse({ success: true });
  }
});

// Initialize hover functionality
setupHoverListeners();
logOverlay('Overlay system initialized');