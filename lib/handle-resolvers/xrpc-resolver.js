/**
 * XRPC resolver for AT Protocol handles
 * Uses com.atproto.identity.resolveHandle endpoint with regional fallback
 */

class XrpcHandleResolver {
  constructor(options = {}) {
    const global = typeof globalThis !== 'undefined' ? globalThis : self;
    this.timeout = options.timeout || 5000;
    this.pdsEndpoints = options.pdsEndpoints || global.PDS_ENDPOINTS;
    this.getAllServers = options.getAllServers || global.getAllServers;
    this.getRandomServerFromAll = options.getRandomServerFromAll || global.getRandomServerFromAll;
  }

  async resolve(handle) {
    // Try primary endpoint first
    try {
      const result = await this.queryEndpoint(this.pdsEndpoints.primary, handle);
      if (result) return result;
    } catch (error) {
      console.debug('Primary endpoint failed:', error.message);
    }

    // Get all available servers
    const allServers = this.getAllServers();
    if (!allServers || allServers.length === 0) {
      throw new Error('No PDS servers available');
    }

    // Try up to 5 random servers from the pool
    const attempts = Math.min(5, allServers.length);
    const triedServers = new Set();

    for (let i = 0; i < attempts; i++) {
      let server;
      
      // Get a random server we haven't tried yet
      do {
        server = this.getRandomServerFromAll();
      } while (triedServers.has(server) && triedServers.size < allServers.length);

      if (!server || triedServers.has(server)) break;
      triedServers.add(server);

      try {
        const result = await this.queryEndpoint(`https://${server}`, handle);
        if (result) return result;
      } catch (error) {
        console.debug(`Server ${server} failed:`, error.message);
      }
    }

    throw new Error(`XRPC resolution failed for handle: ${handle}`);
  }

  async queryEndpoint(baseUrl, handle) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `${baseUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`;
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 400) {
          const error = await response.json().catch(() => ({}));
          if (error.error === 'InvalidHandle') {
            throw new Error(`Invalid handle format: ${handle}`);
          }
          throw new Error(`Handle not found: ${handle}`);
        }
        throw new Error(`HTTP ${response.status}: XRPC query failed`);
      }

      const data = await response.json();
      const did = this.parseResponse(data, handle);

      return {
        did,
        method: 'xrpc',
        endpoint: baseUrl
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('XRPC query timeout');
      }
      throw error;
    }
  }

  parseResponse(data, handle) {
    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid XRPC response for handle: ${handle}`);
    }

    const did = data.did;
    if (!did) {
      throw new Error(`No DID in XRPC response for handle: ${handle}`);
    }

    // Validate DID format
    if (!this.isValidDid(did)) {
      throw new Error(`Invalid DID in XRPC response: ${did}`);
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
  module.exports = XrpcHandleResolver;
} else {
  const global = typeof globalThis !== 'undefined' ? globalThis : self;
  global.XrpcHandleResolver = XrpcHandleResolver;
}