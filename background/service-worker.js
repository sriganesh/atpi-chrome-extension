// Debug logging with timestamps
let DEBUG = false; // Will be loaded from storage
const log = (...args) => {
  if (DEBUG) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${timestamp}] [ATPI Service Worker]`, ...args);
  }
};

// Load debug mode setting on startup
chrome.storage.sync.get(['debugMode'], (result) => {
  DEBUG = result.debugMode || false;
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.debugMode) {
    DEBUG = changes.debugMode.newValue || false;
  }
});

// Import the AT Protocol resolver and dependencies
try {
  importScripts(
    '../lib/config/pds-endpoints.js',
    '../lib/handle-resolvers/dns-resolver.js',
    '../lib/handle-resolvers/wellknown-resolver.js',
    '../lib/handle-resolvers/xrpc-resolver.js',
    '../lib/handle-resolvers/index.js',
    '../lib/atpi-resolver.js'
  );
  log('All scripts imported successfully');
} catch (error) {
  console.error('[ATPI Service Worker] Failed to import scripts:', error);
}

// Verify atpiResolver is available
if (typeof atpiResolver === 'undefined') {
  console.error('[ATPI Service Worker] atpiResolver is not defined!');
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log('Received message:', request.type, request);
  
  if (request.type === 'RESOLVE_URL') {
    // Check if atpiResolver is available
    if (typeof atpiResolver === 'undefined') {
      sendResponse({ error: 'Extension not properly initialized. Please reload the extension.' });
      return false;
    }
    
    handleUrlResolution(request.url, request.mode)
      .then(result => {
        log('Resolution successful:', result);
        sendResponse(result);
      })
      .catch(error => {
        log('Resolution error:', error.message);
        sendResponse({ error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});

// Handle URL resolution
async function handleUrlResolution(url, mode) {
  const startTime = Date.now();
  try {
    log('Resolving URL:', url, 'mode:', mode);
    
    const data = await atpiResolver.resolve(url, {
      mode: mode || 'local',
      timeout: 10000 // Increase to 10 second timeout
    });
    
    const duration = Date.now() - startTime;
    log(`Resolution successful in ${duration}ms`);
    
    return {
      data: data,
      mode: mode,
      timestamp: Date.now()
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    log(`Resolution failed after ${duration}ms:`, error.message);
    throw error;
  }
}

// Set default mode and debug setting on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ 
    mode: 'remote',
    debugMode: false 
  });
});