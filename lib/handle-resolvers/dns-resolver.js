/**
 * DNS-over-HTTPS resolver for AT Protocol handles
 * Queries _atproto.{handle} TXT records to find DIDs
 */

const DOH_PROVIDERS = [
  {
    name: 'Google',
    url: 'https://dns.google/resolve',
    acceptHeader: 'application/dns-json'
  },
  {
    name: 'Cloudflare',
    url: 'https://cloudflare-dns.com/dns-query',
    acceptHeader: 'application/dns-json'
  }
];

const ATPROTO_PREFIX = '_atproto.';
const DID_PREFIX = 'did=';

class DnsHandleResolver {
  constructor(options = {}) {
    this.timeout = options.timeout || 3000;
    this.providers = options.providers || DOH_PROVIDERS;
  }

  async resolve(handle) {
    // Try each DoH provider in parallel
    const promises = this.providers.map(provider => 
      this.queryProvider(provider, handle).catch(() => null)
    );

    // Race all providers and return first successful result
    const results = await Promise.allSettled(promises);
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
    }

    throw new Error(`DNS resolution failed for handle: ${handle}`);
  }

  async queryProvider(provider, handle) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = new URL(provider.url);
      url.searchParams.set('name', `${ATPROTO_PREFIX}${handle}`);
      url.searchParams.set('type', 'TXT');

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'Accept': provider.acceptHeader
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`DNS query failed: ${response.status}`);
      }

      const data = await response.json();
      return this.parseDnsResponse(data, handle);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('DNS query timeout');
      }
      throw error;
    }
  }

  parseDnsResponse(data, handle) {
    // Check DNS response status
    if (data.Status !== 0) {
      if (data.Status === 3) { // NXDOMAIN
        throw new Error(`No DNS record found for handle: ${handle}`);
      }
      throw new Error(`DNS error: ${data.Status}`);
    }

    // Look for TXT records with did= prefix
    const answers = data.Answer || [];
    for (const answer of answers) {
      if (answer.type === 16) { // TXT record
        let txtData = answer.data;
        
        // Remove quotes if present
        if (txtData.startsWith('"') && txtData.endsWith('"')) {
          txtData = txtData.slice(1, -1);
        }
        
        // Check for did= prefix
        if (txtData.startsWith(DID_PREFIX)) {
          const did = txtData.substring(DID_PREFIX.length);
          
          // Validate DID format
          if (this.isValidDid(did)) {
            return {
              did,
              method: 'dns',
              provider: data.provider || 'unknown'
            };
          }
        }
      }
    }

    throw new Error(`No valid DID found in DNS records for handle: ${handle}`);
  }

  isValidDid(did) {
    // Basic DID validation
    return did && (did.startsWith('did:plc:') || did.startsWith('did:web:'));
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DnsHandleResolver;
} else {
  const global = typeof globalThis !== 'undefined' ? globalThis : self;
  global.DnsHandleResolver = DnsHandleResolver;
}