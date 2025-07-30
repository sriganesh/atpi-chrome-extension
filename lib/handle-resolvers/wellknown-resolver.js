/**
 * Well-known HTTP resolver for AT Protocol handles
 * Fetches from https://{handle}/.well-known/atproto-did
 */

class WellKnownHandleResolver {
  constructor(options = {}) {
    this.timeout = options.timeout || 3000;
  }

  async resolve(handle) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `https://${handle}/.well-known/atproto-did`;
      
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual', // Don't follow redirects for security
        headers: {
          'Accept': 'text/plain'
        }
      });

      clearTimeout(timeoutId);

      // Check for redirects (not allowed for security)
      if (response.status >= 300 && response.status < 400) {
        throw new Error('Redirects not allowed for well-known resolution');
      }

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`No well-known record found for handle: ${handle}`);
        }
        throw new Error(`HTTP ${response.status}: Failed to fetch well-known`);
      }

      const text = await response.text();
      const did = this.parseResponse(text, handle);

      return {
        did,
        method: 'wellknown'
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Well-known fetch timeout');
      }
      throw error;
    }
  }

  parseResponse(text, handle) {
    // Response should be a single line with the DID
    const did = text.trim().split('\n')[0];

    if (!did) {
      throw new Error(`Empty well-known response for handle: ${handle}`);
    }

    // Validate DID format
    if (!this.isValidDid(did)) {
      throw new Error(`Invalid DID in well-known response: ${did}`);
    }

    return did;
  }

  isValidDid(did) {
    // Basic DID validation
    return did && (did.startsWith('did:plc:') || did.startsWith('did:web:'));
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WellKnownHandleResolver;
} else {
  const global = typeof globalThis !== 'undefined' ? globalThis : self;
  global.WellKnownHandleResolver = WellKnownHandleResolver;
}