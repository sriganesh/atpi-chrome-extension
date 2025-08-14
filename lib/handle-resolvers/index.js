/**
 * Unified AT Protocol handle resolver
 * Implements the decentralized resolution strategy:
 * 1. DNS (most decentralized)
 * 2. Well-known HTTP
 * 3. XRPC with regional fallback
 */

class UnifiedHandleResolver {
  constructor(options = {}) {
    const global = typeof globalThis !== 'undefined' ? globalThis : self;
    this.dnsResolver = new global.DnsHandleResolver(options.dns || {});
    this.wellKnownResolver = new global.WellKnownHandleResolver(options.wellKnown || {});
    this.xrpcResolver = new global.XrpcHandleResolver(options.xrpc || {});
    
    // Cache configuration
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 5 * 60 * 1000; // 5 minutes default
  }

  async resolve(handle) {
    // Check cache first
    const cached = this.getFromCache(handle);
    if (cached) {
      console.debug(`Handle resolved from cache: ${handle} -> ${cached.did}`);
      return cached;
    }

    let result = null;
    const errors = [];
    const startTime = Date.now();

    // For .bsky.social handles, skip DNS and go straight to XRPC for better performance
    const isBskyHandle = handle.endsWith('.bsky.social');
    
    // Try DNS resolution first (most decentralized) - but skip for bsky.social
    if (!isBskyHandle) {
      try {
        console.debug(`Attempting DNS resolution for handle: ${handle}`);
        const dnsStart = Date.now();
        result = await this.dnsResolver.resolve(handle);
        console.log(`Handle resolved via DNS: ${handle} -> ${result.did} (${Date.now() - dnsStart}ms)`);
      } catch (error) {
        console.debug(`DNS resolution failed after ${Date.now() - startTime}ms: ${error.message}`);
        errors.push({ method: 'dns', error: error.message });
      }
    }

    // Try well-known HTTP resolution - also skip for bsky.social
    if (!result && !isBskyHandle) {
      try {
        console.debug(`Attempting well-known resolution for handle: ${handle}`);
        const wellKnownStart = Date.now();
        result = await this.wellKnownResolver.resolve(handle);
        console.log(`Handle resolved via well-known: ${handle} -> ${result.did} (${Date.now() - wellKnownStart}ms)`);
      } catch (error) {
        console.debug(`Well-known resolution failed after ${Date.now() - startTime}ms total: ${error.message}`);
        errors.push({ method: 'wellknown', error: error.message });
      }
    }

    // Try XRPC as last resort
    if (!result) {
      try {
        console.debug(`Attempting XRPC resolution for handle: ${handle}`);
        const xrpcStart = Date.now();
        result = await this.xrpcResolver.resolve(handle);
        console.log(`Handle resolved via XRPC: ${handle} -> ${result.did} (${Date.now() - xrpcStart}ms)`);
      } catch (error) {
        console.debug(`XRPC resolution failed after ${Date.now() - startTime}ms total: ${error.message}`);
        errors.push({ method: 'xrpc', error: error.message });
      }
    }

    if (!result) {
      const errorDetails = errors.map(e => `${e.method}: ${e.error}`).join(', ');
      throw new Error(`Failed to resolve handle "${handle}" - ${errorDetails}`);
    }

    // Cache the result
    this.cacheResult(handle, result);
    
    return result;
  }

  getFromCache(handle) {
    const cached = this.cache.get(handle);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheTTL) {
      this.cache.delete(handle);
      return null;
    }

    return cached.data;
  }

  cacheResult(handle, result) {
    this.cache.set(handle, {
      data: result,
      timestamp: Date.now()
    });

    // Limit cache size to prevent memory issues
    if (this.cache.size > 1000) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 20%
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnifiedHandleResolver;
} else {
  const global = typeof globalThis !== 'undefined' ? globalThis : self;
  global.UnifiedHandleResolver = UnifiedHandleResolver;
}