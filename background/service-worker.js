// Import the AT Protocol resolver and dependencies
importScripts(
  '../lib/config/pds-endpoints.js',
  '../lib/handle-resolvers/dns-resolver.js',
  '../lib/handle-resolvers/wellknown-resolver.js',
  '../lib/handle-resolvers/xrpc-resolver.js',
  '../lib/handle-resolvers/index.js',
  '../lib/atpi-resolver.js'
);

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'RESOLVE_URL') {
    handleUrlResolution(request.url, request.mode)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep message channel open for async response
  }
});

// Handle URL resolution
async function handleUrlResolution(url, mode) {
  try {
    const data = await atpiResolver.resolve(url, {
      mode: mode || 'local',
      timeout: 5000 // 5 second timeout for hover
    });
    
    return {
      data: data,
      mode: mode,
      timestamp: Date.now()
    };
  } catch (error) {
    throw error;
  }
}

// Set default mode on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ mode: 'local' });
});