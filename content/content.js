// AT Protocol URL pattern
const AT_URL_PATTERN = /at:\/\/([a-zA-Z0-9._:%-]+(?:\/[a-zA-Z0-9._-]+)*(?:\/[a-zA-Z0-9._~:@!$&'()*+,;=-]+)?)/g;

// Process text nodes to find and wrap AT URLs
function processTextNode(textNode) {
  const text = textNode.nodeValue;
  if (!text || !text.includes('at://')) return;
  
  const matches = [...text.matchAll(AT_URL_PATTERN)];
  if (matches.length === 0) return;
  
  const parent = textNode.parentNode;
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
  parent.replaceChild(fragment, textNode);
}

// Walk through all text nodes in an element
function walkTextNodes(element) {
  if (element.nodeType === Node.TEXT_NODE) {
    processTextNode(element);
  } else if (element.nodeType === Node.ELEMENT_NODE) {
    // Skip certain elements
    const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'A'];
    if (skipTags.includes(element.tagName)) return;
    
    // Process child nodes (copy to array to avoid mutation issues)
    const childNodes = [...element.childNodes];
    childNodes.forEach(child => walkTextNodes(child));
  }
}

// Initial processing of the page
function processPage() {
  walkTextNodes(document.body);
}

// Observe DOM changes for new content
const observer = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    // Process added nodes
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
        walkTextNodes(node);
      }
    });
    
    // Also check if text content was changed
    if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
      processTextNode(mutation.target);
    }
  });
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
    // Notify overlay system of mode change
    window.dispatchEvent(new CustomEvent('atpi-mode-changed', { 
      detail: { mode: request.mode } 
    }));
  }
});