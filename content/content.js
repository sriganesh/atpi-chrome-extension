// Debug logging with timestamps
let DEBUG = false; // Will be loaded from storage
const log = (...args) => {
  if (DEBUG) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${timestamp}] [ATPI Content]`, ...args);
  }
};

// Load debug mode setting
chrome.storage.sync.get(['debugMode'], (result) => {
  DEBUG = result.debugMode || false;
});

// AT Protocol URL pattern
const AT_URL_PATTERN = /at:\/\/([a-zA-Z0-9._:%-]+(?:\/[a-zA-Z0-9._-]+)*(?:\/[a-zA-Z0-9._~:@!$&'()*+,;=-]+)?)/g;

// Process text nodes to find and wrap AT URLs
function processTextNode(textNode) {
  const text = textNode.nodeValue;
  if (!text || !text.includes('at://')) return;
  
  const matches = [...text.matchAll(AT_URL_PATTERN)];
  if (matches.length === 0) return;
  
  const parent = textNode.parentNode;
  // Check if parent exists and textNode is still in DOM
  if (!parent || !parent.contains(textNode)) return;
  
  // Skip if already wrapped or inside our own link
  if (parent.classList && parent.classList.contains('atpi-url-wrapper')) return;
  if (parent.classList && parent.classList.contains('atpi-url-link')) return;
  
  // Skip if inside any <a> tag (don't modify existing links)
  if (parent.closest('a')) return;
  
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  
  matches.forEach(match => {
    const url = match[0];
    const startIndex = match.index;
    
    // Add text before the URL
    if (startIndex > lastIndex) {
      fragment.appendChild(
        document.createTextNode(text.substring(lastIndex, startIndex))
      );
    }
    
    // Create wrapper for the AT URL
    const wrapper = document.createElement('span');
    wrapper.className = 'atpi-url-wrapper';
    wrapper.dataset.atUrl = url;
    
    // Create the clickable link
    const link = document.createElement('a');
    link.href = `https://atproto.at://${url.substring(5)}`; // Remove at:// prefix
    link.textContent = url;
    link.className = 'atpi-url-link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    
    // Prevent default behavior and handle click
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(link.href, '_blank');
    });
    
    wrapper.appendChild(link);
    fragment.appendChild(wrapper);
    
    lastIndex = startIndex + url.length;
  });
  
  // Add remaining text
  if (lastIndex < text.length) {
    fragment.appendChild(
      document.createTextNode(text.substring(lastIndex))
    );
  }
  
  // Replace the text node with the fragment
  // Double-check parent and textNode still exist
  if (parent && parent.contains(textNode)) {
    try {
      parent.replaceChild(fragment, textNode);
    } catch (error) {
      console.warn('Failed to replace text node:', error);
    }
  }
}

// Check if element should be skipped
function shouldSkipElement(element) {
  // Skip certain tags
  const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'INPUT', 'TEXTAREA', 'SELECT'];
  if (skipTags.includes(element.tagName)) return true;
  
  // Skip contenteditable elements
  if (element.contentEditable === 'true' || element.isContentEditable) return true;
  
  // Skip elements with textbox role (common in chat interfaces)
  if (element.getAttribute('role') === 'textbox') return true;
  
  // Skip known chat compose areas
  const skipClasses = ['composer', 'message-input', 'chat-input', 'ProseMirror', 'DraftEditor'];
  // Convert className to string (handles SVGAnimatedString and other types)
  const elementClasses = (element.className && typeof element.className === 'string') 
    ? element.className 
    : (element.className?.baseVal || element.getAttribute('class') || '');
  if (typeof elementClasses === 'string' && skipClasses.some(cls => elementClasses.includes(cls))) return true;
  
  return false;
}

// Walk through all text nodes in an element
function walkTextNodes(element) {
  if (element.nodeType === Node.TEXT_NODE) {
    processTextNode(element);
  } else if (element.nodeType === Node.ELEMENT_NODE) {
    // Skip certain elements
    if (shouldSkipElement(element)) return;
    
    // Process child nodes (copy to array to avoid mutation issues)
    const childNodes = [...element.childNodes];
    childNodes.forEach(child => walkTextNodes(child));
  }
}

// Initial processing of the page
function processPage() {
  log('Processing page for AT URLs');
  walkTextNodes(document.body);
}

// Debounce function for performance
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Batch process mutations
let pendingMutations = [];
const processPendingMutations = debounce(() => {
  const mutations = [...pendingMutations];
  pendingMutations = [];
  
  mutations.forEach(mutation => {
    // Process added nodes
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
        // Skip if node is inside an editable element
        const editableParent = node.nodeType === Node.ELEMENT_NODE ? 
          node.closest('[contenteditable="true"], input, textarea, [role="textbox"]') :
          node.parentElement?.closest('[contenteditable="true"], input, textarea, [role="textbox"]');
        
        if (!editableParent) {
          walkTextNodes(node);
        }
      }
    });
    
    // Also check if text content was changed
    if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
      // Skip if inside editable element
      const editableParent = mutation.target.parentElement?.closest('[contenteditable="true"], input, textarea, [role="textbox"]');
      if (!editableParent) {
        processTextNode(mutation.target);
      }
    }
  });
}, 100); // Process mutations every 100ms

// Observe DOM changes for new content
const observer = new MutationObserver((mutations) => {
  pendingMutations.push(...mutations);
  processPendingMutations();
});

// Start observing when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    processPage();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });
    // Reprocess after a delay for dynamic content
    setTimeout(processPage, 1000);
  });
} else {
  processPage();
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  // Reprocess after a delay for dynamic content
  setTimeout(processPage, 1000);
}

// Listen for mode changes from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'MODE_CHANGED') {
    log('Mode changed to:', request.mode);
    // Notify overlay system of mode change
    window.dispatchEvent(new CustomEvent('atpi-mode-changed', { 
      detail: { mode: request.mode } 
    }));
  } else if (request.type === 'DEBUG_MODE_CHANGED') {
    DEBUG = request.debugMode;
    // Notify overlay system of debug mode change
    window.dispatchEvent(new CustomEvent('atpi-debug-mode-changed', { 
      detail: { debugMode: request.debugMode } 
    }));
  }
});

// Log when content script loads
log('Content script loaded');