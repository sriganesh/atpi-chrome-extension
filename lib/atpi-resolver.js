// AT Protocol resolver for browser environment
const atpiResolver = (() => {
  const DEFAULT_TIMEOUT = 30000;
  const DEFAULT_BASE_URL = 'https://atpi.';
  
  // Initialize unified handle resolver
  const global = typeof globalThis !== 'undefined' ? globalThis : self;
  const handleResolver = new global.UnifiedHandleResolver({
    dns: { timeout: 3000 },
    wellKnown: { timeout: 3000 },
    xrpc: { timeout: 5000 },
    cacheTTL: 5 * 60 * 1000 // 5 minutes
  });
  
  // Cache for DID resolutions
  const didCache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // Validate AT URL format
  function validateUrl(url) {
    if (!url.startsWith('at://')) {
      throw new Error('URL must start with at://');
    }
    
    const parts = url.substring(5).split('/');
    if (parts.length < 1) {
      throw new Error('Invalid AT URL format');
    }
    
    return {
      identifier: parts[0],
      collection: parts[1] || null,
      rkey: parts[2] || null
    };
  }
  
  // Parse DID or handle
  function parseIdentifier(identifier) {
    if (identifier.startsWith('did:')) {
      return { type: 'did', value: identifier };
    } else {
      return { type: 'handle', value: identifier };
    }
  }
  
  // Resolve handle to DID using unified resolver
  async function resolveHandle(handle, timeout) {
    try {
      const result = await handleResolver.resolve(handle);
      return result.did;
    } catch (error) {
      // Re-throw with a more user-friendly message
      if (error.message.includes('Failed to resolve handle')) {
        throw new Error(`Handle "${handle}" not found - user may not exist`);
      }
      throw error;
    }
  }
  
  // Resolve DID to service endpoint
  async function resolveDid(did, timeout) {
    // Check cache
    const cached = didCache.get(did);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.serviceEndpoint;
    }
    
    // For plc DIDs, use plc.directory
    if (did.startsWith('did:plc:')) {
      const response = await fetchWithTimeout(
        `https://plc.directory/${did}`,
        { timeout }
      );
      
      if (!response.ok) {
        throw new Error(`DID "${did}" not found or inaccessible`);
      }
      
      const data = await response.json();
      const service = data.service?.find(s => s.type === 'AtprotoPersonalDataServer');
      
      if (!service?.serviceEndpoint) {
        throw new Error(`No AT Protocol server found for this DID`);
      }
      
      // Cache the result
      didCache.set(did, {
        serviceEndpoint: service.serviceEndpoint,
        timestamp: Date.now()
      });
      
      return service.serviceEndpoint;
    }
    
    // For web DIDs, extract from the DID itself
    if (did.startsWith('did:web:')) {
      const domain = did.substring(8).replace(/:/g, '/');
      return `https://${domain}`;
    }
    
    throw new Error(`Unsupported DID method: ${did}`);
  }
  
  // Fetch with timeout
  async function fetchWithTimeout(url, options = {}) {
    const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }
  
  // Local resolution
  async function resolveLocal(url, options = {}) {
    const { timeout = DEFAULT_TIMEOUT } = options;
    const parsed = validateUrl(url);
    const identifier = parseIdentifier(parsed.identifier);
    
    let did = identifier.value;
    
    // Resolve handle to DID if needed
    if (identifier.type === 'handle') {
      did = await resolveHandle(identifier.value, timeout);
    }
    
    // Resolve DID to service endpoint
    const serviceEndpoint = await resolveDid(did, timeout);
    
    // Build XRPC URL
    let xrpcUrl;
    if (parsed.collection && parsed.rkey) {
      // Get specific record
      xrpcUrl = `${serviceEndpoint}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=${parsed.collection}&rkey=${parsed.rkey}`;
    } else if (parsed.collection) {
      // List records in collection
      xrpcUrl = `${serviceEndpoint}/xrpc/com.atproto.repo.listRecords?repo=${did}&collection=${parsed.collection}&limit=50`;
    } else {
      // Get repo info
      xrpcUrl = `${serviceEndpoint}/xrpc/com.atproto.repo.describeRepo?repo=${did}`;
    }
    
    // Fetch data
    const response = await fetchWithTimeout(xrpcUrl, { timeout });
    
    if (!response.ok) {
      // Provide more helpful error messages
      if (response.status === 400) {
        throw new Error('Invalid AT Protocol URL or record not found');
      } else if (response.status === 404) {
        throw new Error('Record not found at this AT Protocol URL');
      } else if (response.status === 401 || response.status === 403) {
        throw new Error('Access denied - this record may be private');
      } else if (response.status >= 500) {
        throw new Error('Server error - the AT Protocol service is unavailable');
      } else {
        throw new Error(`Failed to resolve URL (HTTP ${response.status})`);
      }
    }
    
    return response.json();
  }
  
  // Remote resolution
  async function resolveRemote(url, options = {}) {
    const { timeout = DEFAULT_TIMEOUT, baseUrl = DEFAULT_BASE_URL } = options;
    
    // Transform at:// to https://atpi.at://
    const transformedUrl = url.replace(/^at:\/\//, baseUrl + 'at://');
    
    const response = await fetchWithTimeout(transformedUrl, {
      timeout,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      // Provide more helpful error messages for remote mode too
      if (response.status === 400) {
        throw new Error('Invalid AT Protocol URL or record not found');
      } else if (response.status === 404) {
        throw new Error('Record not found at this AT Protocol URL');
      } else if (response.status === 401 || response.status === 403) {
        throw new Error('Access denied - this record may be private');
      } else if (response.status >= 500) {
        throw new Error('ATPI service error - please try again later');
      } else {
        throw new Error(`Failed to resolve URL (HTTP ${response.status})`);
      }
    }
    
    return response.json();
  }
  
  // Main resolver function
  async function resolve(url, options = {}) {
    const { mode = 'local' } = options;
    
    if (mode === 'remote') {
      return resolveRemote(url, options);
    } else if (mode === 'local') {
      // In local mode, never fall back to remote
      return resolveLocal(url, options);
    } else {
      // Auto mode: try local first, fallback to remote
      try {
        return await resolveLocal(url, options);
      } catch (error) {
        return resolveRemote(url, options);
      }
    }
  }
  
  // Clear caches
  function clearCaches() {
    didCache.clear();
    if (handleResolver && handleResolver.clearCache) {
      handleResolver.clearCache();
    }
  }
  
  return {
    resolve,
    clearCaches
  };
})();